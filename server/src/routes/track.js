import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getSettings } from '../services/settings.js';
import { recordPageView, recordHeartbeat, recordLeave, shouldTrack } from '../services/tracking.js';
import { captureError } from '../services/monitoring.js';
import { parseUserAgent } from '../utils/privacy.js';

/** /api/t: the first-party analytics beacon. Small, validated payloads; nothing personal. */
const router = Router();
const limiter = (limit) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Slow down.' } });

const id = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const pageView = z.object({
  vid: id, sid: id,
  path: z.string().max(200),
  referrer: z.string().max(500).optional().default(''),
  utm: z.object({ source: z.string().max(60).optional(), medium: z.string().max(60).optional(), campaign: z.string().max(60).optional() }).optional().default({}),
  screen: z.number().int().min(0).max(20000).optional(),
  lang: z.string().max(24).optional(),
  prev: z.object({ id: z.string().max(24), ms: z.number().min(0).max(864e5) }).optional()
});
const heartbeat = z.object({ vid: id, sid: id, path: z.string().max(200).optional(), pvId: z.string().max(24).optional(), ms: z.number().min(0).max(864e5).optional() });

async function allowed(req) {
  return shouldTrack(req, await getSettings(), parseUserAgent(req.get('user-agent')));
}

router.post('/pv', limiter(120), async (req, res) => {
  if (!(await allowed(req))) return res.status(204).end();
  const r = pageView.safeParse(req.body);
  if (!r.success) return res.status(400).json({ error: 'Invalid page view.' });
  const pvId = await recordPageView(req, r.data);
  res.json({ id: pvId ? String(pvId) : null });
});

router.post('/hb', limiter(60), async (req, res) => {
  if (!(await allowed(req))) return res.status(204).end();
  const r = heartbeat.safeParse(req.body);
  if (!r.success) return res.status(400).json({ error: 'Invalid heartbeat.' });
  await recordHeartbeat(req, r.data);
  res.status(204).end();
});

router.post('/leave', limiter(60), async (req, res) => {
  const r = heartbeat.safeParse(req.body);
  if (r.success) await recordLeave(r.data);
  res.status(204).end();
});

/** Browser errors, so client-side failures show up in the admin error log. */
const clientError = z.object({
  message: z.string().max(500), name: z.string().max(60).optional(), stack: z.string().max(4000).optional(), route: z.string().max(200).optional()
});
router.post('/error', limiter(20), async (req, res) => {
  const r = clientError.safeParse(req.body);
  if (!r.success) return res.status(400).json({ error: 'Invalid error report.' });
  const err = Object.assign(new Error(r.data.message), { name: r.data.name || 'ClientError', stack: r.data.stack || '' });
  await captureError(err, { source: 'client', route: r.data.route, severity: 'medium', requestId: req.id });
  res.status(204).end();
});

export default router;
