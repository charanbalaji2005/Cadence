/**
 * End-to-end: real HTTP routes, real WebSockets and a throwaway in-memory MongoDB.
 * Never touches the database in .env.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import WebSocket from 'ws';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { loadSession, csrfGuard } from '../src/middleware/auth.js';
import friendRoutes from '../src/routes/friends.js';
import competitionRoutes from '../src/routes/competitions.js';
import resultRoutes from '../src/routes/results.js';
import { attachRealtime } from '../src/realtime/server.js';
import { mongoStore } from '../src/realtime/store.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Result } from '../src/models/Result.js';
import { Friendship } from '../src/models/Friendship.js';
import { CompetitionRoom } from '../src/models/CompetitionRoom.js';
import { DailyActivity } from '../src/models/DailyActivity.js';
import { hashToken } from '../src/utils/session.js';

const TIMING = { countdownMs: 400, finishGraceMs: 500, progressTickMs: 50, progressMinGapMs: 0, elapsedToleranceS: 3 };
let mongo, server, rt, base, wsBase;
const U = {};
const sockets = [];

async function makeUser(username) {
  const user = await User.create({ username, usernameLower: username, usernameNormalized: username, email: `${username}@example.com`, provider: 'email', profileCompleted: true });
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ tokenHash: hashToken(token), user: user._id, expiresAt: new Date(Date.now() + 864e5) });
  return { id: user._id.toString(), username, cookie: `tf_session=${token}` };
}

async function call(user, method, path, body, { csrf = true } = {}) {
  const headers = { ...(user ? { Cookie: user.cookie } : {}), ...(csrf ? { 'X-Requested-With': 'TypeFlow' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(`${base}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** A WebSocket test client that records every message and can wait for a specific one. */
class Client {
  constructor(user, headers = {}) {
    this.user = user;
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(`${wsBase}/api/ws`, { headers: { ...(user ? { Cookie: user.cookie } : {}), ...headers } });
    this.ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      this.msgs.push(m);
      this.waiters = this.waiters.filter(w => { if (w.test(m)) { w.resolve(m); return false; } return true; });
    });
    this.closed = new Promise(r => this.ws.on('close', (code) => r(code)));
    sockets.push(this);
  }
  /** Resolves with the first message (already received or future) of this type matching pred, after index `from`. */
  next(type, pred = () => true, { from = 0, timeout = 5000 } = {}) {
    const test = m => m.type === type && pred(m);
    const found = this.msgs.slice(from).find(test);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.user?.username}: no "${type}" within ${timeout}ms`)), timeout);
      this.waiters.push({ test, resolve: m => { clearTimeout(timer); resolve(m); } });
    });
  }
  mark() { return this.msgs.length; }
  send(type, data = {}) { this.ws.send(JSON.stringify({ type, ...data })); }
  async ready() { await this.next('hello'); return this; }
  close() { this.ws.close(); return this.closed; }
}

const connect = user => new Client(user).ready();

/** Numbers that agree with each other, like the real engine produces. */
function result(wpm, elapsed, acc = 98) {
  const correct = Math.round(((wpm * 5 * elapsed) / 60) * 0.83);
  return { wpm, raw: wpm * 1.03, acc, consistency: 80, elapsed, chars: { correct, incorrect: 1, extra: 0, missed: 0 }, keyStats: { e: { n: 5, e: 0, ms: 600, mc: 4 } } };
}

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(mongo.getUri(), { autoIndex: true });
  await Promise.all([User, Session, Result, Friendship, CompetitionRoom, DailyActivity].map(m => m.init()));
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', loadSession, csrfGuard);
  app.use('/api/friends', friendRoutes);
  app.use('/api/competitions', competitionRoutes);
  app.use('/api/results', resultRoutes);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  server = http.createServer(app);
  rt = attachRealtime(server, { timing: TIMING, log: { error() {} } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = base.replace('http', 'ws');
  for (const name of ['charan75', 'alex', 'typingking', 'user04', 'latecomer', 'stranger']) U[name] = await makeUser(name);
});

after(async () => {
  for (const c of sockets) c.ws.terminate();
  rt.shutdown();
  await new Promise(r => server.close(r));
  await mongoose.disconnect();
  await mongo.stop();
});

const befriend = async (a, b) => {
  await call(a, 'POST', '/friends/request', { username: b.username });
  const r = await call(b, 'POST', '/friends/accept', { userId: a.id });
  assert.equal(r.status, 200);
};

describe('websocket security', () => {
  test('a socket without a session is told to log in and closed', async () => {
    const c = new Client(null);
    const err = await c.next('error');
    assert.equal(err.code, 'UNAUTHORIZED');
    assert.equal(await c.closed, 4401);
  });

  test('a socket opened from another site is refused', async () => {
    const ws = new WebSocket(`${wsBase}/api/ws`, { headers: { Cookie: U.alex.cookie, Origin: 'https://evil.example' } });
    const status = await new Promise(r => { ws.on('unexpected-response', (_req, res) => r(res.statusCode)); ws.on('open', () => r('opened')); });
    assert.equal(status, 403);
  });

  test('malformed and unknown messages are rejected without crashing', async () => {
    const c = await connect(U.stranger);
    c.ws.send('not json');
    assert.equal((await c.next('error')).code, 'BAD_REQUEST');
    const m = c.mark();
    c.send('drop_database');
    assert.equal((await c.next('error', () => true, { from: m })).code, 'BAD_REQUEST');
    c.send('heartbeat', { t: 123 });
    const ack = await c.next('heartbeat_ack');
    assert.equal(ack.t, 123);
    assert.ok(Math.abs(ack.serverTime - Date.now()) < 1000);
    await c.close();
  });
});

describe('friends', () => {
  test('requires a session and the CSRF header', async () => {
    assert.equal((await call(null, 'GET', '/friends')).status, 401);
    assert.equal((await call(U.alex, 'POST', '/friends/request', { username: 'charan75' }, { csrf: false })).status, 403);
  });

  test('search is prefix based and shows relationship state', async () => {
    const r = await call(U.charan75, 'GET', '/friends/search?username=typ');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.results.map(x => [x.username, x.state]), [['typingking', 'none']]);
    const self = await call(U.charan75, 'GET', '/friends/search?username=charan75');
    assert.equal(self.body.results[0].state, 'self');
    assert.equal(self.body.results[0].email, undefined, 'search never exposes email');
    const none = await call(U.charan75, 'GET', '/friends/search?username=zzzz');
    assert.deepEqual(none.body.results, []);
  });

  test('request, live notification, duplicate and self requests', async () => {
    const alex = await connect(U.alex);
    const r = await call(U.charan75, 'POST', '/friends/request', { username: 'alex' });
    assert.equal(r.status, 201);
    assert.equal(r.body.state, 'pending_sent');
    assert.equal((await alex.next('friend_request')).user.username, 'charan75');
    assert.equal((await alex.next('friends_changed')).friendRequests, 1);
    assert.equal((await call(U.charan75, 'POST', '/friends/request', { username: 'alex' })).status, 409);
    assert.equal((await call(U.charan75, 'POST', '/friends/request', { username: 'charan75' })).status, 400);
    assert.equal((await call(U.charan75, 'POST', '/friends/request', { username: 'nobody_here' })).status, 404);
    // The requester can't accept their own request.
    assert.equal((await call(U.charan75, 'POST', '/friends/accept', { userId: U.alex.id })).status, 404);
    const listed = await call(U.alex, 'GET', '/friends');
    assert.deepEqual(listed.body.incoming.map(f => f.username), ['charan75']);
    await alex.close();
  });

  test('accept makes both sides friends, exactly once', async () => {
    assert.equal((await call(U.alex, 'POST', '/friends/accept', { userId: U.charan75.id })).status, 200);
    const a = await call(U.charan75, 'GET', '/friends');
    assert.deepEqual(a.body.friends.map(f => f.username), ['alex']);
    assert.equal((await call(U.alex, 'POST', '/friends/accept', { userId: U.charan75.id })).status, 404);
    assert.equal(await Friendship.countDocuments({ pair: [U.alex.id, U.charan75.id].sort().join(':') }), 1);
  });

  test('a request back to someone who asked you accepts theirs', async () => {
    await call(U.typingking, 'POST', '/friends/request', { username: 'charan75' });
    const r = await call(U.charan75, 'POST', '/friends/request', { userId: U.typingking.id });
    assert.equal(r.body.state, 'friends');
  });

  test('reject, cancel and remove', async () => {
    await call(U.user04, 'POST', '/friends/request', { username: 'stranger' });
    assert.equal((await call(U.stranger, 'POST', '/friends/reject', { userId: U.user04.id })).status, 200);
    await call(U.user04, 'POST', '/friends/request', { username: 'stranger' });
    assert.equal((await call(U.user04, 'POST', '/friends/cancel', { userId: U.stranger.id })).status, 200);
    assert.equal(await Friendship.countDocuments({ pair: [U.user04.id, U.stranger.id].sort().join(':') }), 0);
    await befriend(U.user04, U.stranger);
    assert.equal((await call(U.stranger, 'DELETE', `/friends/${U.user04.id}`)).status, 200);
    assert.equal((await call(U.stranger, 'DELETE', `/friends/${U.user04.id}`)).status, 404);
  });

  test('blocking hides you from their search and stops requests', async () => {
    assert.equal((await call(U.stranger, 'POST', '/friends/block', { userId: U.latecomer.id })).status, 200);
    const s = await call(U.latecomer, 'GET', '/friends/search?username=stranger');
    assert.deepEqual(s.body.results, []);
    assert.equal((await call(U.latecomer, 'POST', '/friends/request', { username: 'stranger' })).status, 404);
    assert.equal((await call(U.stranger, 'DELETE', `/friends/block/${U.latecomer.id}`)).status, 200);
  });
});

describe('competition: four players, full room, race, results, rematch', () => {
  let A, B, C, D, code, startMsg;

  test('host creates a room and only friends can be invited', async () => {
    await befriend(U.charan75, U.user04);
    A = await connect(U.charan75);
    A.send('create_room', { settings: { mode: 'words', words: 10 }, invite: [U.user04.id, U.stranger.id] });
    const st = await A.next('room_state');
    code = st.room.code;
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(st.room.hostId, U.charan75.id);
    assert.equal((await A.next('error', m => m.ref === 'invite')).code, 'NOT_FRIENDS');
    assert.equal(await CompetitionRoom.countDocuments({ roomCode: code, status: 'WAITING' }), 1);
  });

  test('the invited friend sees the invite', async () => {
    D = await connect(U.user04);
    const hello = D.msgs.find(m => m.type === 'hello');
    assert.equal(hello.invites[0].code, code);
    assert.equal(hello.invites[0].from.username, 'charan75');
  });

  test('three players join (by code, case-insensitive) and the room shows 4 / 4', async () => {
    B = await connect(U.alex);
    C = await connect(U.typingking);
    B.send('join_room', { code: code.toLowerCase() });
    await B.next('room_state', m => m.room?.code === code);
    C.send('join_room', { code });
    await C.next('room_state', m => m.room?.code === code);
    D.send('join_room', { code });
    await D.next('room_state', m => m.room?.code === code);
    const full = await A.next('room_state', m => m.room.players.length === 4);
    assert.deepEqual(full.room.players.map(p => p.username), ['charan75', 'alex', 'typingking', 'user04']);
  });

  test('a fifth player is told the room is full', async () => {
    const E = await connect(U.latecomer);
    E.send('join_room', { code });
    const err = await E.next('error');
    assert.equal(err.code, 'ROOM_FULL');
    assert.equal(err.message, 'This room is full.');
  });

  test('non-hosts cannot start or change settings, even claiming to be host', async () => {
    let m = B.mark();
    B.send('start_room', { hostId: U.charan75.id });
    assert.equal((await B.next('error', () => true, { from: m })).code, 'NOT_HOST');
    m = B.mark();
    B.send('update_settings', { settings: { mode: 'time', time: 15 }, hostId: U.charan75.id });
    assert.equal((await B.next('error', () => true, { from: m })).code, 'NOT_HOST');
    m = B.mark();
    B.send('finish', result(100, 10));
    assert.equal((await B.next('error', () => true, { from: m })).code, 'WRONG_STATE');
  });

  test('host starts: everyone gets the same seed and server start time, then GO', async () => {
    const marks = [A, B, C, D].map(c => c.mark());
    A.send('start_room');
    const cds = await Promise.all([A, B, C, D].map((c, i) => c.next('start_countdown', () => true, { from: marks[i] })));
    startMsg = cds[0];
    for (const cd of cds) { assert.equal(cd.seed, startMsg.seed); assert.equal(cd.startAt, startMsg.startAt); }
    assert.ok(Math.abs(startMsg.startAt - startMsg.serverTime - TIMING.countdownMs) < 5);
    const goes = await Promise.all([A, B, C, D].map(c => c.next('race_started')));
    for (const g of goes) assert.ok(g.serverTime >= startMsg.startAt);
    // Too late to join now.
    const L = await connect(U.stranger);
    L.send('join_room', { code });
    assert.equal((await L.next('error')).code, 'ALREADY_STARTED');
  });

  test('live progress is relayed in small batched messages', async () => {
    const m = A.mark();
    B.send('progress', { progress: 42, wpm: 87, acc: 97.5, chars: 30 });
    const p = await A.next('progress', x => x.players.some(pl => pl.id === U.alex.id && pl.wpm === 87), { from: m });
    assert.ok(JSON.stringify(p).length < 600, 'progress messages stay tiny');
    assert.equal(p.players.length, 4);
  });

  test('a reconnecting racer gets the authoritative room back', async () => {
    await C.close();
    C = await connect(U.typingking);
    const hello = C.msgs.find(m => m.type === 'hello');
    assert.equal(hello.room.code, code);
    assert.equal(hello.room.status, 'RUNNING');
    assert.equal(hello.room.startAt, startMsg.startAt);
    assert.equal(hello.room.seed, startMsg.seed);
  });

  test('everyone finishes: ranked by wpm, accuracy breaks ties, a bogus time is flagged', async () => {
    await new Promise(r => setTimeout(r, 1200));
    const elapsed = () => (Date.now() - startMsg.startAt) / 1000;
    A.send('finish', result(94, elapsed(), 98.2));
    B.send('finish', result(87, elapsed(), 97.8));
    C.send('finish', result(102, elapsed(), 99.1));
    D.send('finish', result(180, 30)); // claims 30 s after ~1.2 s
    const fin = await A.next('race_finished');
    assert.deepEqual(fin.standings.map(s => [s.rank, s.username, s.status]), [
      [1, 'typingking', 'valid'], [2, 'charan75', 'valid'], [3, 'alex', 'valid'], [4, 'user04', 'flagged']
    ]);
    await Promise.all([A, B, C, D].map(c => c.next('results_saved')));
  });

  test('MongoDB holds exactly one result per player and nothing per keystroke', async () => {
    const rows = await Result.find({ 'race.code': code }).lean();
    assert.equal(rows.length, 4);
    for (const r of rows) {
      assert.equal(r.lbEligible, false, 'races never enter the global leaderboard');
      assert.equal(r.race.players, 4);
      assert.equal(r.race.opponents.length, 3);
      assert.deepEqual(Object.keys(r).filter(k => /key|typed|text/i.test(k)), []);
    }
    const winner = rows.find(r => r.race.rank === 1);
    assert.equal(winner.user.toString(), U.typingking.id);
    assert.equal((await CompetitionRoom.findOne({ roomCode: code })).status, 'FINISHED');
    // Valid races count toward activity and key stats; the flagged one doesn't.
    assert.equal(await DailyActivity.countDocuments({ user: U.typingking.id }), 1);
    assert.equal(await DailyActivity.countDocuments({ user: U.user04.id }), 0);
    const tk = await User.findById(U.typingking.id).lean();
    assert.equal(tk.keyStats.e.n, 5);
  });

  test('history and the results list reflect the race; flagged results are hidden', async () => {
    const h = await call(U.typingking, 'GET', '/competitions/history');
    assert.deepEqual(h.body.stats, { played: 1, wins: 1, top3: 1, best: 102, winRate: 100 });
    assert.equal(h.body.recent[0].opponents.length, 3);
    const mine = await call(U.typingking, 'GET', '/results');
    assert.equal(mine.body.results.length, 1);
    assert.equal(mine.body.results[0].race.rank, 1);
    const flagged = await call(U.user04, 'GET', '/results');
    assert.equal(flagged.body.results.length, 0);
    assert.equal((await call(U.user04, 'GET', '/competitions/history')).body.stats.played, 0);
  });

  let next;
  test('only the host can rematch; it makes a new room and brings players along', async () => {
    let m = B.mark();
    B.send('rematch');
    assert.equal((await B.next('error', () => true, { from: m })).code, 'NOT_HOST');
    const marks = [B, C, D].map(c => c.mark());
    A.send('rematch');
    const st = await A.next('room_state', x => x.room?.code !== code && x.room?.status === 'WAITING');
    next = st.room.code;
    assert.notEqual(next, code);
    const rms = await Promise.all([B, C, D].map((c, i) => c.next('rematch', () => true, { from: marks[i] })));
    for (const r of rms) assert.equal(r.code, next);
    for (const c of [B, C, D]) c.send('join_room', { code: next });
    await A.next('room_state', x => x.room?.code === next && x.room.players.length === 4);
  });

  test('a timed rematch ends on the server clock; a player who never finishes is DNF', async () => {
    A.send('update_settings', { settings: { mode: 'time', time: 15 } });
    await A.next('room_state', x => x.room?.code === next && x.room.settings.mode === 'time');
    const m = A.mark();
    A.send('start_room');
    const cd = await A.next('start_countdown', () => true, { from: m });
    await A.next('race_started', () => true, { from: m, timeout: 3000 });
    const wait = cd.startAt + 15000 - Date.now();
    await new Promise(r => setTimeout(r, wait));
    A.send('finish', result(70, 15));
    B.send('finish', result(75, 15));
    C.send('finish', result(60, 15));
    const fin = await A.next('race_finished', x => x.code === next, { from: m, timeout: 5000 });
    assert.deepEqual(fin.standings.map(s => [s.username, s.status]), [['alex', 'valid'], ['charan75', 'valid'], ['typingking', 'valid'], ['user04', 'dnf']]);
  });
});

describe('room lifecycle', () => {
  test('host leaving before the start hands over the host role', async () => {
    const B = await connect(U.alex), C = await connect(U.typingking);
    B.send('create_room', { settings: { mode: 'quote', quoteLen: 'short' } });
    const code = (await B.next('room_state', m => m.room?.players.length === 1)).room.code;
    C.send('join_room', { code });
    await C.next('room_state', m => m.room?.code === code);
    const m = C.mark();
    B.send('leave_room');
    const st = await C.next('room_state', x => x.room?.players.length === 1, { from: m });
    assert.equal(st.room.hostId, U.typingking.id);
  });

  test('cancel tells every player', async () => {
    const A = await connect(U.charan75), D = await connect(U.user04);
    A.send('create_room', { settings: { mode: 'time', time: 30 } });
    const code = (await A.next('room_state', m => m.room?.settings.time === 30)).room.code;
    D.send('join_room', { code });
    await D.next('room_state', m => m.room?.code === code);
    A.send('cancel_room');
    assert.equal((await D.next('room_cancelled')).code, code);
    assert.equal((await CompetitionRoom.findOne({ roomCode: code })).status, 'CANCELLED');
  });

  test('after a restart, old rooms are closed and players get a friendly reason', async () => {
    await CompetitionRoom.create({ roomCode: 'RSTRT2', host: U.alex.id, players: [U.alex.id], settings: { mode: 'time', time: 60 }, status: 'RUNNING', expiresAt: new Date(Date.now() + 6e5) });
    assert.ok((await mongoStore.expireOrphans()) >= 1);
    const B = await connect(U.alex);
    B.send('join_room', { code: 'RSTRT2' });
    const err = await B.next('error', m => m.ref === 'join_room');
    assert.equal(err.code, 'ROOM_RESTARTED');
    assert.equal(err.message, 'This competition ended because the server restarted.');
    B.send('join_room', { code: 'ZZZZZZ' });
    assert.equal((await B.next('error', m => m.code === 'ROOM_NOT_FOUND')).message, "This room doesn't exist or has expired.");
    B.send('join_room', { code: 'nope' });
    assert.equal((await B.next('error', m => m.code === 'INVALID_CODE')).message, 'Enter a valid room code.');
  });
});
