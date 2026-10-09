import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { config } from '../src/config.js';
import { loadSession, csrfGuard } from '../src/middleware/auth.js';
import authRoutes from '../src/routes/auth.js';
import srmapRoutes from '../src/routes/srmap.js';
import adminRoutes from '../src/routes/admin/index.js';
import userRoutes from '../src/routes/users.js';
import leaderboardRoutes from '../src/routes/leaderboard.js';
import { Result } from '../src/models/Result.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { LoginEvent } from '../src/models/LoginEvent.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { IdentityBinding, PendingSignup } from '../src/models/IdentityBinding.js';
import { IntegrationConfig } from '../src/models/IntegrationConfig.js';
import { hashToken } from '../src/utils/session.js';
import { resetSrmapSettingsCache } from '../src/services/srmap/settings.js';
import { resetSettingsCache } from '../src/services/settings.js';

const API_KEY = 'test-provider-key-0001';
let mongo, server, provider, base, providerUrl;
let ipSeq = 1;
const U = {};

const STUDENTS = {
  AP24110010895: { password: 'right-pass', student: { student_id: 'STU-895', register_number: 'AP24110010895', name: 'Neelampalli Charan Balaji', email: 'charan_n@srmap.edu.in', password: 'leaked-hash', phone: '9999999999' } },
  AP25110020001: { password: 'pw-2', student: { student_id: 'STU-001', register_number: 'AP25110020001', name: 'Existing Person', email: 'existing@srmap.edu.in', batch: '2025' } },
  AP23110030003: { password: 'pw-3', student: { student_id: 'STU-003', register_number: 'AP23110039999', name: 'Wrong Answer', email: 'w@srmap.edu.in' } },
  AP24110040001: { password: 'pw-4', student: { student_id: 'STU-401', register_number: 'AP24110040001', name: 'Race One', email: 'race1@srmap.edu.in' } },
  AP24110040002: { password: 'pw-5', student: { student_id: 'STU-402', register_number: 'AP24110040002', name: 'Race Two', email: 'race2@srmap.edu.in' } },
  AP24110050001: { password: 'pw-6', student: { student_id: 'STU-501', register_number: 'AP24110050001', name: 'Linker Student', email: 'linker@srmap.edu.in' } },
  AP24110060001: { password: 'pw-7', student: { student_id: 'STU-601', register_number: 'AP24110060001', name: 'Only Srm', email: 'only@srmap.edu.in' } },
  AP24110090001: { password: 'pw-9', student: { student_id: 'STU-901', register_number: 'AP24110090001', name: 'Retry Student', email: 'retry@srmap.edu.in' } },
  // Same email as STU-895 but a different stable ID: must never reach STU-895's account.
  AP24110010896: { password: 'pw-dup', student: { student_id: 'STU-OTHER', register_number: 'AP24110010896', name: 'Neelampalli Charan Balaji', email: 'charan_n@srmap.edu.in' } }
};
const providerCalls = [];
const directoryCalls = [];
// Shaped like SRM AP's real directory API: lookups only, and records include a bcrypt password hash.
const DIRECTORY_PATH = '/api/typingmaster_connectsrmap_api.php';
const DIRECTORY_STUDENT = { name: 'Directory Only', email: 'dironly@srmap.edu.in', password: bcrypt.hashSync('pw-dir', 4), class: 'BTech-3-Year-(CSE)', section: 'A', gender: 'Male', profile_photo: 'http://oursrmap.purlyedit.in/uploads/profile_photos/AP24110070001.jpg' };
const DIR_HASH = bcrypt.hashSync('right-pass', 4);
// Directory records, by email. Each carries a password hash, like the real API, which Cadence must drop.
const DIRECTORY = {
  'charan_n@srmap.edu.in': { name: 'Neelampalli Charan Balaji', email: 'charan_n@srmap.edu.in', class: 'BTech-2-Year-(CSE)', section: 'B', gender: 'Male', regno: 'AP24110010895' },
  'linker@srmap.edu.in': { name: 'Linker Student', email: 'linker@srmap.edu.in', class: 'BTech-2-Year-(ECE)', section: 'C', gender: 'Female', regno: 'AP24110050001' },
  'only@srmap.edu.in': { name: 'Only Srm', email: 'only@srmap.edu.in', class: 'BTech-2-Year-(ME)', section: 'D', gender: 'Male', regno: 'AP24110060001' },
  'retry@srmap.edu.in': { name: 'Retry Student', email: 'retry@srmap.edu.in', class: 'BTech-2-Year-(CSE)', section: 'E', gender: 'Female', regno: 'AP24110090001' },
  'race1@srmap.edu.in': { name: 'Race One', email: 'race1@srmap.edu.in', class: 'X', section: 'A', gender: 'Male', regno: 'AP24110040001' },
  'race2@srmap.edu.in': { name: 'Race Two', email: 'race2@srmap.edu.in', class: 'X', section: 'A', gender: 'Male', regno: 'AP24110040002' },
  // Only reachable through the PHP verify action (docs/php/typingmaster_connectsrmap_api.php).
  'php@srmap.edu.in': { name: 'Php Student', email: 'php@srmap.edu.in', class: 'BTech-1-Year-(CSE)', section: 'F', gender: 'Female', regno: 'AP24110080001' },
  'php2@srmap.edu.in': { name: 'Second Php', email: 'php2@srmap.edu.in', class: 'BTech-3-Year-(CSE)', section: 'G', gender: 'Male', regno: 'AP23110080002' }
};
// Mirrors the PHP verify action: password_verify against the stored hash, same 401 for unknown students.
let phpVerifyDeployed = true;
function phpVerify(req, send) {
  if (!phpVerifyDeployed) return send(400, { status: false, message: 'Unknown action provided.' });
  if (req.method !== 'POST') return send(405, { status: false, code: 'method_not_allowed', message: 'Use POST for verify.' });
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const d = b.identifier_type === 'email' ? DIRECTORY[String(b.identifier).toLowerCase()] : Object.values(DIRECTORY).find(x => x.regno === b.identifier);
    if (!d || !bcrypt.compareSync(String(b.password || ''), DIR_HASH)) return send(401, { status: false, verified: false, message: 'Invalid credentials.' });
    send(200, { status: true, verified: true, student: { student_id: d.regno, register_number: d.regno, name: d.name, email: d.email, class: d.class, section: d.section, gender: d.gender, photo: 'https://' + req.headers.host + '/uploads/profile_photos/' + d.regno + '.jpg' } });
  });
}
let directoryDown = false;
function directoryRecord(req, params) {
  const email = params.get('email');
  const regno = params.get('register_number');
  if (email === DIRECTORY_STUDENT.email) return DIRECTORY_STUDENT;
  const r = email ? DIRECTORY[email.toLowerCase()] : Object.values(DIRECTORY).find(d => d.regno === regno);
  if (!r) return null;
  const { regno: rn, ...rest } = r;
  return { ...rest, password: DIR_HASH, profile_photo: 'http://' + req.headers.host + '/uploads/profile_photos/' + rn + '.jpg' };
}

function startProvider() {
  return http.createServer((req, res) => {
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers['x-api-key'] !== API_KEY) return send(401, { status: false, message: 'Unauthorized: Invalid or missing API Key.' });
    const url = new URL(req.url, 'http://x');
    if (url.pathname === DIRECTORY_PATH) {
      directoryCalls.push({ method: req.method, action: url.searchParams.get('action'), hasIdentifier: url.searchParams.has('email') || url.searchParams.has('register_number'), email: url.searchParams.get('email'), regno: url.searchParams.get('register_number') });
      if (directoryDown) return send(503, { status: false, message: 'Service unavailable' });
      const action = url.searchParams.get('action') || 'get_student';
      if (action === 'verify') return phpVerify(req, send);
      if (action === 'list_students') return send(200, { status: true, count: 1, students: [DIRECTORY_STUDENT] });
      if (action !== 'get_student') return send(400, { status: false, message: 'Unknown action provided.' });
      if (!url.searchParams.has('email') && !url.searchParams.has('register_number')) return send(400, { status: false, message: 'Parameter missing: Please provide register_number or email.' });
      const rec = directoryRecord(req, url.searchParams);
      if (!rec) return send(404, { status: false, message: 'Student not found.' });
      return send(200, { status: true, student: rec });
    }
    if (req.method === 'GET') return send(200, { status: true, message: 'ok' });
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const b = JSON.parse(raw || '{}');
      providerCalls.push({ identifier: b.identifier, type: b.identifier_type });
      if (b.identifier === 'AP22110000000') return send(500, { status: false });
      // A "verification" endpoint that just returns the directory record, password hash included.
      if (b.identifier === 'AP24110070001') return send(200, { status: true, student: { ...DIRECTORY_STUDENT, register_number: 'AP24110070001' } });
      if (b.identifier === 'AP22110000001') { setTimeout(() => send(200, { status: true, verified: true, student: { student_id: 'SLOW', register_number: 'AP22110000001', name: 'Slow', email: 'slow@srmap.edu.in' } }), 1500); return; }
      if (b.identifier === 'AP22110000002') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status": tru'); return; }
      const rec = STUDENTS[b.identifier];
      if (!rec || rec.password !== b.password) return send(200, { status: false, verified: false, message: 'Invalid credentials' });
      return send(200, { status: true, verified: true, student: rec.student });
    });
  });
}

function cookiesFrom(res) {
  const out = {};
  for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); out[kv.slice(0, i)] = kv.slice(i + 1); }
  return out;
}
const jar = obj => Object.entries(obj).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');

async function call(cookie, method, path, data) {
  const headers = { 'X-Requested-With': 'TypeFlow', 'X-Forwarded-For': `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`, ...(cookie ? { Cookie: cookie } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(`${base}/api${path}`, { method, headers, body: data !== undefined ? JSON.stringify(data) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, cookies: cookiesFrom(res) };
}

async function makeUser(username, role = 'USER', extra = {}) {
  const user = await User.create({ username, usernameLower: username, usernameNormalized: username, email: `${username}@example.com`, provider: 'email', profileCompleted: true, role, ...extra });
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ tokenHash: hashToken(token), user: user._id, expiresAt: new Date(Date.now() + 864e5) });
  return { id: user._id.toString(), cookie: `tf_session=${token}` };
}

function configure(patch) { Object.assign(config.srmap, patch); resetSrmapSettingsCache(); }

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: true });
  await Promise.all(mongoose.modelNames().map(n => mongoose.model(n).init()));
  provider = startProvider();
  await new Promise(r => provider.listen(0, '127.0.0.1', r));
  providerUrl = `http://127.0.0.1:${provider.address().port}/verify`;

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', loadSession, csrfGuard);
  app.use('/api/auth/srmap', srmapRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use((err, req, res, _next) => { if (err?.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message }); console.error(err); res.status(500).json({ error: 'Server error' }); });
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;

  config.integrationKey = 'integration-test-encryption-key';
  configure({ enabled: false, verifyUrl: '', apiKey: '', directoryUrl: providerUrl.replace('/verify', DIRECTORY_PATH), batchYears: '2017-2026' });
  resetSettingsCache();
  U.admin = await makeUser('srmadmin', 'SUPER_ADMIN');
  U.mod = await makeUser('srmmod', 'MODERATOR');
  U.plain = await makeUser('plainperson');
  U.other = await makeUser('otherperson');
  await User.create({ username: 'existingsrm', usernameLower: 'existingsrm', usernameNormalized: 'existingsrm', email: 'existing@srmap.edu.in', provider: 'google', googleId: 'g-1', profileCompleted: true });
});

after(async () => {
  await new Promise(r => server.close(r));
  await new Promise(r => provider.close(r));
  await mongoose.disconnect();
  await mongo.stop();
});

const verify = (identifier, password, extra = {}, cookie) => call(cookie, 'POST', '/auth/srmap/verify', { identifier, password, ...extra });

describe('when the integration is not ready', () => {
  test('disabled: public config says so and sign-in is refused', async () => {
    const c = await call(null, 'GET', '/auth/srmap/config');
    assert.equal(c.status, 200);
    assert.equal(c.body.enabled, false);
    assert.equal(c.body.ready, false);
    assert.ok(!c.text.includes('http'), 'no endpoints leak to the browser');
    const r = await verify('AP24110010895', 'right-pass');
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'disabled');
  });

  test('enabled without a verification service: refused, never simulated', async () => {
    configure({ enabled: true });
    const r = await verify('AP24110010895', 'right-pass');
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'not_configured');
    assert.equal(providerCalls.length, 0);
    assert.equal(await User.countDocuments({ provider: 'srm_ap' }), 0);
  });
});

describe('sign-up, sign-in and branding', () => {
  let ticket, session, userId;

  before(() => configure({ enabled: true, verifyUrl: providerUrl, apiKey: API_KEY }));

  test('config reports ready', async () => {
    const c = await call(null, 'GET', '/auth/srmap/config');
    assert.equal(c.body.ready, true);
    assert.deepEqual(c.body.emailDomains, ['srmap.edu.in']);
  });

  test('malformed register numbers are rejected before calling SRM AP', async () => {
    const before = providerCalls.length;
    const r = await verify('AP24123', 'x');
    assert.equal(r.status, 400);
    assert.equal(r.body.field, 'identifier');
    assert.equal(providerCalls.length, before);
  });

  test('wrong password fails and is recorded without the password', async () => {
    const r = await verify('AP24110010895', 'wrong-pass');
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'invalid_credentials');
    const ev = await LoginEvent.findOne({ provider: 'srm_ap', type: 'failed' }).lean();
    assert.ok(ev);
    assert.ok(!JSON.stringify(ev).includes('wrong-pass'));
    assert.ok(!JSON.stringify(ev).includes('AP24110010895'), 'register number stored masked/hashed only');
  });

  test('a provider that answers for a different student is refused', async () => {
    const r = await verify('AP23110030003', 'pw-3');
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'mismatch');
  });

  test('provider downtime is reported as unavailable', async () => {
    const r = await verify('AP22110000000', 'x');
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'unavailable');
  });

  test('first verification starts onboarding but creates no account', async () => {
    const r = await verify('ap24 110010895', 'right-pass', { remember: true });
    assert.equal(r.status, 202);
    assert.equal(r.body.pending, true);
    assert.equal(r.body.profile.batchYear, 2024);
    assert.equal(r.body.profile.batchSource, 'register_number');
    assert.equal(r.body.profile.registerNumberMasked, 'Apxxxxxxxxxxx');
    assert.ok(r.body.suggestions.length >= 3 && r.body.suggestions.length <= 5, JSON.stringify(r.body.suggestions));
    assert.ok(r.body.suggestions.every(s => !/110010895/.test(s)));
    assert.ok(!r.text.includes('leaked-hash') && !r.text.includes('9999999999'));
    assert.ok(r.cookies.tf_srmap_ticket);
    assert.equal(r.cookies.tf_session, undefined, 'no session before the username is chosen');
    assert.equal(await User.countDocuments({ email: 'charan_n@srmap.edu.in' }), 0);
    const pending = await PendingSignup.findOne().lean();
    assert.ok(!JSON.stringify(pending).includes('leaked-hash'));
    assert.ok(!JSON.stringify(pending).includes('AP24110010895'), 'pending record keeps only the masked number and hash');
    ticket = `tf_srmap_ticket=${r.cookies.tf_srmap_ticket}`;
  });

  test('suggestions can be regenerated', async () => {
    const r = await call(ticket, 'GET', '/auth/srmap/onboarding?round=2');
    assert.equal(r.status, 200);
    assert.ok(r.body.suggestions.length >= 3);
    assert.equal(r.body.profile.displayName, 'Neelampalli Charan Balaji');
  });

  test('onboarding without a ticket is refused', async () => {
    const r = await call(null, 'GET', '/auth/srmap/onboarding');
    assert.equal(r.status, 410);
  });

  test('username rules: consent, reserved, taken', async () => {
    assert.equal((await call(ticket, 'POST', '/auth/srmap/complete', { username: 'charanbalaji' })).status, 400);
    const reserved = await call(ticket, 'POST', '/auth/srmap/complete', { username: 'admin', consent: true });
    assert.equal(reserved.status, 400);
    assert.match(reserved.body.error, /reserved/);
    const taken = await call(ticket, 'POST', '/auth/srmap/complete', { username: 'plainperson', consent: true });
    assert.equal(taken.status, 409);
  });

  test('confirming a username creates the account, the binding and a session', async () => {
    const r = await call(ticket, 'POST', '/auth/srmap/complete', { username: 'charanbalaji', consent: true });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.user.username, 'charanbalaji');
    assert.deepEqual(r.body.user.connections.srm_ap, { verified: true, batchYear: 2024 });
    assert.ok(r.cookies.tf_session);
    session = `tf_session=${r.cookies.tf_session}`;
    userId = r.body.user.id;
    const b = await IdentityBinding.findOne({ user: userId }).lean();
    assert.equal(b.externalStudentId, 'STU-895');
    assert.equal(b.identityVerified, true);
    assert.equal(b.batchYear, 2024);
    assert.ok(!JSON.stringify(b).includes('leaked-hash'));
    assert.equal(await PendingSignup.countDocuments(), 0);
  });

  test('after the account exists, only this student\'s directory record is fetched and saved', async () => {
    const b = await IdentityBinding.findOne({ user: userId }).lean();
    assert.equal(b.profileSync.status, 'synced');
    assert.ok(b.profileSync.syncedAt);
    assert.equal(b.className, 'BTech-2-Year-(CSE)');
    assert.equal(b.section, 'B');
    assert.equal(b.gender, 'Male');
    assert.match(b.profilePhoto, /^https:\/\/127\.0\.0\.1:\d+\/uploads\/profile_photos\//, 'http photo on the directory host upgraded to https');
    assert.ok(!JSON.stringify(b).includes(DIR_HASH), 'directory password hash never stored');
    const lookups = directoryCalls.filter(c => c.email === 'charan_n@srmap.edu.in');
    assert.equal(lookups.length, 1, 'one individual lookup');
    assert.ok(directoryCalls.every(c => c.action !== 'list_students'), 'the directory is never listed');
    const u = await User.findById(userId).lean();
    assert.match(u.avatar, /^https:\/\/127\.0\.0\.1:\d+\/uploads\/profile_photos\//, 'the student photo is stored as user avatar');
    assert.ok(!JSON.stringify(u).includes(DIR_HASH));
  });

  test('the public profile shows the verified SRM AP student details', async () => {
    const r = await call(U.plain.cookie, 'GET', '/users/charanbalaji');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.connections.srm_ap.verified, true);
    assert.equal(r.body.user.connections.srm_ap.batchYear, 2024);
    assert.equal(r.body.user.connections.srm_ap.displayName, 'Neelampalli Charan Balaji');
    assert.equal(r.body.user.connections.srm_ap.registerNumberMasked, 'Apxxxxxxxxxxx');
    assert.equal(r.body.user.connections.srm_ap.gender, 'Male');
    assert.equal(r.body.user.connections.srm_ap.email, 'charan_n@srmap.edu.in');
    assert.equal(r.body.user.connections.srm_ap.registerNumber, undefined, 'raw register number not in connections');
    const u = await User.findById(userId).lean();
    assert.deepEqual(Object.keys(u.connectedAccounts.srm_ap).sort(), ['batchYear', 'boundAt', 'verified'], 'the account mirror holds no profile data');
    const b = await IdentityBinding.findOne({ user: userId }).lean();
    assert.ok(b.consentAt, 'consent time recorded');
    assert.equal(b.registerNumber, undefined, 'full register number not stored');
  });

  test('the ticket is single use', async () => {
    const r = await call(ticket, 'POST', '/auth/srmap/complete', { username: 'charanbalaji2', consent: true });
    assert.equal(r.status, 410);
  });

  test('/auth/me carries the server-side branding flag', async () => {
    const me = await call(session, 'GET', '/auth/me');
    assert.deepEqual(me.body.user.connections.srm_ap, { verified: true, batchYear: 2024 });
    const plain = await call(U.plain.cookie, 'GET', '/auth/me');
    assert.equal(plain.body.user.connections.srm_ap, null);
  });

  test('a returning student signs in to the same account, and the old session is rotated', async () => {
    const r = await verify('AP24110010895', 'right-pass', {}, U.other.cookie);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.id, userId);
    assert.ok(r.cookies.tf_session);
    assert.notEqual(`tf_session=${r.cookies.tf_session}`, session);
    const stale = await call(U.other.cookie, 'GET', '/auth/me');
    assert.equal(stale.body.user, null);
    assert.equal(await User.countDocuments({ email: 'charan_n@srmap.edu.in' }), 1);
    U.other = await makeUser('otherperson2');
  });

  test('the student sees their own saved details and sync status', async () => {
    const r = await call(session, 'GET', '/auth/srmap/connection');
    assert.equal(r.status, 200);
    assert.equal(r.body.gender, 'Male');
    assert.equal(r.body.className, 'BTech-2-Year-(CSE)');
    assert.equal(r.body.profileSync.status, 'synced');
    assert.equal(r.body.registerNumberMasked, 'Apxxxxxxxxxxx');
    assert.ok(r.body.profilePhoto.startsWith('https://'), 'own photo shown to the owner only');
    assert.ok(!r.text.includes(DIR_HASH));
    const other = await call(U.plain.cookie, 'GET', '/auth/srmap/connection');
    assert.equal(other.body.connected, false, 'nobody else sees it');
  });

  test('returning sign-in matches the stable student ID, never just the email', async () => {
    const before = await User.countDocuments();
    const r = await verify('AP24110010896', 'pw-dup');
    assert.equal(r.status, 409, r.text);
    assert.equal(r.body.code, 'link_required');
    assert.equal(r.cookies.tf_session, undefined, 'not signed in to the account that shares the email');
    assert.equal(await User.countDocuments(), before);
  });

  test('a returning sign-in does not refetch a fresh profile', async () => {
    const n = directoryCalls.length;
    const r = await verify('AP24110010895', 'right-pass');
    assert.equal(r.status, 200, r.text);
    assert.equal(directoryCalls.length, n, 'synced less than a day ago: no directory call');
  });

  test('a stale profile is refreshed on the next verified sign-in, by register number', async () => {
    await IdentityBinding.updateOne({ user: userId }, { $set: { 'profileSync.syncedAt': new Date(Date.now() - 2 * 864e5), section: 'OLD' } });
    const r = await verify('AP24110010895', 'right-pass');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.id, userId);
    const last = directoryCalls[directoryCalls.length - 1];
    assert.equal(last.regno, 'AP24110010895');
    assert.equal((await IdentityBinding.findOne({ user: userId }).lean()).section, 'B');
  });

  test('an existing account with the same email is never merged automatically', async () => {
    const r = await verify('AP25110020001', 'pw-2');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'link_required');
    const u = await User.findOne({ email: 'existing@srmap.edu.in' }).lean();
    assert.equal(u.connectedAccounts?.srm_ap, undefined);
  });

  test('two students racing for one username: exactly one wins', async () => {
    const a = await verify('AP24110040001', 'pw-4');
    const b = await verify('AP24110040002', 'pw-5');
    assert.equal(a.status, 202); assert.equal(b.status, 202);
    const [ra, rb] = await Promise.all([
      call(`tf_srmap_ticket=${a.cookies.tf_srmap_ticket}`, 'POST', '/auth/srmap/complete', { username: 'speedster', consent: true }),
      call(`tf_srmap_ticket=${b.cookies.tf_srmap_ticket}`, 'POST', '/auth/srmap/complete', { username: 'speedster', consent: true })
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [201, 409]);
    assert.equal(await User.countDocuments({ usernameNormalized: 'speedster' }), 1);
  });
});

describe('profile retrieval failure and retry', () => {
  let cookie, uid;
  after(() => { directoryDown = false; });

  test('directory down during sign-up: the account is still created, marked for retry', async () => {
    directoryDown = true;
    const v = await verify('AP24110090001', 'pw-9');
    assert.equal(v.status, 202, v.text);
    const r = await call(`tf_srmap_ticket=${v.cookies.tf_srmap_ticket}`, 'POST', '/auth/srmap/complete', { username: 'retrystudent', consent: true });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.profileSync.status, 'failed');
    cookie = `tf_session=${r.cookies.tf_session}`;
    uid = r.body.user.id;
    const b = await IdentityBinding.findOne({ user: uid }).lean();
    assert.equal(b.profileSync.status, 'failed');
    assert.equal(b.profileSync.lastError, 'unavailable');
    assert.equal(b.gender, '');
  });

  test('a manual retry while still down fails without side effects', async () => {
    const r = await call(cookie, 'POST', '/auth/srmap/connection/sync');
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'unavailable');
    assert.equal(await User.countDocuments({ email: 'retry@srmap.edu.in' }), 1);
    assert.equal(await IdentityBinding.countDocuments({ externalStudentId: 'STU-901' }), 1);
  });

  test('the next sign-in retries and saves the profile without a second account', async () => {
    directoryDown = false;
    const r = await verify('AP24110090001', 'pw-9');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.id, uid, 'same account, no username step');
    const b = await IdentityBinding.findOne({ user: uid }).lean();
    assert.equal(b.profileSync.status, 'synced');
    assert.equal(b.gender, 'Female');
    assert.ok(b.profileSync.attempts >= 3);
    assert.equal(await User.countDocuments({ email: 'retry@srmap.edu.in' }), 1);
    assert.equal(await IdentityBinding.countDocuments({ externalStudentId: 'STU-901' }), 1);
  });

  test('a manual retry works once the directory is back', async () => {
    const r = await call(cookie, 'POST', '/auth/srmap/connection/sync');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.connection.profileSync.status, 'synced');
  });

  test('a student missing from the directory is marked not_found', async () => {
    const b = await IdentityBinding.findOne({ user: uid });
    await IdentityBinding.updateOne({ _id: b._id }, { $set: { verifiedEmail: 'gone@srmap.edu.in' } });
    const r = await call(cookie, 'POST', '/auth/srmap/connection/sync');
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'not_found');
    assert.equal((await IdentityBinding.findById(b._id).lean()).profileSync.status, 'not_found');
    await IdentityBinding.updateOne({ _id: b._id }, { $set: { verifiedEmail: 'retry@srmap.edu.in' } });
  });

  test('admins see sync status, can filter by it and re-fetch, and it is audited', async () => {
    const o = await call(U.admin.cookie, 'GET', '/admin/srmap/overview');
    assert.ok(o.body.stats.sync.not_found >= 1, JSON.stringify(o.body.stats));
    const list = await call(U.admin.cookie, 'GET', '/admin/srmap/bindings?sync=not_found');
    assert.ok(list.body.items.length >= 1);
    assert.ok(list.body.items.every(i => i.profileSync.status === 'not_found'));
    const id = list.body.items.find(i => i.user?.username === 'retrystudent').id;
    const d = await call(U.admin.cookie, 'GET', `/admin/srmap/bindings/${id}`);
    assert.equal(d.body.binding.gender, 'Female');
    assert.equal((await call(U.mod.cookie, 'POST', `/admin/srmap/bindings/${id}/sync`)).status, 403, 'moderators cannot trigger fetches');
    const s = await call(U.admin.cookie, 'POST', `/admin/srmap/bindings/${id}/sync`);
    assert.equal(s.status, 200, s.text);
    assert.equal(s.body.profileSync.status, 'synced');
    assert.ok(await AuditLog.exists({ action: 'SRMAP_PROFILE_SYNC', targetId: id }));
    assert.ok(!s.text.includes(DIR_HASH) && !s.text.includes(API_KEY));
  });
});

describe('linking and unlinking', () => {
  test('linking needs a signed-in account', async () => {
    const r = await verify('AP24110050001', 'pw-6', { intent: 'link', consent: true });
    assert.equal(r.status, 401);
  });

  test('linking needs consent to store the verified details', async () => {
    const r = await verify('AP24110050001', 'pw-6', { intent: 'link' }, U.plain.cookie);
    assert.equal(r.status, 400);
    assert.equal(r.body.field, 'consent');
    assert.equal(await IdentityBinding.countDocuments({ externalStudentId: 'STU-501' }), 0);
  });

  test('a signed-in user links a verified identity', async () => {
    const r = await verify('AP24110050001', 'pw-6', { intent: 'link', consent: true }, U.plain.cookie);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.linked, true);
    assert.deepEqual(r.body.user.connections.srm_ap, { verified: true, batchYear: 2024 });
    assert.equal(r.body.connection.profileSync.status, 'synced');
    assert.equal(r.body.connection.gender, 'Female');
    assert.equal(directoryCalls[directoryCalls.length - 1].regno, 'AP24110050001', 'linking looks up by the verified register number');
    const me = await call(U.plain.cookie, 'GET', '/auth/me');
    assert.equal(me.body.user.connections.srm_ap.verified, true);
  });

  test('the same identity cannot be bound to a second account', async () => {
    const r = await verify('AP24110050001', 'pw-6', { intent: 'link', consent: true }, U.other.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'identity_taken');
  });

  test('an account cannot hold two SRM AP identities', async () => {
    const r = await verify('AP24110060001', 'pw-7', { intent: 'link', consent: true }, U.plain.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'account_taken');
  });

  test('unlinking the only sign-in method is refused', async () => {
    const c = await call(U.plain.cookie, 'GET', '/auth/srmap/connection');
    assert.equal(c.body.connected, true);
    assert.equal(c.body.canUnlink, false);
    const r = await call(U.plain.cookie, 'DELETE', '/auth/srmap/connection');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'only_sign_in');
  });

  test('with another sign-in method, unlinking removes the branding', async () => {
    await User.updateOne({ _id: U.plain.id }, { $set: { passwordHash: await bcrypt.hash('another-pass-123', 4) } });
    const r = await call(U.plain.cookie, 'DELETE', '/auth/srmap/connection');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.connections.srm_ap, null);
    const me = await call(U.plain.cookie, 'GET', '/auth/me');
    assert.equal(me.body.user.connections.srm_ap, null);
    const b = await IdentityBinding.findOne({ user: U.plain.id }).lean();
    assert.equal(b.active, false, 'kept for history');
    // The identity is free again.
    const again = await verify('AP24110050001', 'pw-6', { intent: 'link', consent: true }, U.other.cookie);
    assert.equal(again.status, 200);
  });
});

describe('admin', () => {
  test('regular users cannot reach the admin API', async () => {
    const r = await call(U.plain.cookie, 'GET', '/admin/srmap/overview');
    assert.equal(r.status, 403);
  });

  test('overview never returns the API key', async () => {
    const r = await call(U.admin.cookie, 'GET', '/admin/srmap/overview');
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes(API_KEY));
    assert.equal(r.body.settings.apiKey.set, true);
    assert.equal(r.body.settings.apiKey.source, 'env');
    assert.equal(r.body.readiness.ready, true);
    assert.ok(r.body.stats.active >= 3);
  });

  test('moderators can view but not configure', async () => {
    assert.equal((await call(U.mod.cookie, 'GET', '/admin/srmap/overview')).status, 200);
    assert.equal((await call(U.mod.cookie, 'PUT', '/admin/srmap/settings', { enabled: false })).status, 403);
  });

  test('saving an API key stores it sealed and returns only a hint', async () => {
    const r = await call(U.admin.cookie, 'PUT', '/admin/srmap/settings', { apiKey: API_KEY, verifyUrl: 'http://insecure.example/verify' });
    assert.equal(r.status, 400, 'non-https URLs are refused');
    const cleared = await call(U.admin.cookie, 'PUT', '/admin/srmap/settings', { verifyUrl: '' });
    assert.equal(cleared.body.settings.verifyUrl, providerUrl);
    const ok = await call(U.admin.cookie, 'PUT', '/admin/srmap/settings', { apiKey: API_KEY });
    assert.equal(ok.status, 200, ok.text);
    assert.ok(!ok.text.includes(API_KEY));
    assert.equal(ok.body.settings.apiKey.source, 'admin');
    assert.equal(ok.body.settings.apiKey.hint, '••••0001');
    const doc = await IntegrationConfig.findOne({ key: 'srm_ap' }).select('+apiKeySealed').lean();
    assert.ok(doc.apiKeySealed && !doc.apiKeySealed.includes(API_KEY));
    const log = await AuditLog.findOne({ action: 'SRMAP_SETTINGS_CHANGED' }).lean();
    assert.ok(!JSON.stringify(log).includes(API_KEY));
  });

  test('test connection', async () => {
    const r = await call(U.admin.cookie, 'POST', '/admin/srmap/test');
    assert.equal(r.status, 200);
    assert.ok(r.body.results.every(x => x.ok), JSON.stringify(r.body));
  });

  test('search by full register number, list and detail', async () => {
    const r = await call(U.admin.cookie, 'GET', '/admin/srmap/bindings?q=AP24110010895');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].user.username, 'charanbalaji');
    const batch = await call(U.admin.cookie, 'GET', '/admin/srmap/bindings?batch=2024');
    assert.ok(batch.body.items.length >= 3);
    const d = await call(U.admin.cookie, 'GET', `/admin/srmap/bindings/${r.body.items[0].id}`);
    assert.equal(d.status, 200);
    assert.equal(d.body.soleSignInMethod, true);
    assert.ok(d.body.history.some(h => h.type === 'bound'));
  });

  test('disabling the integration keeps accounts and bindings', async () => {
    const r = await call(U.admin.cookie, 'PUT', '/admin/srmap/settings', { enabled: false });
    assert.equal(r.status, 200);
    assert.equal(await User.countDocuments({ username: 'charanbalaji' }), 1);
    assert.equal(await IdentityBinding.countDocuments({ externalStudentId: 'STU-895', active: true }), 1);
    const v = await verify('AP24110010895', 'right-pass');
    assert.equal(v.status, 503);
    await call(U.admin.cookie, 'PUT', '/admin/srmap/settings', { enabled: true });
  });

  test('unbinding a sole sign-in method needs explicit confirmation and is audited', async () => {
    const list = await call(U.admin.cookie, 'GET', '/admin/srmap/bindings?q=charanbalaji');
    const id = list.body.items[0].id;
    const refused = await call(U.admin.cookie, 'POST', `/admin/srmap/bindings/${id}/unbind`, { reason: 'wrong person' });
    assert.equal(refused.status, 409);
    const ok = await call(U.admin.cookie, 'POST', `/admin/srmap/bindings/${id}/unbind`, { reason: 'wrong person', confirmLockout: true });
    assert.equal(ok.status, 200, ok.text);
    const u = await User.findOne({ username: 'charanbalaji' }).lean();
    assert.equal(u.connectedAccounts?.srm_ap, undefined);
    assert.ok(await AuditLog.exists({ action: 'SRMAP_UNBIND', targetId: id }));
    const d = await call(U.admin.cookie, 'GET', `/admin/srmap/bindings/${id}`);
    assert.equal(d.body.binding.active, false);
    assert.ok(d.body.audit.some(a => a.action === 'SRMAP_UNBIND'));
  });
});

describe('provider capability and failure handling', () => {
  let saved;
  before(() => { saved = { ...config.srmap }; });
  after(() => configure({ verifyUrl: saved.verifyUrl, directoryUrl: saved.directoryUrl, timeoutMs: saved.timeoutMs }));

  test('the directory API is never accepted as the verification endpoint', async () => {
    const directoryUrl = providerUrl.replace('/verify', DIRECTORY_PATH);
    configure({ enabled: true, verifyUrl: directoryUrl, directoryUrl });
    const before = providerCalls.length + directoryCalls.length;
    const c = await call(null, 'GET', '/auth/srmap/config');
    assert.equal(c.body.ready, false);
    const r = await verify('dironly@srmap.edu.in', 'pw-dir');
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'not_configured');
    assert.equal(providerCalls.length + directoryCalls.length, before, 'no request was made');
    assert.equal(await User.countDocuments({ email: 'dironly@srmap.edu.in' }), 0);
    const o = await call(U.admin.cookie, 'GET', '/admin/srmap/overview');
    assert.equal(o.body.providerStatus.code, 'directory_only');
    assert.equal(o.body.providerStatus.message, 'Directory API available; student authentication provider not configured');
  });

  test('connection test probes the directory without fetching any student', async () => {
    directoryCalls.length = 0;
    const t = await call(U.admin.cookie, 'POST', '/admin/srmap/test');
    assert.equal(t.status, 200);
    assert.equal(t.body.providerStatus.code, 'directory_only');
    const dir = t.body.results.find(x => x.target === 'directory');
    const ver = t.body.results.find(x => x.target === 'verification');
    assert.equal(dir.ok, true, JSON.stringify(dir));
    assert.equal(ver.ok, false);
    assert.ok(directoryCalls.length > 0);
    assert.ok(directoryCalls.every(c => c.action === 'get_student' && !c.hasIdentifier), JSON.stringify(directoryCalls));
    assert.ok(!t.text.includes('pw-dir') && !t.text.includes('$2'), 'no hashes in the response');
  });

  test('a directory-style answer with a matching password hash is not accepted as verification', async () => {
    configure({ verifyUrl: providerUrl, directoryUrl: saved.directoryUrl });
    const r = await verify('AP24110070001', 'pw-dir');
    assert.equal(r.status, 502, r.text);
    assert.equal(r.body.code, 'bad_response');
    assert.equal(r.cookies.tf_session, undefined);
    assert.equal(r.cookies.tf_srmap_ticket, undefined);
    assert.equal(await User.countDocuments({ email: 'dironly@srmap.edu.in' }), 0);
    assert.equal(await IdentityBinding.countDocuments({ verifiedEmail: 'dironly@srmap.edu.in' }), 0);
  });

  test('invalid credentials: exact message, nothing created, no session', async () => {
    const users = await User.countDocuments();
    const bindings = await IdentityBinding.countDocuments();
    const r = await verify('AP24110060001', 'not-the-password');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Invalid SRM AP details entered. Please check your details and try again.');
    assert.equal(r.cookies.tf_session, undefined);
    assert.equal(r.cookies.tf_srmap_ticket, undefined);
    assert.equal(await User.countDocuments(), users);
    assert.equal(await IdentityBinding.countDocuments(), bindings);
    // An unknown student gets the same answer, so the response doesn't reveal who exists.
    const unknown = await verify('AP24119999999', 'whatever');
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error, r.body.error);
  });

  test('timeouts and malformed responses fail safely', async () => {
    configure({ timeoutMs: 300 });
    const slow = await verify('AP22110000001', 'x');
    assert.equal(slow.status, 503);
    assert.equal(slow.body.code, 'unavailable');
    configure({ timeoutMs: saved.timeoutMs });
    const junk = await verify('AP22110000002', 'x');
    assert.equal(junk.status, 502);
    assert.equal(junk.body.code, 'bad_response');
    assert.equal(await User.countDocuments({ email: 'slow@srmap.edu.in' }), 0);
  });

  test('passwords and the API key never reach logs or responses', async () => {
    const lines = [];
    const orig = { error: console.error, log: console.log, warn: console.warn };
    for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(' '));
    try {
      await verify('AP22110000000', 'secret-password-xyz');
      await verify('AP22110000002', 'secret-password-xyz');
      await verify('AP24110010895', 'secret-password-xyz');
    } finally { Object.assign(console, orig); }
    const logged = lines.join('\n');
    assert.ok(!logged.includes('secret-password-xyz'), 'password logged');
    assert.ok(!logged.includes(API_KEY), 'API key logged');
    const events = JSON.stringify(await LoginEvent.find({}).lean());
    assert.ok(!events.includes('secret-password-xyz'));
  });

  test('repeated attempts for one identifier are rate limited, whatever the IP', async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await verify('AP24110088888', `guess-${i}`);
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'rate_limited');
  });

  test('a failed database write during sign-up leaves no account behind', async () => {
    const v = await verify('AP24110060001', 'pw-7');
    assert.equal(v.status, 202, v.text);
    const ticket = `tf_srmap_ticket=${v.cookies.tf_srmap_ticket}`;
    const origCreate = IdentityBinding.create;
    IdentityBinding.create = async () => { throw new Error('simulated write failure'); };
    let r;
    try { r = await call(ticket, 'POST', '/auth/srmap/complete', { username: 'onlysrm', consent: true }); }
    finally { IdentityBinding.create = origCreate; }
    assert.equal(r.status, 500);
    assert.equal(r.cookies.tf_session, undefined);
    assert.equal(await User.countDocuments({ email: 'only@srmap.edu.in' }), 0, 'account rolled back');
    assert.equal(await User.countDocuments({ usernameNormalized: 'onlysrm' }), 0);
    // The ticket survives, so the student can simply try again.
    const retry = await call(ticket, 'POST', '/auth/srmap/complete', { username: 'onlysrm', consent: true });
    assert.equal(retry.status, 201, retry.text);
    U.onlySrm = `tf_session=${retry.cookies.tf_session}`;
  });

  test('logout and expiry end the SRM AP session', async () => {
    assert.equal((await call(U.onlySrm, 'GET', '/auth/me')).body.user.username, 'onlysrm');
    const out = await call(U.onlySrm, 'POST', '/auth/logout');
    assert.equal(out.status, 200);
    assert.equal((await call(U.onlySrm, 'GET', '/auth/me')).body.user, null);
    const again = await verify('AP24110060001', 'pw-7');
    assert.equal(again.status, 200, 'returning student signs straight in');
    assert.equal(again.body.user.username, 'onlysrm');
    const cookie = `tf_session=${again.cookies.tf_session}`;
    await Session.updateMany({ user: again.body.user.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call(cookie, 'GET', '/auth/me')).body.user, null);
  });

  test('admin routes need an admin session', async () => {
    assert.ok([401, 403].includes((await call(null, 'GET', '/admin/srmap/overview')).status));
    assert.ok([401, 403].includes((await call(null, 'PUT', '/admin/srmap/settings', { enabled: false })).status));
    assert.equal((await call(U.mod.cookie, 'POST', '/admin/srmap/test')).status, 403);
  });
});

describe('the PHP API verify action and the SRM AP leaderboard', () => {
  let dirUrl, php, php2;
  const lb = (cookie, q) => call(cookie, 'GET', `/leaderboard?length=15&${q}`);
  before(() => {
    dirUrl = providerUrl.replace('/verify', DIRECTORY_PATH);
    configure({ enabled: true, verifyUrl: `${dirUrl}?action=verify`, directoryUrl: dirUrl, timeoutMs: 8000 });
  });
  after(() => { phpVerifyDeployed = true; });

  test('the script is accepted as the verifier only with action=verify', async () => {
    const c = await call(null, 'GET', '/auth/srmap/config');
    assert.equal(c.body.ready, true);
    configure({ verifyUrl: `${dirUrl}?action=get_student` });
    assert.equal((await call(null, 'GET', '/auth/srmap/config')).body.ready, false);
    configure({ verifyUrl: `${dirUrl}?action=verify` });
  });

  test('before the new PHP is uploaded: sign-in fails safely and the connection test says why', async () => {
    phpVerifyDeployed = false;
    const r = await verify('AP24110080001', 'right-pass');
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'unavailable');
    assert.equal(r.cookies.tf_srmap_ticket, undefined);
    const t = await call(U.admin.cookie, 'POST', '/admin/srmap/test');
    const v = t.body.results.find(x => x.target === 'verification');
    assert.equal(v.ok, false);
    assert.match(v.message, /not available on the server yet/);
    phpVerifyDeployed = true;
  });

  test('wrong password: the exact message and nothing created', async () => {
    const r = await verify('AP24110080001', 'nope');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Invalid SRM AP details entered. Please check your details and try again.');
    assert.equal(await User.countDocuments({ email: 'php@srmap.edu.in' }), 0);
  });

  test('first sign-up through PHP verify: username, then the profile is saved', async () => {
    const v = await verify('AP24110080001', 'right-pass');
    assert.equal(v.status, 202, v.text);
    assert.equal(v.body.profile.batchYear, 2024);
    const r = await call(`tf_srmap_ticket=${v.cookies.tf_srmap_ticket}`, 'POST', '/auth/srmap/complete', { username: 'phpstudent', consent: true });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual(r.body.user.connections.srm_ap, { verified: true, batchYear: 2024 });
    php = { id: r.body.user.id, cookie: `tf_session=${r.cookies.tf_session}` };
    const b = await IdentityBinding.findOne({ user: php.id }).lean();
    assert.equal(b.externalStudentId, 'AP24110080001');
    assert.equal(b.profileSync.status, 'synced');
    assert.equal(b.gender, 'Female');
    assert.equal(b.section, 'F');
    assert.ok(!JSON.stringify(b).includes(DIR_HASH));
  });

  test('returning by institutional email lands in the same account', async () => {
    const r = await verify('PHP@srmap.edu.in', 'right-pass');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.id, php.id);
    assert.equal(await User.countDocuments({ email: 'php@srmap.edu.in' }), 1);
  });

  test('the connection test passes once the verify action exists', async () => {
    const t = await call(U.admin.cookie, 'POST', '/admin/srmap/test');
    assert.ok(t.body.results.every(x => x.ok), JSON.stringify(t.body.results));
    assert.equal(t.body.providerStatus.code, 'ready');
  });

  test('a separate SRM AP ranking, by batch, of verified students only', async () => {
    const v = await verify('AP23110080002', 'right-pass');
    const r = await call(`tf_srmap_ticket=${v.cookies.tf_srmap_ticket}`, 'POST', '/auth/srmap/complete', { username: 'phptwo', consent: true });
    assert.equal(r.status, 201, r.text);
    php2 = { id: r.body.user.id };
    const res = (user, wpm) => ({ user, wpm, raw: wpm, acc: 98, consistency: 80, mode: 'time', mode2: '15', elapsed: 15, lbEligible: true });
    await Result.create([res(php.id, 80), res(php2.id, 90), res(U.plain.id, 120)]);

    const global = await lb(U.plain.cookie, 'board=global');
    assert.equal(global.body.entries[0].username, 'plainperson');
    assert.equal(global.body.entries[0].srmap, null);
    assert.deepEqual(global.body.entries.find(e => e.username === 'phpstudent').srmap, { batchYear: 2024 });
    assert.equal(global.body.me.rank, 1);

    const srm = await lb(U.plain.cookie, 'board=srmap');
    assert.equal(srm.body.board, 'srmap');
    assert.deepEqual(srm.body.entries.map(e => e.username), ['phptwo', 'phpstudent']);
    assert.equal(srm.body.players, 2);
    assert.equal(srm.body.me, null, 'not an SRM AP student, so no rank here');
    assert.ok(srm.body.batches.includes(2023) && srm.body.batches.includes(2024));

    const y23 = await lb(php.cookie, 'board=srmap&batch=2023');
    assert.deepEqual(y23.body.entries.map(e => e.username), ['phptwo']);
    assert.equal(y23.body.me, null, 'a 2024 student has no rank on the 2023 board');
    const y24 = await lb(php.cookie, 'board=srmap&batch=2024');
    assert.deepEqual(y24.body.entries.map(e => e.username), ['phpstudent']);
    assert.equal(y24.body.me.rank, 1);
    for (const leak of ['php@srmap.edu.in', 'AP24110080001', 'Php Student', 'Female', 'BTech']) assert.ok(!srm.text.includes(leak), `leaked ${leak}`);
  });

  test('an unlinked student leaves the SRM AP ranking immediately', async () => {
    const b = await IdentityBinding.findOne({ user: php2.id, active: true });
    await call(U.admin.cookie, 'POST', `/admin/srmap/bindings/${b._id}/unbind`, { reason: 'test unbind', confirmLockout: true });
    const srm = await lb(null, 'board=srmap');
    assert.deepEqual(srm.body.entries.map(e => e.username), ['phpstudent']);
  });
});
