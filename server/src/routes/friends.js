import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Friendship, pairKey } from '../models/Friendship.js';
import { hub } from '../realtime/hub.js';
import { parse } from '../utils/validate.js';
import { track } from '../services/events.js';

const router = Router();
router.use(requireAuth);

const limiter = (limit, message) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => req.user._id.toString(), message: { error: message } });
const searchLimiter = limiter(60, 'Too many searches. Wait a moment and try again.');
const writeLimiter = limiter(30, 'Too many friend requests. Wait a moment and try again.');

const userIdBody = z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/i, 'Unknown user.') });
const requestBody = z.object({ username: z.string().trim().min(1, 'Enter a username.').max(30) }).or(userIdBody);

const card = u => ({ id: u._id.toString(), username: u.username, avatar: u.avatar || '', online: hub.isOnline(u._id) });
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const other = (f, me) => (f.requester.equals(me) ? f.recipient : f.requester);

/** The relationship as the signed-in user sees it. */
function stateFor(f, me) {
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  if (f.status === 'blocked') return f.blockedBy?.equals(me) ? 'blocked' : 'unavailable';
  return f.requester.equals(me) ? 'pending_sent' : 'pending_received';
}

/** Lets the other person's open tabs update right away. */
function notify(userId, msg) { hub.send(String(userId), msg); }
async function pendingCount(userId) { return Friendship.countDocuments({ recipient: userId, status: 'pending' }); }
async function notifyRequests(userId) { notify(userId, { type: 'friends_changed', friendRequests: await pendingCount(userId) }); }

router.get('/', async (req, res) => {
  const me = req.user._id;
  const rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] }).lean();
  const visible = rows.filter(f => f.status !== 'blocked' || f.blockedBy?.equals(me));
  const users = await User.find({ _id: { $in: visible.map(f => other(f, me)) } }).select('username avatar').lean();
  const byId = new Map(users.map(u => [u._id.toString(), u]));
  const out = { friends: [], incoming: [], outgoing: [], blocked: [] };
  for (const f of visible) {
    const u = byId.get(other(f, me).toString());
    if (!u) continue; // account deleted
    const entry = { ...card(u), since: (f.acceptedAt || f.createdAt).getTime() };
    const s = stateFor(f, me);
    if (s === 'friends') out.friends.push(entry);
    else if (s === 'pending_received') out.incoming.push(entry);
    else if (s === 'pending_sent') out.outgoing.push(entry);
    else if (s === 'blocked') out.blocked.push(entry);
  }
  // Online friends first, then alphabetical.
  out.friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  res.set('Cache-Control', 'no-store');
  res.json(out);
});

/** Prefix search on the indexed, lowercase username, so it never scans the whole collection. */
router.get('/search', searchLimiter, async (req, res) => {
  const q = String(req.query.username || '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (q.length < 2) return res.json({ query: q, results: [] });
  const me = req.user._id;
  const users = await User.find({ usernameNormalized: { $regex: `^${escapeRe(q)}` }, status: { $nin: ['suspended', 'deleted'] } }).sort({ usernameNormalized: 1 }).limit(8).select('username usernameNormalized avatar').lean();
  const rels = await Friendship.find({ pair: { $in: users.map(u => pairKey(me, u._id)) } }).lean();
  const relByPair = new Map(rels.map(f => [f.pair, f]));
  const results = users
    .map(u => ({ ...card(u), state: u._id.equals(me) ? 'self' : stateFor(relByPair.get(pairKey(me, u._id)), me), exact: u.usernameNormalized === q }))
    .filter(r => r.state !== 'unavailable') // someone who blocked you doesn't show up
    .sort((a, b) => Number(b.exact) - Number(a.exact));
  res.set('Cache-Control', 'no-store');
  res.json({ query: q, results });
});

router.post('/request', writeLimiter, async (req, res) => {
  const d = parse(requestBody, req.body, res); if (!d) return;
  const me = req.user._id;
  const target = d.userId
    ? await User.findOne({ _id: d.userId, status: { $nin: ['suspended', 'deleted'] } }).select('username avatar')
    : await User.findOne({ usernameNormalized: d.username.toLowerCase().replace(/^@/, ''), status: { $nin: ['suspended', 'deleted'] } }).select('username avatar');
  if (!target) return res.status(404).json({ error: 'No Cadence user has that username.' });
  if (target._id.equals(me)) return res.status(400).json({ error: "You can't add yourself." });

  const pair = pairKey(me, target._id);
  const existing = await Friendship.findOne({ pair });
  if (existing) {
    const s = stateFor(existing, me);
    if (s === 'friends') return res.status(409).json({ error: "You're already friends.", state: s });
    if (s === 'pending_sent') return res.status(409).json({ error: 'Request already sent.', state: s });
    if (s === 'blocked') return res.status(409).json({ error: 'Unblock this user to send a request.', state: s });
    if (s === 'unavailable') return res.status(404).json({ error: 'No Cadence user has that username.' });
    // They already asked you: sending a request back accepts theirs.
    existing.status = 'accepted'; existing.acceptedAt = new Date();
    await existing.save();
    track('FRIEND_ACCEPTED', { user: req.user, target: String(target._id), metadata: { friend: target.username } });
    notify(target._id, { type: 'friend_accepted', user: { id: me.toString(), username: req.user.username } });
    return res.json({ state: 'friends', user: card(target) });
  }
  try {
    await Friendship.create({ pair, requester: me, recipient: target._id, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Request already sent.', state: 'pending_sent' });
    throw err;
  }
  track('FRIEND_REQUEST', { user: req.user, target: String(target._id), metadata: { to: target.username } });
  notify(target._id, { type: 'friend_request', user: { id: me.toString(), username: req.user.username, avatar: req.user.avatar || '' } });
  notifyRequests(target._id).catch(() => {});
  res.status(201).json({ state: 'pending_sent', user: card(target) });
});

router.post('/accept', writeLimiter, async (req, res) => {
  const d = parse(userIdBody, req.body, res); if (!d) return;
  const me = req.user._id;
  // Only the recipient of a pending request can accept it.
  const f = await Friendship.findOneAndUpdate(
    { pair: pairKey(me, d.userId), recipient: me, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date() } },
    { new: true }
  );
  if (!f) return res.status(404).json({ error: 'That friend request no longer exists.' });
  notify(d.userId, { type: 'friend_accepted', user: { id: me.toString(), username: req.user.username } });
  track('FRIEND_ACCEPTED', { user: req.user, target: String(d.userId) });
  notifyRequests(me).catch(() => {});
  res.json({ state: 'friends' });
});

router.post('/reject', writeLimiter, async (req, res) => {
  const d = parse(userIdBody, req.body, res); if (!d) return;
  const me = req.user._id;
  const r = await Friendship.deleteOne({ pair: pairKey(me, d.userId), recipient: me, status: 'pending' });
  if (!r.deletedCount) return res.status(404).json({ error: 'That friend request no longer exists.' });
  notifyRequests(me).catch(() => {});
  res.json({ state: 'none' });
});

router.post('/cancel', writeLimiter, async (req, res) => {
  const d = parse(userIdBody, req.body, res); if (!d) return;
  const me = req.user._id;
  const r = await Friendship.deleteOne({ pair: pairKey(me, d.userId), requester: me, status: 'pending' });
  if (!r.deletedCount) return res.status(404).json({ error: 'That friend request no longer exists.' });
  notifyRequests(d.userId).catch(() => {});
  res.json({ state: 'none' });
});

router.post('/block', writeLimiter, async (req, res) => {
  const d = parse(userIdBody, req.body, res); if (!d) return;
  const me = req.user._id;
  if (me.equals(d.userId)) return res.status(400).json({ error: "You can't block yourself." });
  if (!(await User.exists({ _id: d.userId }))) return res.status(404).json({ error: 'User not found.' });
  const pair = pairKey(me, d.userId);
  const existing = await Friendship.findOne({ pair });
  if (existing?.status === 'blocked' && !existing.blockedBy.equals(me)) return res.json({ state: 'blocked' });
  await Friendship.findOneAndUpdate(
    { pair },
    { $set: { requester: me, recipient: d.userId, status: 'blocked', blockedBy: me }, $unset: { acceptedAt: 1 } },
    { upsert: true }
  );
  if (existing?.status === 'pending') notifyRequests(existing.recipient).catch(() => {});
  res.json({ state: 'blocked' });
});

router.delete('/block/:userId', writeLimiter, async (req, res) => {
  const d = parse(userIdBody, { userId: req.params.userId }, res); if (!d) return;
  await Friendship.deleteOne({ pair: pairKey(req.user._id, d.userId), status: 'blocked', blockedBy: req.user._id });
  res.json({ state: 'none' });
});

/** Removes a friend. */
router.delete('/:userId', writeLimiter, async (req, res) => {
  const d = parse(userIdBody, { userId: req.params.userId }, res); if (!d) return;
  const r = await Friendship.deleteOne({ pair: pairKey(req.user._id, d.userId), status: 'accepted' });
  if (!r.deletedCount) return res.status(404).json({ error: "You're not friends with this user." });
  res.json({ state: 'none' });
});

export default router;
