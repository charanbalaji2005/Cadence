/**
 * Admin panel, end to end: real routes, real auth, in-memory MongoDB (never the .env database).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { loadSession, csrfGuard } from '../src/middleware/auth.js';
import authRoutes from '../src/routes/auth.js';
import adminRoutes from '../src/routes/admin/index.js';
import trackRoutes from '../src/routes/track.js';
import { metricsMiddleware, captureError } from '../src/services/monitoring.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { LoginEvent } from '../src/models/LoginEvent.js';
import { SecurityEvent } from '../src/models/SecurityEvent.js';
import { ActivityEvent } from '../src/models/ActivityEvent.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { PageView, VisitorSession } from '../src/models/Analytics.js';
import { SystemError } from '../src/models/SystemError.js';
import { AdminNotification } from '../src/models/AdminData.js';
import { hashToken } from '../src/utils/session.js';
import { resetSettingsCache } from '../src/services/settings.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
let mongo, server, base;
const U = {};

async function makeUser(username, role = 'USER') {
  const user = await User.create({ username, usernameLower: username, usernameNormalized: username, email: `${username}@example.com`, provider: 'email', profileCompleted: true, role });
  const token = crypto.randomBytes(32).toString('hex');
  const s = await Session.create({ tokenHash: hashToken(token), user: user._id, expiresAt: new Date(Date.now() + 864e5), device: 'Desktop', browser: 'Chrome', os: 'Windows' });
  return { id: user._id.toString(), username, email: user.email, cookie: `tf_session=${token}`, sessionId: s._id.toString() };
}

async function call(user, method, path, data, extra = {}) {
  const headers = { 'User-Agent': UA, 'X-Requested-With': 'TypeFlow', ...(user ? { Cookie: user.cookie || user } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra };
  const res = await fetch(`${base}/api${path}`, { method, headers, body: data !== undefined ? JSON.stringify(data) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, headers: res.headers, cookie: res.headers.get('set-cookie') };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, timeout = 8000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeout) throw new Error('timed out'); await sleep(100); } }

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: true });
  await Promise.all(mongoose.modelNames().map(n => mongoose.model(n).init()));
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => { req.id = crypto.randomUUID(); next(); });
  app.use(metricsMiddleware);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', loadSession, csrfGuard);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/t', trackRoutes);
  app.get('/api/boom', () => { throw new Error('Kaboom token=abcdef0123456789abcdef0123456789xyz for jane@example.com'); });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err?.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
    captureError(err, { source: 'server', route: `${req.method} ${req.originalUrl}`, requestId: req.id });
    res.status(500).json({ error: 'Server error' });
  });
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  U.root = await makeUser('rootadmin', 'SUPER_ADMIN');
  U.admin = await makeUser('opsadmin', 'ADMIN');
  U.admin2 = await makeUser('otheradmin', 'ADMIN');
  U.mod = await makeUser('modder', 'MODERATOR');
  U.user = await makeUser('plainuser');
  U.target = await makeUser('troublemaker');
});

after(async () => {
  await new Promise(r => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
});

describe('access control', () => {
  test('signed-out requests are refused', async () => {
    assert.equal((await call(null, 'GET', '/admin/me')).status, 401);
    assert.equal((await call(null, 'GET', '/admin/users')).status, 401);
  });

  test('a normal user gets 403 on every admin API, and the attempt is recorded', async () => {
    for (const path of ['/admin/me', '/admin/users', '/admin/analytics/overview', '/admin/audit', '/admin/exports']) {
      assert.equal((await call(U.user, 'GET', path)).status, 403, path);
    }
    assert.equal((await call(U.user, 'POST', `/admin/users/${U.target.id}/suspend`, { reason: 'spam' })).status, 403);
    const ev = await until(() => SecurityEvent.findOne({ type: 'admin_access_denied', user: U.user.id }));
    assert.equal(ev.severity, 'suspicious');
    assert.ok(ev.count >= 5);
  });

  test('CSRF header is required for admin writes', async () => {
    const r = await call(U.admin, 'POST', `/admin/users/${U.target.id}/suspend`, { reason: 'spam' }, { 'X-Requested-With': 'nope' });
    assert.equal(r.status, 403);
  });

  test('admins get their permissions; moderators get fewer', async () => {
    const a = await call(U.admin, 'GET', '/admin/me');
    assert.equal(a.status, 200);
    assert.ok(a.body.permissions.includes('export.manage'));
    assert.ok(!a.body.permissions.includes('users.roles'), 'only super admins change roles');
    const m = await call(U.mod, 'GET', '/admin/me');
    assert.ok(m.body.permissions.includes('users.moderate'));
    assert.ok(!m.body.permissions.includes('audit.view'));
    assert.equal((await call(U.mod, 'GET', '/admin/audit')).status, 403);
    assert.equal((await call(U.mod, 'POST', '/admin/exports', { kind: 'users', format: 'csv' })).status, 403);
  });

  test('a role sent by the client is ignored', async () => {
    const r = await call(U.user, 'GET', '/admin/users?role=SUPER_ADMIN', undefined, { 'X-Role': 'SUPER_ADMIN' });
    assert.equal(r.status, 403);
  });
});

describe('authentication events', () => {
  let fresh;
  test('sign-up records a signup event, activity and the approximate country', async () => {
    const r = await call(null, 'POST', '/auth/register', { username: 'newbie', email: 'newbie@example.com', password: 'correct horse battery' }, { 'Accept-Language': 'en-IN,en;q=0.9' });
    assert.equal(r.status, 201);
    fresh = r.cookie.split(';')[0];
    const u = await User.findOne({ email: 'newbie@example.com' });
    assert.equal(u.signupCountry, 'IN');
    const ev = await LoginEvent.findOne({ user: u._id, type: 'signup' });
    assert.ok(ev && ev.success && ev.browser === 'Chrome' && ev.os === 'Windows' && ev.device === 'Desktop');
    assert.ok(await ActivityEvent.exists({ user: u._id, type: 'USER_SIGNUP' }));
    const s = await Session.findOne({ user: u._id });
    assert.equal(s.browser, 'Chrome');
  });

  test('repeated wrong passwords become a suspicious security event (without storing the email)', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await call(null, 'POST', '/auth/login', { email: 'newbie@example.com', password: 'wrong-password' })).status, 401);
    const fails = await LoginEvent.find({ type: 'failed', reason: 'wrong_password' });
    assert.equal(fails.length, 5);
    assert.equal(fails[0].identifier, 'ne****@example.com');
    assert.ok(!JSON.stringify(fails).includes('newbie@example.com'));
    const sec = await until(() => SecurityEvent.findOne({ type: 'failed_login_burst' }));
    assert.equal(sec.severity, 'suspicious');
    assert.equal((await LoginEvent.findOne({ type: 'failed' }).sort({ createdAt: -1 })).risk, 'suspicious');
    // Unknown emails are counted by hash too.
    await call(null, 'POST', '/auth/login', { email: 'ghost@example.com', password: 'whatever1' });
    assert.ok(await LoginEvent.exists({ reason: 'unknown_email', identifier: /^gh\*{2,}@example\.com$/ }));
  });

  test('successful login and logout are recorded; logout revokes the session', async () => {
    const r = await call(null, 'POST', '/auth/login', { email: 'newbie@example.com', password: 'correct horse battery' });
    assert.equal(r.status, 200);
    const cookie = r.cookie.split(';')[0];
    assert.ok(await LoginEvent.exists({ type: 'login', success: true, username: 'newbie' }));
    assert.equal((await call(cookie, 'POST', '/auth/logout')).status, 200);
    assert.ok(await LoginEvent.exists({ type: 'logout', username: 'newbie' }));
    const me = await call(cookie, 'GET', '/auth/me');
    assert.equal(me.body.user, null);
    assert.ok(await Session.exists({ revokedReason: 'logout' }));
    assert.ok(fresh);
  });

  test('login activity, stats and failed-login views', async () => {
    const list = await call(U.admin, 'GET', '/admin/logins?type=failed&limit=3');
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 3);
    assert.ok(list.body.total >= 6);
    const byEmail = await call(U.admin, 'GET', `/admin/logins?q=${encodeURIComponent('newbie@example.com')}`);
    assert.ok(byEmail.body.items.length >= 5);
    const stats = await call(U.admin, 'GET', '/admin/logins/stats?range=today');
    assert.equal(stats.body.totals.failed, 6);
    assert.equal(stats.body.totals.logins, 1);
    const failed = await call(U.admin, 'GET', '/admin/security/failed?range=7d');
    assert.equal(failed.body.byAccount[0].attempts, 5);
    assert.equal(failed.body.byAccount[0].risk, 'suspicious');
  });
});

describe('users and account actions', () => {
  test('list is paginated server-side, searchable and sortable', async () => {
    const page1 = await call(U.admin, 'GET', '/admin/users?limit=2&sort=usernameNormalized&dir=asc');
    assert.equal(page1.body.items.length, 2);
    assert.ok(page1.body.total >= 7);
    assert.equal(page1.body.items[0].username, 'modder');
    const search = await call(U.admin, 'GET', '/admin/users?q=trouble');
    assert.deepEqual(search.body.items.map(u => u.username), ['troublemaker']);
    assert.equal(search.body.items[0].sessions, 1);
    const admins = await call(U.admin, 'GET', '/admin/users?view=admins');
    assert.equal(admins.body.items.length, 4);
    assert.equal(admins.body.counts.admins, 4);
    assert.equal((await call(U.admin, 'GET', '/admin/users/not-an-id')).status, 404);
  });

  test('user details never include secrets', async () => {
    const d = await call(U.admin, 'GET', `/admin/users/${U.target.id}`);
    assert.equal(d.status, 200);
    const text = JSON.stringify(d.body);
    assert.ok(!/passwordHash|tokenHash/.test(text));
    assert.equal(d.body.sessions.length, 1);
    assert.equal(d.body.allowed.moderate, true);
  });

  test('suspend: needs a reason, signs the user out everywhere, blocks login, and is audited', async () => {
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.target.id}/suspend`, {})).status, 400);
    const r = await call(U.admin, 'POST', `/admin/users/${U.target.id}/suspend`, { reason: 'abuse', note: 'harassment in rooms' });
    assert.equal(r.status, 200);
    assert.equal((await call(U.target, 'GET', '/auth/me')).body.user, null, 'existing session no longer works');
    assert.equal((await Session.findById(U.target.sessionId)).revokedReason, 'suspended');
    const a = await AuditLog.findOne({ action: 'SUSPEND_USER' });
    assert.equal(a.targetId, U.target.id);
    assert.equal(a.actorLabel, 'opsadmin (ADMIN)');
    assert.match(a.reason, /abuse/);
    assert.ok(await ActivityEvent.exists({ type: 'ACCOUNT_SUSPENDED', user: U.target.id }));
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.target.id}/suspend`, { reason: 'abuse' })).status, 409);
  });

  test('a suspended account cannot sign in', async () => {
    await User.updateOne({ _id: U.target.id }, { $set: { passwordHash: await (await import('bcryptjs')).default.hash('pw-target-123', 4) } });
    const r = await call(null, 'POST', '/auth/login', { email: U.target.email, password: 'pw-target-123' });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /suspended/);
    assert.ok(await LoginEvent.exists({ type: 'blocked', reason: 'account_suspended' }));
  });

  test('activate restores the account', async () => {
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.target.id}/activate`)).status, 200);
    const r = await call(null, 'POST', '/auth/login', { email: U.target.email, password: 'pw-target-123' });
    assert.equal(r.status, 200);
  });

  test('nobody can act on themselves, an equal or a higher role', async () => {
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.admin.id}/suspend`, { reason: 'other' })).status, 403);
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.admin2.id}/suspend`, { reason: 'other' })).status, 403);
    assert.equal((await call(U.mod, 'POST', `/admin/users/${U.admin.id}/suspend`, { reason: 'other' })).status, 403);
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.root.id}/revoke-sessions`, {})).status, 403);
  });

  test('delete needs typed confirmation and is a reversible soft delete', async () => {
    assert.equal((await call(U.admin, 'DELETE', `/admin/users/${U.user.id}`, { confirm: 'delete' })).status, 400);
    assert.equal((await call(U.mod, 'DELETE', `/admin/users/${U.user.id}`, { confirm: 'DELETE' })).status, 403, 'moderators cannot delete');
    assert.equal((await call(U.admin, 'DELETE', `/admin/users/${U.user.id}`, { confirm: 'DELETE', reason: 'spam account' })).status, 200);
    const u = await User.findById(U.user.id);
    assert.equal(u.status, 'deleted');
    assert.equal((await call(U.admin, 'GET', '/admin/users?view=deleted')).body.items.length, 1);
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.user.id}/purge`, { confirm: 'DELETE' })).status, 403, 'only super admins purge');
  });

  test('super admins can purge a deleted account permanently', async () => {
    const extra = await makeUser('throwaway');
    assert.equal((await call(U.root, 'POST', `/admin/users/${extra.id}/purge`, { confirm: 'DELETE' })).status, 409, 'must be deleted first');
    await call(U.root, 'DELETE', `/admin/users/${extra.id}`, { confirm: 'DELETE' });
    assert.equal((await call(U.root, 'POST', `/admin/users/${extra.id}/purge`, { confirm: 'DELETE' })).status, 200);
    assert.equal(await User.exists({ _id: extra.id }), null);
    assert.ok(await AuditLog.exists({ action: 'PURGE_USER', targetLabel: /throwaway/ }));
  });

  test('role changes: super admin only, confirmed, never yourself, never the last super admin', async () => {
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.target.id}/role`, { role: 'ADMIN', confirm: true })).status, 403);
    assert.equal((await call(U.root, 'POST', `/admin/users/${U.target.id}/role`, { role: 'ADMIN' })).status, 400, 'confirmation required');
    assert.equal((await call(U.root, 'POST', `/admin/users/${U.target.id}/role`, { role: 'ADMIN', confirm: true })).status, 200);
    assert.ok(await AuditLog.exists({ action: 'CHANGE_ROLE', 'metadata.to': 'ADMIN' }));
    assert.ok(await AdminNotification.exists({ type: 'new_admin' }));
    assert.equal((await call(U.root, 'POST', `/admin/users/${U.target.id}/role`, { role: 'USER', confirm: true })).status, 200);
    assert.equal((await call(U.root, 'POST', `/admin/users/${U.root.id}/role`, { role: 'USER', confirm: true })).status, 403);
    assert.equal((await call(U.root, 'POST', `/admin/users/${U.target.id}/role`, { role: 'GOD', confirm: true })).status, 400);
  });

  test('sessions can be revoked one at a time', async () => {
    const v = await makeUser('sessiony');
    const list = await call(U.admin, 'GET', `/admin/sessions?user=sessiony&status=active`);
    assert.equal(list.body.items.length, 1);
    assert.equal((await call(U.admin, 'POST', `/admin/sessions/${v.sessionId}/revoke`)).status, 200);
    assert.equal((await call(v, 'GET', '/auth/me')).body.user, null);
    assert.equal((await call(U.admin, 'POST', `/admin/sessions/${v.sessionId}/revoke`)).status, 409);
    assert.equal((await call(U.admin, 'GET', '/admin/sessions?status=revoked&user=sessiony')).body.items[0].status, 'revoked');
  });

  test('user timeline merges activity and sign-ins', async () => {
    const t = await call(U.admin, 'GET', `/admin/users/${U.target.id}/timeline`);
    assert.equal(t.status, 200);
    const types = t.body.items.map(i => i.type);
    assert.ok(types.includes('ACCOUNT_SUSPENDED'));
    assert.ok(types.includes('login'));
  });
});

describe('visitor tracking and analytics', () => {
  const vid = 'v-0123456789abcdef', sid = 's-0123456789abcdef';
  test('page views create a visit; the next view carries the previous one\'s duration', async () => {
    const first = await call(null, 'POST', '/t/pv', { vid, sid, path: '/', referrer: 'https://www.google.com/search?q=typing', screen: 1440, lang: 'en-GB' });
    assert.equal(first.status, 200);
    const second = await call(null, 'POST', '/t/pv', { vid, sid, path: '/compete/ABC123?x=1', prev: { id: first.body.id, ms: 42000 } });
    assert.equal(second.status, 200);
    await sleep(100);
    assert.equal(await PageView.countDocuments({ sid }), 2);
    assert.equal((await PageView.findById(first.body.id)).durationMs, 42000);
    assert.ok(await PageView.exists({ route: '/compete/:code' }), 'room codes are not stored, only the route pattern');
    const visit = await VisitorSession.findOne({ sid });
    assert.equal(visit.pages, 2);
    assert.equal(visit.source, 'search');
    assert.equal(visit.referrer, 'google.com');
    assert.equal(visit.country, 'GB');
    assert.equal(visit.screen, '1280-1919');
    assert.equal(visit.entryRoute, '/');
    assert.equal(visit.exitRoute, '/compete/:code');
  });

  test('Do Not Track, Global Privacy Control, bots and admin pages are never recorded', async () => {
    const before = await PageView.countDocuments();
    assert.equal((await call(null, 'POST', '/t/pv', { vid, sid: 's-dnt-0000000001', path: '/' }, { DNT: '1' })).status, 204);
    assert.equal((await call(null, 'POST', '/t/pv', { vid, sid: 's-gpc-0000000001', path: '/' }, { 'Sec-GPC': '1' })).status, 204);
    assert.equal((await call(null, 'POST', '/t/pv', { vid, sid: 's-bot-0000000001', path: '/' }, { 'User-Agent': 'Googlebot/2.1' })).status, 204);
    await call(null, 'POST', '/t/pv', { vid, sid, path: '/admin/users' });
    assert.equal(await PageView.countDocuments(), before);
    assert.equal((await call(null, 'POST', '/t/pv', { vid: 'x', sid, path: '/' })).status, 400);
  });

  test('a returning visitor and a signed-in visitor', async () => {
    await call(null, 'POST', '/t/pv', { vid, sid: 's-second-visit-01', path: '/leaderboard' });
    await call(U.admin, 'POST', '/t/pv', { vid: 'v-admin-browser-01', sid: 's-admin-browser-01', path: '/stats', referrer: 'https://news.ycombinator.com/' });
    assert.equal((await VisitorSession.findOne({ sid: 's-second-visit-01' })).returning, true);
    const signedIn = await VisitorSession.findOne({ sid: 's-admin-browser-01' });
    assert.equal(String(signedIn.user), U.admin.id);
    assert.equal(signedIn.source, 'social');
  });

  test('live visitors come from memory', async () => {
    await call(null, 'POST', '/t/hb', { vid, sid, path: '/compete/ABC123' });
    const live = await call(U.admin, 'GET', '/admin/visitors/live');
    assert.ok(live.body.visitors.some(v => v.sid === sid && v.route === '/compete/:code'));
    assert.ok(live.body.online.visitors >= 2);
    await call(null, 'POST', '/t/leave', { vid, sid });
    assert.ok(!(await call(U.admin, 'GET', '/admin/visitors/live')).body.visitors.some(v => v.sid === sid));
  });

  test('dashboard numbers match the stored data', async () => {
    const o = (await call(U.admin, 'GET', '/admin/analytics/overview?range=7d')).body;
    assert.equal(o.kpis.pageViews.value, await PageView.countDocuments());
    assert.equal(o.kpis.visitors.value, (await VisitorSession.distinct('vid')).length);
    assert.equal(o.kpis.failedLogins.value, await LoginEvent.countDocuments({ type: 'failed' }));
    assert.equal(o.kpis.totalUsers.value, await User.countDocuments({ status: { $ne: 'deleted' } }));
    assert.equal(o.kpis.newToday.value, await User.countDocuments());
    assert.equal(o.kpis.pageViews.trend.length, o.range.keys.length);
    assert.equal(o.kpis.pageViews.trend.reduce((a, b) => a + b, 0), o.kpis.pageViews.value);
  });

  test('every analytics view responds with real aggregates', async () => {
    const pages = (await call(U.admin, 'GET', '/admin/analytics/pages?range=30d')).body.pages;
    assert.ok(pages.find(p => p.route === '/' && p.views === 1 && p.avgSeconds === 42));
    const traffic = (await call(U.admin, 'GET', '/admin/analytics/traffic?range=30d')).body;
    assert.equal(traffic.sources.find(s => s.source === 'search').sessions, 1);
    assert.deepEqual(traffic.referrers.map(x => x.host).sort(), ['google.com', 'news.ycombinator.com']);
    const devices = (await call(U.admin, 'GET', '/admin/analytics/devices?range=30d')).body;
    assert.equal(devices.browser[0].name, 'Chrome');
    const geo = (await call(U.admin, 'GET', '/admin/analytics/geography?range=30d')).body;
    assert.ok(geo.countries.some(c => c.country === 'GB'));
    assert.ok(geo.countries.some(c => c.country === 'IN' && c.users === 1));
    for (const v of ['users', 'visitors', 'activity', 'engagement', 'retention']) {
      const r = await call(U.admin, 'GET', `/admin/analytics/${v}?range=90d&tz=Asia/Kolkata`);
      assert.equal(r.status, 200, v);
    }
    assert.equal((await call(U.admin, 'GET', '/admin/analytics/users?range=custom&from=2026-01-10&to=2025-01-01')).status, 400);
  });
});

describe('audit log integrity', () => {
  test('the chain verifies, and the model refuses edits', async () => {
    const ok = await call(U.admin, 'GET', '/admin/audit/verify');
    assert.equal(ok.body.ok, true);
    assert.ok(ok.body.checked >= 5);
    await assert.rejects(AuditLog.updateOne({ seq: 1 }, { $set: { reason: 'nothing to see' } }), /cannot be modified/);
    await assert.rejects(AuditLog.deleteMany({}), /cannot be modified/);
  });

  test('tampering through the raw database is detected', async () => {
    await AuditLog.collection.updateOne({ seq: 2 }, { $set: { reason: 'edited later' } });
    const r = await call(U.admin, 'GET', '/admin/audit/verify');
    assert.equal(r.body.ok, false);
    assert.equal(r.body.brokenAt, 2);
    assert.match(r.body.problem, /changed/);
  });
});

describe('exports, reports, errors, settings', () => {
  async function exportOf(user, kind, format, filters) {
    const r = await call(user, 'POST', '/admin/exports', { kind, format, filters });
    assert.equal(r.status, 202);
    await until(async () => ['done', 'failed'].includes((await call(user, 'GET', `/admin/exports/${r.body.id}`)).body.status));
    return r.body.id;
  }

  test('CSV export of users, with spreadsheet formulas neutralised', async () => {
    await User.updateOne({ username: 'sessiony' }, { $set: { username: '=cmd|calc' } });
    const id = await exportOf(U.admin, 'users', 'csv');
    const dl = await call(U.admin, 'GET', `/admin/exports/${id}/download`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-disposition'), /cadence-users-.*\.csv/);
    const lines = dl.text.replace(/^﻿/, '').trim().split('\n');
    assert.match(lines[0], /^id,username,email,role,status/);
    assert.equal(lines.length - 1, await User.countDocuments());
    assert.ok(dl.text.includes(`'=cmd|calc`));
    assert.ok(!/passwordHash|tokenHash/.test(dl.text));
    assert.ok(await AuditLog.exists({ action: 'EXPORT_DOWNLOADED' }));
  });

  test('JSON and XLSX exports; only the requester can download', async () => {
    const j = await exportOf(U.admin, 'logins', 'json', { type: 'failed' });
    const rows = JSON.parse((await call(U.admin, 'GET', `/admin/exports/${j}/download`)).text);
    assert.ok(rows.length >= 6 && rows.every(r => r.type === 'failed'));
    const x = await exportOf(U.admin, 'audit', 'xlsx');
    const res = await fetch(`${base}/api/admin/exports/${x}/download`, { headers: { Cookie: U.admin.cookie, 'User-Agent': UA } });
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK');
    assert.equal((await call(U.admin2, 'GET', `/admin/exports/${x}/download`)).status, 403);
    assert.equal((await call(U.root, 'GET', `/admin/exports/${x}/download`)).status, 200, 'super admins can');
  });

  test('reports are built from real data and downloadable', async () => {
    const r = await call(U.admin, 'POST', '/admin/reports', { type: 'daily', tz: 'UTC' });
    assert.equal(r.status, 201);
    const rep = (await call(U.admin, 'GET', `/admin/reports/${r.body.id}`)).body;
    assert.equal(rep.data.authentication.failed, await LoginEvent.countDocuments({ type: 'failed' }));
    assert.equal(rep.data.visitors.pageViews, await PageView.countDocuments());
    const csv = await call(U.admin, 'GET', `/admin/reports/${r.body.id}/download?format=csv`);
    assert.match(csv.text, /authentication\.failed,\d+/);
    for (const type of ['weekly', 'monthly']) assert.equal((await call(U.admin, 'POST', '/admin/reports', { type })).status, 201);
  });

  test('server errors are grouped and scrubbed of secrets', async () => {
    await call(null, 'GET', '/boom');
    await call(null, 'GET', '/boom');
    const e = await until(async () => { const x = await SystemError.findOne({ type: 'Error' }); return x?.count === 2 ? x : null; });
    assert.ok(!e.message.includes('abcdef0123456789abcdef0123456789xyz'));
    assert.ok(!e.message.includes('jane@example.com'));
    const list = await call(U.admin, 'GET', '/admin/errors?status=open');
    assert.equal(list.body.items[0].count, 2);
    assert.equal((await call(U.admin, 'POST', `/admin/errors/${list.body.items[0].id}/status`, { status: 'resolved' })).status, 200);
    await call(null, 'POST', '/t/error', { message: 'TypeError: x is undefined', route: '/stats' });
    assert.ok(await until(() => SystemError.exists({ source: 'client' })));
    const sys = (await call(U.admin, 'GET', '/admin/system')).body;
    assert.equal(sys.database.status, 'ok');
    assert.ok(sys.errors.hour >= 3);
    assert.ok(sys.api.requestsLastHour > 0);
  });

  test('settings: each section has its own permission, and changes take effect', async () => {
    assert.equal((await call(U.admin, 'PUT', '/admin/settings/security', { failedLoginWarn: 3 })).status, 403);
    assert.equal((await call(U.root, 'PUT', '/admin/settings/security', { failedLoginWarn: 3 })).status, 200);
    assert.equal((await call(U.root, 'PUT', '/admin/settings/security', { failedLoginCritical: 2 })).status, 400);
    assert.equal((await call(U.admin, 'PUT', '/admin/settings/application', { registrationsOpen: false })).status, 200);
    resetSettingsCache();
    const r = await call(null, 'POST', '/auth/register', { username: 'latecomer', email: 'late@example.com', password: 'abcdefgh1' });
    assert.equal(r.status, 403);
    assert.equal((await call(U.admin, 'PUT', '/admin/settings/application', { registrationsOpen: true })).status, 200);
    assert.ok(await AuditLog.exists({ action: 'SETTINGS_CHANGED', targetId: 'application' }));
  });

  test('retention deletes old analytics but never audit logs', async () => {
    await PageView.collection.insertOne({ vid: 'old-visitor-0001', sid: 'old-session-0001', route: '/', createdAt: new Date(Date.now() - 400 * 864e5) });
    const auditBefore = await AuditLog.countDocuments();
    const r = await call(U.admin, 'POST', '/admin/settings/retention/run');
    assert.equal(r.status, 200);
    assert.equal(r.body.removed.pageViews, 1);
    assert.equal(await AuditLog.countDocuments(), auditBefore + 1, 'only the RETENTION_RUN record was added');
  });

  test('search, notifications and the admin profile', async () => {
    const s = await call(U.admin, 'GET', '/admin/search?q=trouble');
    assert.equal(s.body.users[0].username, 'troublemaker');
    assert.ok((await call(U.admin, 'GET', '/admin/search?q=SUSPEND')).body.audit.length >= 1);
    const n = await call(U.admin, 'GET', '/admin/notifications');
    assert.ok(n.body.unread >= 1);
    await call(U.admin, 'POST', '/admin/notifications/read', { all: true });
    assert.equal((await call(U.admin, 'GET', '/admin/notifications')).body.unread, 0);
    assert.ok((await call(U.admin2, 'GET', '/admin/notifications')).body.unread >= 1, 'read state is per admin');
    await call(U.admin, 'POST', '/admin/notifications/clear', { all: true });
    assert.equal((await call(U.admin, 'GET', '/admin/notifications')).body.items.length, 0);
    const me = (await call(U.admin, 'GET', '/admin/me')).body;
    assert.equal(me.sessions.length, 1);
    assert.equal(me.sessions[0].current, true);
  });

  test('bad input is rejected cleanly', async () => {
    assert.equal((await call(U.admin, 'POST', '/admin/exports', { kind: 'passwords', format: 'csv' })).status, 400);
    assert.equal((await call(U.admin, 'POST', '/admin/exports', { kind: 'users', format: 'csv', filters: { from: 'yesterday-ish' } })).status, 400);
    assert.equal((await call(U.admin, 'GET', '/admin/reports/000000000000000000000000')).status, 404);
    assert.equal((await call(U.admin, 'POST', '/admin/security/xyz/ack')).status, 404);
    assert.equal((await call(U.admin, 'POST', `/admin/users/${U.target.id}/suspend`, { reason: 'because' })).status, 400);
  });
});
