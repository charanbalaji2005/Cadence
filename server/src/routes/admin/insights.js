import { Router } from 'express';
import { User } from '../../models/User.js';
import { Result } from '../../models/Result.js';
import { ActivityEvent, ACTIVITY_TYPES } from '../../models/ActivityEvent.js';
import { AuditLog } from '../../models/AuditLog.js';
import { VisitorSession } from '../../models/Analytics.js';
import { CompetitionRoom } from '../../models/CompetitionRoom.js';
import { requirePermission } from '../../middleware/admin.js';
import { audit, verifyAuditChain } from '../../services/audit.js';
import { liveVisitors } from '../../services/tracking.js';
import { registry } from '../../realtime/registry.js';
import * as A from '../../services/analytics.js';
import { paging, paged, dateFilter, escapeRe, isId, bad, resolveUserParam, userRef } from './helpers.js';

const router = Router();

/* ---------- analytics ---------- */

const analytics = (name, fn) => router.get(`/analytics/${name}`, requirePermission(name === 'overview' ? 'dashboard.view' : 'analytics.view'), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await fn(A.parseRange(req.query), req));
});
analytics('overview', A.overview);
analytics('users', A.userGrowth);
analytics('visitors', A.visitorAnalytics);
analytics('activity', A.activityAnalytics);
analytics('traffic', A.traffic);
analytics('pages', A.pages);
analytics('devices', A.devices);
analytics('geography', A.geography);
analytics('engagement', A.engagement);
analytics('retention', () => A.retention());

/* ---------- visitors ---------- */

/** Who is on the site right now. Read from memory (heartbeats), never from the database. */
router.get('/visitors/live', requirePermission('visitors.view'), async (req, res) => {
  const now = Date.now();
  const list = liveVisitors().map(v => ({ ...v, durationSeconds: Math.round((now - v.startedAt) / 1000), idleSeconds: Math.round((now - v.lastSeen) / 1000) }));
  const online = A.onlineNow();
  res.set('Cache-Control', 'no-store');
  res.json({ visitors: list, online, byRoute: Object.entries(list.reduce((m, v) => ({ ...m, [v.route]: (m[v.route] || 0) + 1 }), {})).map(([route, n]) => ({ route, n })).sort((a, b) => b.n - a.n), at: now });
});

router.get('/visitors/sessions', requirePermission('visitors.view'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'startedAt') };
  if (['Desktop', 'Mobile', 'Tablet'].includes(q.device)) f.device = q.device;
  if (['direct', 'search', 'social', 'referral', 'email', 'other'].includes(q.source)) f.source = q.source;
  if (q.kind === 'users') f.user = { $ne: null };
  else if (q.kind === 'anonymous') f.user = null;
  if (q.returning === 'true' || q.returning === 'false') f.returning = q.returning === 'true';
  const [rows, total] = await Promise.all([VisitorSession.find(f).sort({ startedAt: -1 }).skip(p.skip).limit(p.limit).lean(), VisitorSession.countDocuments(f)]);
  const ids = [...new Set(rows.map(r => r.user).filter(Boolean).map(String))];
  const users = new Map((ids.length ? await User.find({ _id: { $in: ids } }).select('username avatar').lean() : []).map(u => [String(u._id), u]));
  res.json(paged(rows.map(v => ({
    id: String(v._id), visitor: v.vid.slice(0, 8), user: userRef(users.get(String(v.user))), startedAt: v.startedAt, lastSeenAt: v.lastSeenAt,
    durationSeconds: Math.round((v.lastSeenAt - v.startedAt) / 1000), pages: v.pages, entry: v.entryRoute, exit: v.exitRoute,
    source: v.source, referrer: v.referrer, returning: v.returning, device: v.device, browser: v.browser, os: v.os, country: v.country, screen: v.screen
  })), total, p));
});

/* ---------- activity ---------- */

router.get('/activity', requirePermission('activity.view'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'createdAt') };
  const types = String(q.type || '').split(',').filter(t => ACTIVITY_TYPES.includes(t));
  if (types.length) f.type = { $in: types };
  if (q.user) { const id = await resolveUserParam(q.user); if (id === null) return res.json(paged([], 0, p)); f.user = id; }
  if (q.result === 'success' || q.result === 'failure') f.result = q.result;
  const [rows, total] = await Promise.all([ActivityEvent.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(), ActivityEvent.countDocuments(f)]);
  const actorIds = [...new Set(rows.flatMap(r => [r.actor, r.user]).filter(Boolean).map(String))];
  const people = new Map((actorIds.length ? await User.find({ _id: { $in: actorIds } }).select('username avatar').lean() : []).map(u => [String(u._id), u]));
  res.json({
    ...paged(rows.map(a => ({
      id: String(a._id), at: a.createdAt, type: a.type, result: a.result, target: a.target, metadata: a.metadata,
      user: a.user ? (userRef(people.get(String(a.user))) || { id: String(a.user), username: a.username || '(deleted)' }) : null,
      actor: a.actor ? userRef(people.get(String(a.actor))) : null
    })), total, p),
    types: ACTIVITY_TYPES
  });
});

/* ---------- audit ---------- */

router.get('/audit', requirePermission('audit.view'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'at') };
  if (q.action) f.action = String(q.action).slice(0, 60);
  if (q.actor) { const id = await resolveUserParam(q.actor); if (id === null) return res.json({ ...paged([], 0, p), actions: [] }); f.actor = id; }
  if (q.target) f.$or = [{ targetId: String(q.target).slice(0, 40) }, { targetLabel: { $regex: `^${escapeRe(String(q.target).slice(0, 40))}`, $options: 'i' } }];
  const [rows, total, actions] = await Promise.all([AuditLog.find(f).sort({ seq: -1 }).skip(p.skip).limit(p.limit).lean(), AuditLog.countDocuments(f), AuditLog.distinct('action')]);
  res.json({
    ...paged(rows.map(a => ({ id: String(a._id), seq: a.seq, at: a.at, actor: a.actorLabel, actorId: a.actor ? String(a.actor) : null, action: a.action, targetType: a.targetType, targetId: a.targetId, target: a.targetLabel, reason: a.reason, metadata: a.metadata, ip: a.ip, hash: a.hash.slice(0, 16) })), total, p),
    actions: actions.sort()
  });
});

/** Re-hashes the whole chain to prove no audit record was altered or removed. */
router.get('/audit/verify', requirePermission('audit.view'), async (req, res) => {
  const result = await verifyAuditChain();
  await audit({ actor: req.user, action: 'VERIFY_AUDIT_LOG', targetType: 'audit', metadata: { ok: result.ok, checked: result.checked }, req });
  res.json(result);
});

/* ---------- competitions ---------- */

router.get('/competitions/live', requirePermission('competitions.manage'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ rooms: registry.rooms ? registry.rooms.list() : [], available: !!registry.rooms });
});

router.post('/competitions/live/:code/close', requirePermission('competitions.manage'), async (req, res) => {
  if (!registry.rooms) return bad(res, 'Live rooms are not available on this server.', 503);
  let closed;
  try { closed = registry.rooms.adminClose(req.params.code); } catch (err) { return bad(res, err.message, 404); }
  await audit({ actor: req.user, action: 'CLOSE_ROOM', targetType: 'room', targetId: closed.code, targetLabel: `Room ${closed.code}`, metadata: { previousStatus: closed.status }, req });
  res.json({ ok: true, ...closed });
});

router.get('/competitions', requirePermission('competitions.manage'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = { ...dateFilter(q, 'createdAt') };
  if (['WAITING', 'COUNTDOWN', 'RUNNING', 'FINISHED', 'CANCELLED', 'EXPIRED'].includes(q.status)) f.status = q.status;
  if (q.code) f.roomCode = String(q.code).toUpperCase().slice(0, 6);
  if (q.user) { const id = await resolveUserParam(q.user); if (id === null) return res.json(paged([], 0, p)); f.players = id; }
  const [rows, total, stats] = await Promise.all([
    CompetitionRoom.find(f).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(), CompetitionRoom.countDocuments(f),
    CompetitionRoom.aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, disconnects: { $sum: '$disconnects' } } }])
  ]);
  const hosts = new Map((await User.find({ _id: { $in: rows.map(r => r.host) } }).select('username avatar').lean()).map(u => [String(u._id), u]));
  res.json({
    ...paged(rows.map(c => ({
      id: String(c._id), code: c.roomCode, status: c.status, endReason: c.endReason, host: userRef(hosts.get(String(c.host))), settings: c.settings,
      players: (c.players || []).length, createdAt: c.createdAt, startedAt: c.startedAt || null, finishedAt: c.finishedAt || null,
      durationSeconds: c.startedAt && c.finishedAt ? Math.round((c.finishedAt - c.startedAt) / 1000) : null, disconnects: c.disconnects || 0,
      standings: (c.standings || []).map(s => ({ rank: s.rank, username: s.username, userId: s.user ? String(s.user) : null, wpm: Math.round(s.wpm || 0), acc: Math.round((s.acc || 0) * 10) / 10, status: s.status, left: !!s.left }))
    })), total, p),
    stats: Object.fromEntries(stats.map(s => [s._id, { rooms: s.n, disconnects: s.disconnects }]))
  });
});

router.get('/competitions/:id', requirePermission('competitions.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Competition not found.', 404);
  const c = await CompetitionRoom.findById(req.params.id).lean();
  if (!c) return bad(res, 'Competition not found.', 404);
  const [results, people] = await Promise.all([
    Result.find({ 'race.room': c._id }).sort({ 'race.rank': 1 }).lean(),
    User.find({ _id: { $in: [c.host, ...(c.players || [])] } }).select('username avatar status').lean()
  ]);
  const byId = new Map(people.map(u => [String(u._id), u]));
  res.json({
    id: String(c._id), code: c.roomCode, status: c.status, endReason: c.endReason, settings: c.settings, host: userRef(byId.get(String(c.host))),
    players: (c.players || []).map(id => userRef(byId.get(String(id))) || { id: String(id), username: '(deleted)' }),
    createdAt: c.createdAt, startedAt: c.startedAt, finishedAt: c.finishedAt, disconnects: c.disconnects || 0,
    results: results.map(r => ({ user: userRef(byId.get(String(r.user))), rank: r.race.rank, status: r.race.status, wpm: r.wpm, raw: r.raw, acc: r.acc, consistency: r.consistency, elapsed: r.elapsed, chars: r.chars }))
  });
});

export default router;
