import { Router } from 'express';
import { z } from 'zod';
import { BroadcastMessage } from '../../models/BroadcastMessage.js';
import { body, isId, bad } from './helpers.js';
import { audit } from '../../services/audit.js';
import { hub } from '../../realtime/hub.js';

const router = Router();

const createSchema = z.object({
  type: z.enum(['inbox', 'announcement', 'notification']),
  category: z.string().trim().max(50).default('Cadence Team'),
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(200, 'Title cannot exceed 200 characters.'),
  content: z.string().trim().min(2, 'Content must be at least 2 characters.').max(5000, 'Content cannot exceed 5000 characters.'),
  severity: z.enum(['info', 'success', 'warning', 'urgent']).default('info')
});

router.get('/', async (req, res) => {
  const rows = await BroadcastMessage.find().sort({ createdAt: -1 }).limit(100).lean();
  const items = rows.map(r => ({
    id: String(r._id),
    type: r.type,
    category: r.category || 'Cadence Team',
    title: r.title,
    content: r.content,
    severity: r.severity || 'info',
    author: r.author || 'Admin',
    active: r.active,
    createdAt: r.createdAt
  }));

  const counts = {
    total: items.length,
    inbox: items.filter(i => i.type === 'inbox').length,
    announcements: items.filter(i => i.type === 'announcement').length,
    notifications: items.filter(i => i.type === 'notification').length
  };

  res.json({ items, counts });
});

router.post('/', async (req, res) => {
  const d = body(createSchema, req, res);
  if (!d) return;

  const doc = await BroadcastMessage.create({
    type: d.type,
    category: d.category || 'Cadence Team',
    title: d.title,
    content: d.content,
    severity: d.severity || 'info',
    author: req.user.username || 'Cadence Admin',
    createdBy: req.user._id,
    active: true
  });

  // Notify any currently connected clients in realtime via WebSockets
  const payload = {
    type: 'broadcast_message',
    message: {
      id: String(doc._id),
      type: doc.type,
      category: doc.category,
      title: doc.title,
      content: doc.content,
      severity: doc.severity,
      author: doc.author,
      time: 'Just now',
      createdAt: doc.createdAt.toISOString()
    }
  };

  try {
    hub.forEachSocket(ws => {
      try {
        if (ws.readyState === 1) ws.send(JSON.stringify(payload));
      } catch {}
    });
  } catch (err) {
    console.warn('Realtime broadcast error:', err);
  }

  await audit({
    actor: req.user,
    action: 'CREATE_BROADCAST',
    targetType: 'broadcast',
    targetId: doc._id,
    targetLabel: `${d.type.toUpperCase()}: "${d.title}"`,
    metadata: { type: d.type, category: d.category, title: d.title },
    req
  }).catch(() => {});

  res.status(201).json({
    ok: true,
    item: {
      id: String(doc._id),
      type: doc.type,
      category: doc.category,
      title: doc.title,
      content: doc.content,
      severity: doc.severity,
      author: doc.author,
      createdAt: doc.createdAt
    }
  });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return bad(res, 'Invalid broadcast message ID.', 400);

  const doc = await BroadcastMessage.findById(id);
  if (!doc) return bad(res, 'Broadcast message not found.', 404);

  await BroadcastMessage.deleteOne({ _id: id });

  await audit({
    actor: req.user,
    action: 'DELETE_BROADCAST',
    targetType: 'broadcast',
    targetId: id,
    targetLabel: `Deleted broadcast "${doc.title}"`,
    req
  }).catch(() => {});

  res.json({ ok: true });
});

export default router;
