import fs from 'node:fs';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { Session } from '../../models/Session.js';
import { SecurityEvent } from '../../models/SecurityEvent.js';
import { ActivityEvent } from '../../models/ActivityEvent.js';
import { AuditLog } from '../../models/AuditLog.js';
import { SystemError, ErrorEvent } from '../../models/SystemError.js';
import { AdminNotification, ExportJob, Report, EXPORT_KINDS, EXPORT_FORMATS } from '../../models/AdminData.js';
import { requirePermission, can, permissionsFor } from '../../middleware/admin.js';
import { audit } from '../../services/audit.js';
import { getSettings, updateSettings } from '../../services/settings.js';
import { apiMetrics, hostMetrics, databaseHealth, errorCounts } from '../../services/monitoring.js';
import { enqueueExport } from '../../services/exporter.js';
import { reportPeriod, buildReport, flattenReport, runRetention } from '../../services/jobs.js';
import { revokeSessions } from '../../services/accounts.js';
import { hub } from '../../realtime/hub.js';
import { registry } from '../../realtime/registry.js';
import { liveVisitors } from '../../services/tracking.js';
import { config } from '../../config.js';
import { csvCell } from '../../utils/xlsx.js';
import { paging, paged, escapeRe, isId, bad, body, resolveUserParam, userRef } from './helpers.js';
import { getTrafficStats, updateTrafficConfig, simulateTrafficSpike } from '../../services/trafficManager.js';

const router = Router();
const perUser = (limit, windowMs, message) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.user._id), message: { error: message } });

/* ---------- admin profile and sidebar badges ---------- */

router.get('/me', async (req, res) => {
  const u = req.user;
  const [sessions, unread, openSecurity, openErrors] = await Promise.all([
    Session.find({ user: u._id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ lastActiveAt: -1 }).select('-tokenHash -userAgent').lean(),
    AdminNotification.countDocuments({ readBy: { $ne: u._id }, clearedBy: { $ne: u._id } }),
    can(u, 'security.view') ? SecurityEvent.countDocuments({ acknowledgedAt: { $exists: false }, severity: { $in: ['suspicious', 'critical'] } }) : 0,
    can(u, 'errors.manage') ? SystemError.countDocuments({ status: 'open' }) : 0
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({
    user: { id: String(u._id), username: u.username, email: u.email, avatar: u.avatar || '', role: u.role, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null },
    permissions: permissionsFor(u),
    sessions: sessions.map(s => ({ id: String(s._id), current: String(s._id) === String(req.session._id), device: s.device, browser: s.browser, os: s.os, ip: s.ip, country: s.country, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt || s.createdAt, expiresAt: s.expiresAt })),
    badges: { notifications: unread, security: openSecurity, errors: openErrors },
    app: { version: config.appVersion, env: config.env }
  });
});

router.post('/me/sessions/:id/revoke', async (req, res) => {
  if (!isId(req.params.id) || !(await Session.exists({ _id: req.params.id, user: req.user._id }))) return bad(res, 'Session not found.', 404);
  await revokeSessions(req.user._id, { sessionId: req.params.id, reason: 'self', by: req.user });
  await audit({ actor: req.user, action: 'REVOKE_OWN_SESSION', targetType: 'session', targetId: req.params.id, req });
  res.json({ ok: true, signedOut: String(req.session._id) === req.params.id });
});

/* ---------- system health ---------- */

router.get('/system', requirePermission('system.view'), async (req, res) => {
  const [db, host, errors] = await Promise.all([databaseHealth(), hostMetrics(), errorCounts()]);
  const api = apiMetrics();
  const apiStatus = api.requestsLast5Min >= 20 && api.errorRate5Min > 0.2 ? 'degraded' : 'ok';
  res.set('Cache-Control', 'no-store');
  res.json({
    application: { status: db.status === 'down' ? 'degraded' : apiStatus, version: config.appVersion, environment: config.env, uptimeSeconds: host.uptimeSeconds, node: host.node, platform: host.platform },
    database: db,
    api: { status: apiStatus, ...api },
    server: host,
    realtime: { connections: hub.connectionCount, onlineUsers: hub.sockets.size, rooms: registry.rooms ? registry.rooms.rooms.size : 0, liveVisitors: liveVisitors().length },
    traffic: getTrafficStats(),
    errors
  });
});

/* ---------- traffic manager ---------- */

router.get('/traffic', requirePermission('system.view'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getTrafficStats());
});

router.put('/traffic', requirePermission('settings.app'), (req, res) => {
  const updated = updateTrafficConfig(req.body);
  res.json(updated);
});

router.post('/traffic/simulate', requirePermission('system.view'), (req, res) => {
  const count = Number(req.body.count) || 350;
  const result = simulateTrafficSpike(count);
  res.json({ ok: true, simulated: count, stats: result });
});

/* ---------- errors ---------- */

router.get('/errors', requirePermission('errors.manage'), async (req, res) => {
  const q = req.query, p = paging(q);
  const f = {};
  if (['open', 'acknowledged', 'resolved'].includes(q.status)) f.status = q.status;
  if (['low', 'medium', 'high', 'critical'].includes(q.severity)) f.severity = q.severity;
  if (['server', 'client', 'realtime'].includes(q.source)) f.source = q.source;
  const term = String(q.q || '').trim().slice(0, 60);
  if (term) f.$or = [{ message: { $regex: escapeRe(term), $options: 'i' } }, { route: { $regex: escapeRe(term), $options: 'i' } }, { type: { $regex: `^${escapeRe(term)}`, $options: 'i' } }];
  const [rows, total] = await Promise.all([SystemError.find(f).sort({ lastSeen: -1 }).skip(p.skip).limit(p.limit).select('-stack').lean(), SystemError.countDocuments(f)]);
  res.json(paged(rows.map(e => ({ id: String(e._id), source: e.source, type: e.type, message: e.message, route: e.route, severity: e.severity, count: e.count, firstSeen: e.firstSeen, lastSeen: e.lastSeen, requestId: e.lastRequestId, status: e.status })), total, p));
});

router.get('/errors/:id', requirePermission('errors.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Error not found.', 404);
  const e = await SystemError.findById(req.params.id).lean();
  if (!e) return bad(res, 'Error not found.', 404);
  const since = new Date(Date.now() - 24 * 3600e3);
  const hourly = await ErrorEvent.aggregate([{ $match: { fingerprint: e.fingerprint, at: { $gte: since } } }, { $group: { _id: { $dateTrunc: { date: '$at', unit: 'hour' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const by = e.statusBy ? await User.findById(e.statusBy).select('username').lean() : null;
  res.json({ ...e, id: String(e._id), statusBy: by?.username || null, last24h: hourly.map(h => ({ t: h._id, n: h.n })) });
});

router.post('/errors/:id/status', requirePermission('errors.manage'), async (req, res) => {
  const d = body(z.object({ status: z.enum(['open', 'acknowledged', 'resolved']) }), req, res); if (!d) return;
  if (!isId(req.params.id)) return bad(res, 'Error not found.', 404);
  const e = await SystemError.findByIdAndUpdate(req.params.id, { $set: { status: d.status, statusBy: req.user._id, statusAt: new Date() } }, { new: true });
  if (!e) return bad(res, 'Error not found.', 404);
  await audit({ actor: req.user, action: `ERROR_${d.status.toUpperCase()}`, targetType: 'error', targetId: e._id, targetLabel: `${e.type}: ${e.message.slice(0, 80)}`, req });
  res.json({ ok: true });
});

/* ---------- exports ---------- */

const exportSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  format: z.enum(EXPORT_FORMATS),
  filters: z.object({
    from: z.string().max(40).optional(), to: z.string().max(40).optional(),
    status: z.string().max(20).optional(), role: z.string().max(20).optional(), provider: z.string().max(20).optional(),
    type: z.string().max(40).optional(), severity: z.string().max(20).optional(), device: z.string().max(20).optional(),
    route: z.string().max(60).optional(), user: z.string().max(40).optional()
  }).optional().default({})
});

router.post('/exports', requirePermission('export.manage'), perUser(20, 3600e3, 'Too many exports this hour.'), async (req, res) => {
  const d = body(exportSchema, req, res); if (!d) return;
  const filters = Object.fromEntries(Object.entries(d.filters).filter(([, v]) => v));
  for (const k of ['from', 'to']) if (filters[k] && Number.isNaN(+new Date(filters[k]))) return bad(res, 'Choose valid dates.');
  if (filters.user) { const id = await resolveUserParam(filters.user); if (!id) return bad(res, 'No user matches that filter.', 404); filters.user = String(id); }
  const job = await ExportJob.create({ requestedBy: req.user._id, requestedByLabel: req.user.username, kind: d.kind, format: d.format, filters });
  await audit({ actor: req.user, action: 'EXPORT_REQUESTED', targetType: 'export', targetId: job._id, targetLabel: `${d.kind}.${d.format}`, metadata: { kind: d.kind, format: d.format, filters }, req });
  enqueueExport(job._id);
  res.status(202).json({ id: String(job._id) });
});

const jobView = (j, me) => ({ id: String(j._id), kind: j.kind, format: j.format, filters: j.filters, status: j.status, progress: j.progress, total: j.total, rows: j.rows, bytes: j.bytes, error: j.error, createdAt: j.createdAt, finishedAt: j.finishedAt || null, expiresAt: j.expiresAt || null, requestedBy: j.requestedByLabel, mine: String(j.requestedBy) === String(me._id), downloads: j.downloads });

router.get('/exports', requirePermission('export.manage'), async (req, res) => {
  const jobs = await ExportJob.find().sort({ createdAt: -1 }).limit(50).lean();
  res.set('Cache-Control', 'no-store');
  res.json({ items: jobs.map(j => jobView(j, req.user)) });
});

router.get('/exports/:id', requirePermission('export.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Export not found.', 404);
  const j = await ExportJob.findById(req.params.id).lean();
  if (!j) return bad(res, 'Export not found.', 404);
  res.set('Cache-Control', 'no-store');
  res.json(jobView(j, req.user));
});

/** Files are private: only the admin who requested an export (or a super admin) can download it. */
router.get('/exports/:id/download', requirePermission('export.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Export not found.', 404);
  const j = await ExportJob.findById(req.params.id);
  if (!j) return bad(res, 'Export not found.', 404);
  if (String(j.requestedBy) !== String(req.user._id) && req.user.role !== 'SUPER_ADMIN') return bad(res, 'Only the admin who requested this export can download it.', 403);
  if (j.status !== 'done' || !j.file || !fs.existsSync(j.file)) return bad(res, j.status === 'done' ? 'This export file is no longer available. Run it again.' : 'This export is not ready.', 410);
  j.downloads += 1; await j.save();
  await audit({ actor: req.user, action: 'EXPORT_DOWNLOADED', targetType: 'export', targetId: j._id, targetLabel: `${j.kind}.${j.format}`, metadata: { rows: j.rows }, req });
  const type = { csv: 'text/csv; charset=utf-8', json: 'application/json', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[j.format];
  res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="cadence-${j.kind}-${j.createdAt.toISOString().slice(0, 10)}.${j.format}"`, 'Cache-Control': 'no-store' });
  fs.createReadStream(j.file).pipe(res);
});

/* ---------- reports ---------- */

router.post('/reports', requirePermission('reports.manage'), perUser(30, 3600e3, 'Too many reports this hour.'), async (req, res) => {
  const d = body(z.object({ type: z.enum(['daily', 'weekly', 'monthly']), date: z.string().max(40).optional(), tz: z.string().max(60).optional() }), req, res); if (!d) return;
  let tz = 'UTC';
  try { if (d.tz) { new Intl.DateTimeFormat('en-US', { timeZone: d.tz }); tz = d.tz; } } catch { /* fall back to UTC */ }
  const r = reportPeriod(d.type, d.date, tz);
  const data = await buildReport(d.type, r);
  const report = await Report.create({ type: d.type, from: r.from, to: r.to, data, createdBy: req.user._id, createdByLabel: req.user.username });
  await audit({ actor: req.user, action: 'REPORT_GENERATED', targetType: 'report', targetId: report._id, targetLabel: `${d.type} report`, metadata: { from: r.from.toISOString(), to: r.to.toISOString() }, req });
  res.status(201).json({ id: String(report._id) });
});

router.get('/reports', requirePermission('reports.manage'), async (req, res) => {
  const p = paging(req.query, 50);
  const [rows, total] = await Promise.all([Report.find().sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).select('-data').lean(), Report.countDocuments()]);
  res.json(paged(rows.map(r => ({ id: String(r._id), type: r.type, from: r.from, to: r.to, createdAt: r.createdAt, createdBy: r.createdByLabel })), total, p));
});

router.get('/reports/:id', requirePermission('reports.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Report not found.', 404);
  const r = await Report.findById(req.params.id).lean();
  if (!r) return bad(res, 'Report not found.', 404);
  res.json({ id: String(r._id), type: r.type, from: r.from, to: r.to, createdAt: r.createdAt, createdBy: r.createdByLabel, data: r.data });
});

router.get('/reports/:id/download', requirePermission('reports.manage'), async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Report not found.', 404);
  const r = await Report.findById(req.params.id).lean();
  if (!r) return bad(res, 'Report not found.', 404);
  const name = `cadence-${r.type}-report-${new Date(r.to).toISOString().slice(0, 10)}`;
  res.set('Cache-Control', 'no-store');
  if (req.query.format === 'csv') {
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` });
    res.send(`﻿metric,value\n${flattenReport(r.data).map(([k, v]) => `${csvCell(k)},${csvCell(v)}`).join('\n')}\n`);
  } else {
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${name}.json"` });
    res.send(JSON.stringify({ type: r.type, from: r.from, to: r.to, generatedAt: r.createdAt, generatedBy: r.createdByLabel, ...r.data }, null, 2));
  }
});

/* ---------- settings and data management ---------- */

router.get('/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ settings: await getSettings(), canEdit: { application: can(req.user, 'settings.app'), security: can(req.user, 'settings.security'), retention: can(req.user, 'settings.retention') } });
});

const SECTIONS = {
  application: {
    perm: 'settings.app',
    schema: z.object({
      registrationsOpen: z.boolean(),
      trackingEnabled: z.boolean(),
      respectDoNotTrack: z.boolean(),
      maintenanceMode: z.boolean(),
      maintenanceStart: z.string().max(100),
      maintenanceEnd: z.string().max(100),
      maintenanceMessage: z.string().max(500)
    }).partial()
  },
  security: { perm: 'settings.security', schema: z.object({ failedLoginWarn: z.number().int().min(2).max(100), failedLoginCritical: z.number().int().min(3).max(500), multiAccountIp: z.number().int().min(2).max(50), windowMinutes: z.number().int().min(1).max(1440) }).partial() },
  retention: { perm: 'settings.retention', schema: z.object({ pageViewDays: z.number().int().min(7).max(730), visitorSessionDays: z.number().int().min(7).max(730), activityDays: z.number().int().min(7).max(1095), loginEventDays: z.number().int().min(30).max(1095), securityEventDays: z.number().int().min(30).max(1825), errorDays: z.number().int().min(1).max(365), exportHours: z.number().int().min(1).max(168) }).partial() }
};
for (const [section, { perm, schema }] of Object.entries(SECTIONS)) {
  router.put(`/settings/${section}`, requirePermission(perm), async (req, res) => {
    const d = body(schema, req, res); if (!d) return;
    if (!Object.keys(d).length) return bad(res, 'Nothing to change.');
    const before = (await getSettings())[section];
    const next = await updateSettings(section, d);
    if (section === 'security' && next.security.failedLoginCritical <= next.security.failedLoginWarn) {
      await updateSettings(section, before);
      return bad(res, 'The critical threshold must be higher than the warning threshold.');
    }
    const changed = Object.fromEntries(Object.keys(d).filter(k => before[k] !== d[k]).map(k => [k, { from: before[k], to: d[k] }]));
    await audit({ actor: req.user, action: 'SETTINGS_CHANGED', targetType: 'settings', targetId: section, targetLabel: `${section} settings`, metadata: changed, req });
    res.json({ settings: next });
  });
}

router.post('/settings/retention/run', requirePermission('settings.retention'), perUser(6, 3600e3, 'Cleanup already ran several times this hour.'), async (req, res) => {
  const removed = await runRetention();
  await audit({ actor: req.user, action: 'RETENTION_RUN', targetType: 'settings', targetId: 'retention', metadata: removed || {}, req });
  res.json({ removed });
});

router.get('/data', requirePermission('settings.retention'), async (req, res) => {
  const names = ['users', 'sessions', 'results', 'loginevents', 'activityevents', 'securityevents', 'auditlogs', 'pageviews', 'visitorsessions', 'systemerrors', 'errorevents', 'competitionrooms', 'friendships', 'dailyactivities', 'exportjobs', 'reports', 'adminnotifications'];
  const db = mongoose.connection.db;
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
  const rows = await Promise.all(names.filter(n => existing.has(n)).map(async name => {
    const [s] = await db.collection(name).aggregate([{ $collStats: { storageStats: {} } }]).toArray().catch(() => [null]);
    return { name, documents: s?.storageStats?.count ?? await db.collection(name).estimatedDocumentCount(), size: s?.storageStats?.size ?? null, storage: s?.storageStats?.storageSize ?? null, indexes: s?.storageStats?.nindexes ?? null };
  }));
  res.json({ collections: rows, settings: (await getSettings()).retention, auditNote: 'Audit logs are kept indefinitely and are never purged by retention.' });
});

/* ---------- notifications ---------- */

router.get('/notifications', async (req, res) => {
  const me = req.user._id;
  const rows = await AdminNotification.find({ clearedBy: { $ne: me } }).sort({ createdAt: -1 }).limit(50).lean();
  res.set('Cache-Control', 'no-store');
  res.json({ items: rows.map(n => ({ id: String(n._id), type: n.type, severity: n.severity, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt, read: n.readBy.some(id => String(id) === String(me)) })), unread: rows.filter(n => !n.readBy.some(id => String(id) === String(me))).length });
});

const idsSchema = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100).optional(), all: z.boolean().optional() });
for (const [path, field] of [['read', 'readBy'], ['clear', 'clearedBy']]) {
  router.post(`/notifications/${path}`, async (req, res) => {
    const d = body(idsSchema, req, res); if (!d) return;
    const filter = d.all ? {} : { _id: { $in: d.ids || [] } };
    const update = field === 'clearedBy' ? { $addToSet: { clearedBy: req.user._id, readBy: req.user._id } } : { $addToSet: { readBy: req.user._id } };
    await AdminNotification.updateMany(filter, update);
    res.json({ ok: true });
  });
}

/* ---------- global search ---------- */

/** One search box across users, sessions, audit, activity and security, limited to what the admin may see. */
router.get('/search', perUser(120, 60000, 'Too many searches.'), async (req, res) => {
  const term = String(req.query.q || '').trim().slice(0, 80);
  if (term.length < 2) return res.json({ users: [], sessions: [], audit: [], activity: [], security: [] });
  const re = { $regex: `^${escapeRe(term.toLowerCase())}` };
  const reI = { $regex: escapeRe(term), $options: 'i' };
  const u = req.user;
  const tasks = {
    users: can(u, 'users.view') ? User.find({ $or: [{ usernameNormalized: re }, { email: re }, ...(isId(term) ? [{ _id: term }] : []), { githubLogin: { $regex: `^${escapeRe(term)}`, $options: 'i' } }] }).limit(6).select('username email avatar role status').lean() : [],
    sessions: can(u, 'sessions.manage') && isId(term) ? Session.find({ _id: term }).select('user device browser os createdAt revokedAt expiresAt').populate('user', 'username avatar').lean() : [],
    audit: can(u, 'audit.view') ? AuditLog.find({ $or: [{ action: { $regex: `^${escapeRe(term.toUpperCase())}` } }, { targetLabel: reI }, { targetId: term }] }).sort({ seq: -1 }).limit(5).lean().maxTimeMS(2000) : [],
    activity: can(u, 'activity.view') ? ActivityEvent.find({ $or: [{ type: { $regex: `^${escapeRe(term.toUpperCase())}` } }, { username: re }] }).sort({ createdAt: -1 }).limit(5).lean().maxTimeMS(2000) : [],
    security: can(u, 'security.view') ? SecurityEvent.find({ $or: [{ title: reI }, { ip: { $regex: `^${escapeRe(term)}` } }, { type: { $regex: `^${escapeRe(term.toLowerCase())}` } }] }).sort({ lastSeenAt: -1 }).limit(5).lean().maxTimeMS(2000) : []
  };
  const [users, sessions, auditRows, activity, security] = await Promise.all(Object.values(tasks).map(t => Promise.resolve(t).catch(() => [])));
  res.json({
    users: users.map(x => ({ id: String(x._id), username: x.username, email: x.email, avatar: x.avatar || '', role: x.role || 'USER', status: x.status || 'active' })),
    sessions: sessions.map(s => ({ id: String(s._id), user: userRef(s.user), device: s.device, browser: s.browser, createdAt: s.createdAt, status: s.revokedAt ? 'revoked' : s.expiresAt < new Date() ? 'expired' : 'active' })),
    audit: auditRows.map(a => ({ id: String(a._id), seq: a.seq, action: a.action, actor: a.actorLabel, target: a.targetLabel, at: a.at })),
    activity: activity.map(a => ({ id: String(a._id), type: a.type, username: a.username, at: a.createdAt })),
    security: security.map(s => ({ id: String(s._id), title: s.title, severity: s.severity, at: s.lastSeenAt }))
  });
});

export default router;
