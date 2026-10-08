import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Result } from '../models/Result.js';
import { Session } from '../models/Session.js';
import { clearSessionCookie } from '../utils/session.js';
import { parse, profileSchema, settingsSchema } from '../utils/validate.js';

const router = Router();
router.use(requireAuth);

router.patch('/', async (req, res) => {
  const d = parse(profileSchema, req.body, res); if (!d) return;
  const lower = d.username.toLowerCase();
  if (lower !== req.user.usernameLower && (await User.exists({ usernameLower: lower }))) return res.status(409).json({ error: 'That username is taken. Try another one.' });
  req.user.username = d.username; req.user.usernameLower = lower;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

router.put('/settings', async (req, res) => {
  const d = parse(settingsSchema, req.body, res); if (!d) return;
  await User.updateOne({ _id: req.user._id }, { $set: { settings: d.settings } });
  res.json({ ok: true });
});

router.get('/keys', (req, res) => {
  const o = req.user.toObject({ flattenMaps: true });
  res.json({ keyStats: o.keyStats || {}, personalBests: o.personalBests || {} });
});

router.delete('/', async (req, res) => {
  const id = req.user._id;
  await Promise.all([Result.deleteMany({ user: id }), Session.deleteMany({ user: id }), User.deleteOne({ _id: id })]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
