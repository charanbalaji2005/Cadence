import { Router } from 'express';
import { User } from '../../models/User.js';
import { Session } from '../../models/Session.js';
import { LoginEvent, LOGIN_TYPES } from '../../models/LoginEvent.js';
import { SecurityEvent, SEVERITIES } from '../../models/SecurityEvent.js';
import { requirePermission, canActOn } from '../../middleware/admin.js';
import { audit } from '../../services/audit.js';
import { revokeSessions } from '../../services/accounts.js';
import { parseRange, bucketKeys } from '../../services/analytics.js';
import { maskMiddle, hashIdentifier } from '../../utils/privacy.js';
import { paging, paged, dateFilter, escapeRe, isId, bad, resolveUserParam, userRef } from './helpers.js';

const router = Router();

async function usersById(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  const users = list.length ? await User.find({ _id: { $in: list } }).select('username avatar status').lean() : [];
  return new Map(users.map(u => [String(u._id), u]));
}

/* ---------- login activity ---------- */

router.get('/logins', requirePermission('security.view'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'createdAt') };
  if (LOGIN_TYPES.includes(q.type)) f.type = q.type;
  if (q.success === 'true' || q.success === 'false') f.success = q.success === 'true';
  if (['email', 'google', 'github'].includes(q.provider)) f.provider = q.provider;
  if (['Desktop', 'Mobile', 'Tablet'].includes(q.device)) f.device = q.device;
  if (SEVERITIES.includes(q.risk)) f.risk = q.risk;
  if (q.user) { const id = await resolveUserParam(q.user); if (id === null) return res.json(paged([], 0, p)); f.user = id; }
  const term = String(q.q || '').trim().slice(0, 60);
  // An exact email is matched through its hash (raw emails of failed attempts are never stored).
  if (term.includes('@')) f.identifierHash = hashIdentifier(term);
  else if (term) f.$or = [{ ip: { $regex: `^${escapeRe(term)}` } }, { username: { $regex: `^${escapeRe(term.toLowerCase())}` } }];
  const [rows, total] = await Promise.all([LoginEvent.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(), LoginEvent.countDocuments(f)]);
  // Sign-out time for each sign-in, when the session has ended.
  const sessionIds = rows.filter(r => r.session && r.type !== 'logout').map(r => r.session);
  const ends = sessionIds.length ? await Session.find({ _id: { $in: sessionIds } }).select('revokedAt revokedReason expiresAt').lean() : [];
  const endMap = new Map(ends.map(s => [String(s._id), s]));
  res.json(paged(rows.map(r => {
    const s = r.session ? endMap.get(String(r.session)) : null;
    return {
      id: String(r._id), at: r.createdAt, type: r.type, success: r.success, user: r.user ? { id: String(r.user), username: r.username } : null,
      identifier: r.identifier, provider: r.provider, reason: r.reason, risk: r.risk, ip: r.ip, device: r.device, browser: r.browser, os: r.os, country: r.country,
      session: r.session ? maskMiddle(String(r.session), 4) : '', endedAt: s?.revokedAt || null, endReason: s?.revokedReason || ''
    };
  }), total, p));
});

/** Login volume, failures and success rate over time, plus totals by provider and device. */
router.get('/logins/stats', requirePermission('security.view'), async (req, res) => {
  const r = parseRange(req.query), keys = bucketKeys(r);
  const fmt = { $dateToString: { date: { $dateTrunc: { date: '$createdAt', unit: r.unit, timezone: r.tz, ...(r.unit === 'week' ? { startOfWeek: 'monday' } : {}) } }, format: r.unit === 'hour' ? '%Y-%m-%dT%H' : '%Y-%m-%d', timezone: r.tz } };
  const [series, providers, devices] = await Promise.all([
    LoginEvent.aggregate([{ $match: { createdAt: { $gte: r.from, $lt: r.to }, type: { $in: ['login', 'failed', 'signup'] } } }, { $group: { _id: { k: fmt, t: '$type' }, n: { $sum: 1 } } }]),
    LoginEvent.aggregate([{ $match: { createdAt: { $gte: r.from, $lt: r.to }, type: { $in: ['login', 'signup', 'failed'] } } }, { $group: { _id: { p: '$provider', ok: '$success' }, n: { $sum: 1 } } }]),
    LoginEvent.aggregate([{ $match: { createdAt: { $gte: r.from, $lt: r.to }, type: { $in: ['login', 'signup'] }, success: true } }, { $group: { _id: '$device', n: { $sum: 1 } } }])
  ]);
  const pick = t => keys.map(k => series.find(x => x._id.k === k && x._id.t === t)?.n || 0);
  const logins = pick('login'), failed = pick('failed'), signups = pick('signup');
  const totalOk = logins.reduce((a, b) => a + b, 0), totalFail = failed.reduce((a, b) => a + b, 0);
  res.json({
    keys, unit: r.unit, logins, failed, signups,
    successRate: logins.map((n, i) => (n + failed[i] ? n / (n + failed[i]) : null)),
    totals: { logins: totalOk, failed: totalFail, signups: signups.reduce((a, b) => a + b, 0), successRate: totalOk + totalFail ? totalOk / (totalOk + totalFail) : null },
    byProvider: providers.map(x => ({ provider: x._id.p || 'unknown', success: x._id.ok, n: x.n })),
    byDevice: devices.map(x => ({ device: x._id || 'Unknown', n: x.n }))
  });
});

/* ---------- sessions ---------- */

const sessionStatus = s => (s.revokedAt ? 'revoked' : s.expiresAt < new Date() ? 'expired' : 'active');

router.get('/sessions', requirePermission('sessions.manage'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'createdAt') };
  if (q.status === 'active') Object.assign(f, { revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  else if (q.status === 'revoked') f.revokedAt = { $exists: true };
  else if (q.status === 'expired') Object.assign(f, { revokedAt: { $exists: false }, expiresAt: { $lte: new Date() } });
  if (['Desktop', 'Mobile', 'Tablet'].includes(q.device)) f.device = q.device;
  if (q.browser) f.browser = String(q.browser).slice(0, 30);
  if (q.user) { const id = await resolveUserParam(q.user); if (id === null) return res.json(paged([], 0, p)); f.user = id; }
  const [rows, total] = await Promise.all([Session.find(f).sort({ lastActiveAt: -1, createdAt: -1 }).skip(p.skip).limit(p.limit).select('-tokenHash -userAgent').lean(), Session.countDocuments(f)]);
  const users = await usersById(rows.map(r => r.user));
  res.json(paged(rows.map(s => ({
    id: String(s._id), user: userRef(users.get(String(s.user))), status: sessionStatus(s), current: req.session && String(req.session._id) === String(s._id),
    device: s.device || '', browser: s.browser || '', os: s.os || '', ip: s.ip || '', country: s.country || '', provider: s.provider || '',
    createdAt: s.createdAt, lastActiveAt: s.lastActiveAt || s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt || null, revokedReason: s.revokedReason || ''
  })), total, p));
});

router.post('/sessions/:id/revoke', requirePermission('sessions.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Session not found.', 404);
  const s = await Session.findById(req.params.id).select('user revokedAt').lean();
  if (!s) return bad(res, 'Session not found.', 404);
  if (s.revokedAt) return bad(res, 'This session has already ended.', 409);
  const owner = await User.findById(s.user);
  if (!owner) return bad(res, 'Session not found.', 404);
  const own = String(owner._id) === String(req.user._id);
  if (!own) { const ok = canActOn(req.user, owner); if (!ok.ok) return bad(res, ok.error, 403); }
  const n = await revokeSessions(owner._id, { sessionId: s._id, reason: own ? 'self' : 'admin', by: req.user });
  await audit({ actor: req.user, action: 'REVOKE_SESSION', targetType: 'session', targetId: s._id, targetLabel: `${owner.username} <${owner.email}>`, metadata: { own }, req });
  res.json({ ok: true, revoked: n });
});

/* ---------- OAuth accounts ---------- */

router.get('/oauth', requirePermission('users.view'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = q.provider === 'google' ? { googleId: { $exists: true, $ne: null } } : q.provider === 'github' ? { githubId: { $exists: true, $ne: null } } : { $or: [{ githubId: { $exists: true, $ne: null } }, { googleId: { $exists: true, $ne: null } }] };
  const term = String(q.q || '').trim().toLowerCase().slice(0, 40);
  if (term) f.$and = [{ $or: [{ usernameNormalized: { $regex: `^${escapeRe(term)}` } }, { githubLogin: { $regex: `^${escapeRe(term)}`, $options: 'i' } }] }];
  const [rows, total] = await Promise.all([
    User.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).select('username avatar status provider githubId githubLogin githubConnectedAt googleId googleConnectedAt createdAt').lean(),
    User.countDocuments(f)
  ]);
  const last = await LoginEvent.aggregate([
    { $match: { user: { $in: rows.map(r => r._id) }, success: true, type: { $in: ['login', 'signup'] }, provider: { $in: ['github', 'google'] } } },
    { $sort: { createdAt: -1 } }, { $group: { _id: { u: '$user', p: '$provider' }, at: { $first: '$createdAt' } } }
  ]);
  const lastAt = (u, p) => last.find(x => String(x._id.u) === String(u) && x._id.p === p)?.at || null;
  res.json(paged(rows.map(u => ({
    user: { id: String(u._id), username: u.username, avatar: u.avatar || '', status: u.status || 'active' },
    primary: u.provider,
    github: u.githubId ? { login: u.githubLogin || '', accountId: u.githubId, connectedAt: u.githubConnectedAt || (u.provider === 'github' ? u.createdAt : null), lastAuth: lastAt(u._id, 'github') } : null,
    google: u.googleId ? { accountId: maskMiddle(u.googleId), connectedAt: u.googleConnectedAt || (u.provider === 'google' ? u.createdAt : null), lastAuth: lastAt(u._id, 'google') } : null
  })), total, p));
});

/* ---------- security ---------- */

router.get('/security', requirePermission('security.view'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'createdAt') };
  if (SEVERITIES.includes(q.severity)) f.severity = q.severity;
  if (q.type) f.type = String(q.type).slice(0, 40);
  if (q.state === 'open') f.acknowledgedAt = { $exists: false };
  else if (q.state === 'acknowledged') f.acknowledgedAt = { $exists: true };
  if (q.user) { const id = await resolveUserParam(q.user); if (id === null) return res.json(paged([], 0, p)); f.user = id; }
  const [rows, total, open, types] = await Promise.all([
    SecurityEvent.find(f).sort({ lastSeenAt: -1 }).skip(p.skip).limit(p.limit).lean(), SecurityEvent.countDocuments(f),
    SecurityEvent.aggregate([{ $match: { acknowledgedAt: { $exists: false } } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
    SecurityEvent.distinct('type')
  ]);
  const users = await usersById([...rows.map(r => r.user), ...rows.map(r => r.acknowledgedBy)]);
  res.json({
    ...paged(rows.map(e => ({
      id: String(e._id), type: e.type, severity: e.severity, title: e.title, count: e.count, ip: e.ip, identifier: e.identifier, details: e.details,
      user: userRef(users.get(String(e.user))), createdAt: e.createdAt, lastSeenAt: e.lastSeenAt,
      acknowledged: e.acknowledgedAt ? { at: e.acknowledgedAt, by: users.get(String(e.acknowledgedBy))?.username || '' } : null
    })), total, p),
    open: Object.fromEntries(SEVERITIES.map(s => [s, open.find(x => x._id === s)?.n || 0])),
    types
  });
});

router.post('/security/:id/ack', requirePermission('security.view'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Event not found.', 404);
  const e = await SecurityEvent.findById(req.params.id);
  if (!e) return bad(res, 'Event not found.', 404);
  if (e.acknowledgedAt) return res.json({ ok: true });
  e.acknowledgedAt = new Date(); e.acknowledgedBy = req.user._id;
  await e.save();
  await audit({ actor: req.user, action: 'ACKNOWLEDGE_SECURITY_EVENT', targetType: 'security_event', targetId: e._id, targetLabel: e.title, req });
  res.json({ ok: true });
});

/** Failed sign-ins grouped by account and by IP address, the two shapes attacks take. */
router.get('/security/failed', requirePermission('security.view'), async (req, res) => {
  const r = parseRange(req.query);
  const match = { type: 'failed', createdAt: { $gte: r.from, $lt: r.to } };
  const [byAccount, byIp, total] = await Promise.all([
    LoginEvent.aggregate([
      { $match: match }, { $sort: { createdAt: -1 } },
      { $group: { _id: '$identifierHash', identifier: { $first: '$identifier' }, user: { $first: '$user' }, username: { $first: '$username' }, attempts: { $sum: 1 }, last: { $first: '$createdAt' }, first: { $last: '$createdAt' }, ips: { $addToSet: '$ip' }, reasons: { $addToSet: '$reason' }, risk: { $max: { $switch: { branches: [{ case: { $eq: ['$risk', 'critical'] }, then: 2 }, { case: { $eq: ['$risk', 'suspicious'] }, then: 1 }], default: 0 } } }, device: { $first: '$device' }, browser: { $first: '$browser' } } },
      { $sort: { attempts: -1, last: -1 } }, { $limit: 50 }
    ]),
    LoginEvent.aggregate([
      { $match: match }, { $sort: { createdAt: -1 } },
      { $group: { _id: '$ip', attempts: { $sum: 1 }, accounts: { $addToSet: '$identifierHash' }, last: { $first: '$createdAt' }, country: { $first: '$country' }, device: { $first: '$device' }, browser: { $first: '$browser' } } },
      { $project: { attempts: 1, accounts: { $size: '$accounts' }, last: 1, country: 1, device: 1, browser: 1 } },
      { $sort: { attempts: -1, last: -1 } }, { $limit: 50 }
    ]),
    LoginEvent.countDocuments(match)
  ]);
  const level = n => ['normal', 'suspicious', 'critical'][n] || 'normal';
  res.json({
    total,
    byAccount: byAccount.map(a => ({ identifier: a.identifier || '(no email)', user: a.user ? { id: String(a.user), username: a.username } : null, attempts: a.attempts, first: a.first, last: a.last, ips: a.ips.filter(Boolean).length, reasons: a.reasons.filter(Boolean), risk: level(a.risk), device: a.device, browser: a.browser })),
    byIp: byIp.map(x => ({ ip: x._id || '(unknown)', attempts: x.attempts, accounts: x.accounts, last: x.last, country: x.country, device: x.device, browser: x.browser, risk: x.accounts >= 3 || x.attempts >= 15 ? 'suspicious' : 'normal' }))
  });
});

export default router;
