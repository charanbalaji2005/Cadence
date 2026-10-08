import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Result } from '../models/Result.js';
import { Session } from '../models/Session.js';
import { Friendship } from '../models/Friendship.js';
import { clearSessionCookie } from '../utils/session.js';
import { parse, profileSchema, settingsSchema } from '../utils/validate.js';
import { track } from '../services/events.js';

// Settings sync on every change, so "settings changed" is logged at most every 10 minutes per user.
const settingsLogged = new Map();

const router = Router();
router.use(requireAuth);

router.patch('/', async (req, res) => {
  const d = parse(profileSchema, req.body, res); if (!d) return;
  const lower = d.username.toLowerCase();
  if (lower !== req.user.usernameLower && (await User.exists({ _id: { $ne: req.user._id }, $or: [{ usernameLower: lower }, { usernameNormalized: lower }] }))) return res.status(409).json({ error: 'That username is taken. Try another one.' });
  // usernameNormalized is the indexed field friend search uses, so it has to follow renames.
  const previous = req.user.username;
  req.user.username = d.username; req.user.usernameLower = lower; req.user.usernameNormalized = lower;
  await req.user.save();
  if (previous !== d.username) track('PROFILE_UPDATED', { user: req.user, metadata: { field: 'username', from: previous, to: d.username } });
  res.json({ user: req.user.toPublic() });
});

router.put('/settings', async (req, res) => {
  const d = parse(settingsSchema, req.body, res); if (!d) return;
  await User.updateOne({ _id: req.user._id }, { $set: { settings: d.settings } });
  const key = String(req.user._id), last = settingsLogged.get(key) || 0;
  if (Date.now() - last > 10 * 60 * 1000) {
    settingsLogged.set(key, Date.now());
    if (settingsLogged.size > 5000) settingsLogged.clear();
    track('SETTINGS_CHANGED', { user: req.user, metadata: { keys: Object.keys(d.settings).length } });
  }
  res.json({ ok: true });
});

router.get('/keys', (req, res) => {
  const o = req.user.toObject({ flattenMaps: true });
  res.json({ keyStats: o.keyStats || {}, personalBests: o.personalBests || {} });
});

router.delete('/', async (req, res) => {
  const id = req.user._id;
  await track('ACCOUNT_DELETED', { user: req.user, metadata: { self: true } });
  await Promise.all([Result.deleteMany({ user: id }), Session.deleteMany({ user: id }), Friendship.deleteMany({ $or: [{ requester: id }, { recipient: id }] }), User.deleteOne({ _id: id })]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
