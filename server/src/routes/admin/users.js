import { Router } from 'express';
import { z } from 'zod';
import { User, ROLES } from '../../models/User.js';
import { Session } from '../../models/Session.js';
import { Result } from '../../models/Result.js';
import { LoginEvent } from '../../models/LoginEvent.js';
import { SecurityEvent } from '../../models/SecurityEvent.js';
import { ActivityEvent } from '../../models/ActivityEvent.js';
import { Friendship } from '../../models/Friendship.js';
import { requirePermission, can, canActOn, rankOf, ROLE_RANK } from '../../middleware/admin.js';
import { audit } from '../../services/audit.js';
import { suspendUser, activateUser, softDeleteUser, purgeUser, changeRole, revokeSessions } from '../../services/accounts.js';
import { validateUsername } from '../../utils/username.js';
import { maskMiddle, hashIdentifier } from '../../utils/privacy.js';
import { paging, paged, dateFilter, sortSpec, escapeRe, isId, bad, body, loadTarget } from './helpers.js';

const router = Router();
const DAY = 864e5;

const sessionStatus = s => (s.revokedAt ? 'revoked' : s.expiresAt < new Date() ? 'expired' : 'active');
const sessionView = (s, currentId) => ({
  id: String(s._id), status: sessionStatus(s), current: currentId ? String(s._id) === String(currentId) : false,
  device: s.device || '', browser: s.browser || '', os: s.os || '', ip: s.ip || '', country: s.country || '', provider: s.provider || '',
  createdAt: s.createdAt, lastActiveAt: s.lastActiveAt || s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt || null, revokedReason: s.revokedReason || '', remember: !!s.remember
});

function listFilter(q) {
  const f = {};
  const view = q.view || 'all';
  if (view === 'active') Object.assign(f, { status: 'active', lastActiveAt: { $gte: new Date(Date.now() - 30 * DAY) } });
  else if (view === 'new') Object.assign(f, { status: { $ne: 'deleted' }, createdAt: { $gte: new Date(Date.now() - 7 * DAY) } });
  else if (view === 'suspended') f.status = 'suspended';
  else if (view === 'deleted') f.status = 'deleted';
  else if (view === 'admins') Object.assign(f, { role: { $ne: 'USER' } });
  else f.status = { $ne: 'deleted' };
  if (['active', 'suspended', 'deleted'].includes(q.status)) f.status = q.status;
  if (ROLES.includes(q.role)) f.role = q.role === 'USER' ? { $in: ['USER', null] } : q.role;
  if (q.provider === 'github') f.githubId = { $exists: true, $ne: null };
  else if (q.provider === 'google') f.googleId = { $exists: true, $ne: null };
  else if (q.provider === 'email') f.provider = 'email';
  Object.assign(f, dateFilter(q, 'createdAt'));
  const term = String(q.q || '').trim().toLowerCase().replace(/^@/, '').slice(0, 80);
  if (term) f.$or = [{ usernameNormalized: { $regex: `^${escapeRe(term)}` } }, { email: { $regex: `^${escapeRe(term)}` } }, ...(isId(term) ? [{ _id: term }] : [])];
  return f;
}

/** Users, server-side paginated, filtered and sorted. */
router.get('/', requirePermission('users.view'), async (req, res) => {
  const p = paging(req.query);
  const filter = listFilter(req.query);
  const sort = sortSpec(req.query, ['createdAt', 'lastLoginAt', 'lastActiveAt', 'usernameNormalized', 'email'], 'createdAt');
  const since = new Date(Date.now() - 30 * DAY), week = new Date(Date.now() - 7 * DAY);
  const [rows, total, counts] = await Promise.all([
    User.find(filter).sort(sort).skip(p.skip).limit(p.limit).select('username email avatar provider role status createdAt lastLoginAt lastActiveAt githubId googleId githubLogin suspension').lean(),
    User.countDocuments(filter),
    Promise.all([
      User.countDocuments({ status: { $ne: 'deleted' } }), User.countDocuments({ status: 'active', lastActiveAt: { $gte: since } }),
      User.countDocuments({ status: { $ne: 'deleted' }, createdAt: { $gte: week } }), User.countDocuments({ status: 'suspended' }),
      User.countDocuments({ status: 'deleted' }), User.countDocuments({ role: { $nin: ['USER', null] } })
    ])
  ]);
  // One query for every listed user's active session count (no per-row lookups).
  const sessions = await Session.aggregate([{ $match: { user: { $in: rows.map(r => r._id) }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } } }, { $group: { _id: '$user', n: { $sum: 1 } } }]);
  const sessionCount = new Map(sessions.map(s => [String(s._id), s.n]));
  const items = rows.map(u => ({
    id: String(u._id), username: u.username, email: u.email, avatar: u.avatar || '', role: u.role || 'USER', status: u.status || 'active',
    provider: u.provider, providers: ['email', u.githubId && 'github', u.googleId && 'google'].filter(Boolean).filter(x => x !== 'email' || u.provider === 'email'),
    githubLogin: u.githubLogin || '', createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null, lastActiveAt: u.lastActiveAt || null,
    sessions: sessionCount.get(String(u._id)) || 0, suspensionReason: u.suspension?.reason || ''
  }));
  const [all, active, fresh, suspended, deleted, admins] = counts;
  res.json({ ...paged(items, total, p), counts: { all, active, new: fresh, suspended, deleted, admins } });
});

/** Everything about one user an administrator may need. Never secrets. */
router.get('/:id', requirePermission('users.view'), async (req, res) => {
  const u = await loadTarget(req, res, '+passwordHash');
  if (!u) return;
  const id = u._id;
  const [sessions, tests, best, races, wins, friends, security, logins, lastAuth] = await Promise.all([
    Session.find({ user: id }).sort({ createdAt: -1 }).limit(50).select('-tokenHash -userAgent').lean(),
    Result.countDocuments({ user: id, race: { $exists: false } }),
    Result.findOne({ user: id, 'race.status': { $nin: ['suspicious', 'flagged'] } }).sort({ wpm: -1 }).select('wpm acc mode mode2 createdAt').lean(),
    Result.countDocuments({ user: id, 'race.rank': { $exists: true } }),
    Result.countDocuments({ user: id, 'race.rank': 1, 'race.players': { $gt: 1 } }),
    Friendship.countDocuments({ $or: [{ requester: id }, { recipient: id }], status: 'accepted' }),
    SecurityEvent.find({ user: id }).sort({ createdAt: -1 }).limit(20).lean(),
    LoginEvent.find({ $or: [{ user: id }, { identifierHash: hashIdentifier(u.email) }] }).sort({ createdAt: -1 }).limit(25).lean(),
    LoginEvent.aggregate([{ $match: { user: id, success: true, type: { $in: ['login', 'signup'] } } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$provider', at: { $first: '$createdAt' } } }])
  ]);
  const last = Object.fromEntries(lastAuth.map(x => [x._id, x.at]));
  const failedRecent = logins.filter(l => l.type === 'failed' && l.createdAt > new Date(Date.now() - DAY)).length;
  const actor = req.user;
  const actOk = canActOn(actor, u).ok;
  res.json({
    user: {
      id: String(id), username: u.username, email: u.email, avatar: u.avatar || '', role: u.role || 'USER', status: u.status || 'active',
      createdAt: u.createdAt, updatedAt: u.updatedAt, lastLoginAt: u.lastLoginAt || null, lastActiveAt: u.lastActiveAt || null,
      profileCompleted: u.profileCompleted !== false, signupCountry: u.signupCountry || '',
      suspension: u.suspension ? { reason: u.suspension.reason, note: u.suspension.note, at: u.suspension.at } : null,
      deletedAt: u.deletedAt || null
    },
    authentication: {
      primary: u.provider,
      email: { connected: !!u.passwordHash, lastAuth: last.email || null },
      github: u.githubId ? { connected: true, login: u.githubLogin || '', accountId: u.githubId, profileUrl: u.githubLogin ? `https://github.com/${u.githubLogin}` : '', avatar: u.provider === 'github' ? u.avatar : '', connectedAt: u.githubConnectedAt || (u.provider === 'github' ? u.createdAt : null), lastAuth: last.github || null } : { connected: false },
      google: u.googleId ? { connected: true, accountId: maskMiddle(u.googleId), connectedAt: u.googleConnectedAt || (u.provider === 'google' ? u.createdAt : null), lastAuth: last.google || null } : { connected: false }
    },
    sessions: sessions.map(s => sessionView(s)),
    stats: { tests, best: best ? { wpm: best.wpm, acc: best.acc, mode: best.mode, mode2: best.mode2, date: best.createdAt } : null, races, wins, friends },
    security: { failedLast24h: failedRecent, events: security.map(e => ({ id: String(e._id), type: e.type, severity: e.severity, title: e.title, count: e.count, createdAt: e.createdAt, lastSeenAt: e.lastSeenAt, acknowledged: !!e.acknowledgedAt })) },
    logins: logins.map(l => ({ id: String(l._id), type: l.type, success: l.success, provider: l.provider, reason: l.reason, risk: l.risk, ip: l.ip, device: l.device, browser: l.browser, os: l.os, country: l.country, createdAt: l.createdAt })),
    allowed: {
      moderate: can(actor, 'users.moderate') && actOk,
      delete: can(actor, 'users.delete') && actOk,
      purge: can(actor, 'users.purge') && actOk && u.status === 'deleted',
      changeRole: can(actor, 'users.roles') && String(actor._id) !== String(id),
      revokeSessions: can(actor, 'sessions.manage') && actOk
    }
  });
});

const RESULT_LABEL = r => (r.race ? `Finished ${ordinal(r.race.rank)} of ${r.race.players} in race ${r.race.code}` : `Completed a ${r.mode}${r.mode2 ? ` ${r.mode2}` : ''} test`);
function ordinal(n) { return n + (['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] || 'th'); }

/** A merged timeline: activity events, sign-in events and typing results, newest first. */
router.get('/:id/timeline', requirePermission('users.view'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'User not found.', 404);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 40);
  const before = req.query.before ? new Date(req.query.before) : new Date(Date.now() + 1000);
  if (Number.isNaN(+before)) return bad(res, 'Invalid cursor.');
  const user = req.params.id, cut = { $lt: before };
  const [acts, logins, results] = await Promise.all([
    ActivityEvent.find({ user, createdAt: cut }).sort({ createdAt: -1 }).limit(limit).lean(),
    LoginEvent.find({ user, createdAt: cut }).sort({ createdAt: -1 }).limit(limit).lean(),
    Result.find({ user, createdAt: cut }).sort({ createdAt: -1 }).limit(limit).select('wpm acc mode mode2 race createdAt').lean()
  ]);
  const items = [
    ...acts.filter(a => !['USER_LOGIN', 'USER_LOGOUT', 'USER_SIGNUP'].includes(a.type)).map(a => ({ at: a.createdAt, kind: 'activity', type: a.type, result: a.result, metadata: a.metadata, byAdmin: !!a.actor })),
    ...logins.map(l => ({ at: l.createdAt, kind: 'auth', type: l.type, result: l.success ? 'success' : 'failure', metadata: { provider: l.provider, reason: l.reason, device: l.device, browser: l.browser, country: l.country, risk: l.risk } })),
    ...results.map(r => ({ at: r.createdAt, kind: 'test', type: r.race ? 'RACE_RESULT' : 'TEST_COMPLETED', result: r.race && r.race.status !== 'valid' ? 'failure' : 'success', label: RESULT_LABEL(r), metadata: { wpm: Math.round(r.wpm), acc: Math.round(r.acc * 10) / 10 } }))
  ].sort((a, b) => b.at - a.at).slice(0, limit);
  res.json({ items, nextBefore: items.length === limit ? items[items.length - 1].at : null });
});

const reasonSchema = z.enum(['spam', 'abuse', 'security', 'policy', 'other'], { errorMap: () => ({ message: 'Choose a reason.' }) });

/** Rename (for offensive or impersonating usernames). */
router.patch('/:id', requirePermission('users.moderate'), async (req, res) => {
  const d = body(z.object({ username: z.string().min(1).max(30) }), req, res); if (!d) return;
  const u = await loadTarget(req, res); if (!u) return;
  const ok = canActOn(req.user, u); if (!ok.ok) return bad(res, ok.error, 403);
  const v = validateUsername(d.username); if (!v.valid) return bad(res, v.error);
  if (await User.exists({ _id: { $ne: u._id }, $or: [{ usernameNormalized: v.normalized }, { usernameLower: v.normalized }] })) return bad(res, 'That username is taken.', 409);
  const from = u.username;
  Object.assign(u, { username: v.normalized, usernameLower: v.normalized, usernameNormalized: v.normalized });
  await u.save();
  await audit({ actor: req.user, action: 'EDIT_USER', targetType: 'user', targetId: u._id, targetLabel: `${u.username} <${u.email}>`, metadata: { field: 'username', from, to: v.normalized }, req });
  res.json({ ok: true, username: u.username });
});

router.post('/:id/suspend', requirePermission('users.moderate'), async (req, res) => {
  const d = body(z.object({ reason: reasonSchema, note: z.string().max(500).optional().default('') }), req, res); if (!d) return;
  const u = await loadTarget(req, res); if (!u) return;
  const ok = canActOn(req.user, u); if (!ok.ok) return bad(res, ok.error, 403);
  if (u.status !== 'active') return bad(res, `This account is already ${u.status}.`, 409);
  await suspendUser(u, { by: req.user, reason: d.reason, note: d.note, req });
  res.json({ ok: true, status: 'suspended' });
});

router.post('/:id/activate', requirePermission('users.moderate'), async (req, res) => {
  const u = await loadTarget(req, res); if (!u) return;
  const ok = canActOn(req.user, u); if (!ok.ok) return bad(res, ok.error, 403);
  if (u.status === 'active') return bad(res, 'This account is already active.', 409);
  if (u.status === 'deleted' && !can(req.user, 'users.delete')) return bad(res, "You don't have permission to restore deleted accounts.", 403);
  await activateUser(u, { by: req.user, req });
  res.json({ ok: true, status: 'active' });
});

const confirmDelete = z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }), reason: z.string().max(500).optional().default('') });

/** Soft delete: reversible, the account can't sign in and is hidden from users. */
router.delete('/:id', requirePermission('users.delete'), async (req, res) => {
  const d = body(confirmDelete, req, res); if (!d) return;
  const u = await loadTarget(req, res); if (!u) return;
  const ok = canActOn(req.user, u); if (!ok.ok) return bad(res, ok.error, 403);
  if (u.status === 'deleted') return bad(res, 'This account is already deleted.', 409);
  await softDeleteUser(u, { by: req.user, reason: d.reason, req });
  res.json({ ok: true, status: 'deleted' });
});

/** Permanent removal. Only super admins, and only for an account that is already soft-deleted. */
router.post('/:id/purge', requirePermission('users.purge'), async (req, res) => {
  const d = body(confirmDelete, req, res); if (!d) return;
  const u = await loadTarget(req, res); if (!u) return;
  const ok = canActOn(req.user, u); if (!ok.ok) return bad(res, ok.error, 403);
  if (u.status !== 'deleted') return bad(res, 'Delete the account first. Permanent removal is only for deleted accounts.', 409);
  await purgeUser(u, { by: req.user, req });
  res.json({ ok: true });
});

router.post('/:id/revoke-sessions', requirePermission('sessions.manage'), async (req, res) => {
  const d = body(z.object({ sessionId: z.string().regex(/^[a-f0-9]{24}$/i).optional() }), req, res); if (!d) return;
  const u = await loadTarget(req, res); if (!u) return;
  const ok = canActOn(req.user, u); if (!ok.ok) return bad(res, ok.error, 403);
  if (d.sessionId && !(await Session.exists({ _id: d.sessionId, user: u._id }))) return bad(res, 'Session not found.', 404);
  const n = await revokeSessions(u._id, { sessionId: d.sessionId, reason: 'admin', by: req.user });
  await audit({ actor: req.user, action: d.sessionId ? 'REVOKE_SESSION' : 'REVOKE_ALL_SESSIONS', targetType: 'user', targetId: u._id, targetLabel: `${u.username} <${u.email}>`, metadata: { sessionId: d.sessionId || null, revoked: n }, req });
  res.json({ ok: true, revoked: n });
});

/** Role changes: super admins only, never on yourself, and the last super admin can't be demoted. */
router.post('/:id/role', requirePermission('users.roles'), async (req, res) => {
  const d = body(z.object({ role: z.enum(ROLES), confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm the role change.' }) }) }), req, res); if (!d) return;
  const u = await loadTarget(req, res); if (!u) return;
  if (String(u._id) === String(req.user._id)) return bad(res, "You can't change your own role.", 403);
  if (u.status !== 'active') return bad(res, 'Activate the account before changing its role.', 409);
  if ((u.role || 'USER') === d.role) return bad(res, `This account is already ${d.role}.`, 409);
  if (u.role === 'SUPER_ADMIN' && d.role !== 'SUPER_ADMIN' && (await User.countDocuments({ role: 'SUPER_ADMIN', status: 'active' })) <= 1) return bad(res, "You can't demote the last super admin.", 409);
  if (rankOf(u) > rankOf(req.user) || ROLE_RANK[d.role] > rankOf(req.user)) return bad(res, "You can't grant a role above your own.", 403);
  await changeRole(u, { by: req.user, role: d.role, req });
  res.json({ ok: true, role: d.role });
});

export default router;
