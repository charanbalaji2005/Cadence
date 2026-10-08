import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, TIMING } from '../src/realtime/rooms.js';
import { normalizeRoomCode, generateRoomCode, CODE_ALPHABET, raceLimitSeconds } from '../src/realtime/protocol.js';

const ids = ['a', 'b', 'c', 'd', 'e'].map(c => c.repeat(24));
const users = ids.map((id, i) => ({ id, username: `user${i + 1}`, avatar: '' }));
const [A, B, C, D, E] = users;

function fakeStore() {
  return {
    saved: [], ended: [], started: 0, n: 0, friends: new Set(),
    newId() { return (++this.n).toString(16).padStart(24, '0'); },
    async codeExists() { return false; },
    async createRoom() {},
    async markStarted() { this.started++; },
    async markEnded(room, status, reason) { this.ended.push({ code: room.code, status, reason }); },
    async endedByRestart(code) { return code === 'RSTART'; },
    async areFriends(a, b) { return this.friends.has([a, b].sort().join(':')); },
    async pendingRequests() { return 0; },
    async saveResults(room, standings) { this.saved.push({ room: room.code, standings }); }
  };
}

let store, mgr, inbox;
const msgs = (user, type) => (inbox.get(user.id) || []).filter(m => !type || m.type === type);
const last = (user, type) => msgs(user, type).at(-1);

/** A believable finish: the numbers agree with each other and with the server clock. */
function result(wpm, elapsed, acc = 98) {
  const wpmChars = (wpm * 5 * elapsed) / 60;
  const correct = Math.round(wpmChars * 0.83);
  return { wpm, raw: wpm * 1.03, acc, consistency: 80, elapsed, chars: { correct, incorrect: 2, extra: 0, missed: 0 }, keyStats: {} };
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  store = fakeStore();
  inbox = new Map();
  mgr = new RoomManager({
    store,
    send: (id, m) => { const list = inbox.get(id) || []; list.push(typeof m === 'string' ? JSON.parse(m) : m); inbox.set(id, list); },
    log: { error() {} }
  });
});
afterEach(() => { mgr.stop(); mock.timers.reset(); });

async function roomOf4(settings = { mode: 'words', words: 10 }) {
  const room = await mgr.create(A, settings);
  for (const u of [B, C, D]) await mgr.join(u, room.code);
  return room;
}

describe('room codes', () => {
  test('are 6 unambiguous uppercase characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      assert.match(code, /^[A-Z2-9]{6}$/);
      for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
      assert.ok(!/[IO01]/.test(code));
    }
  });
  test('normalize pasted input and reject junk', () => {
    assert.equal(normalizeRoomCode(' c8k-4p2 '), 'C8K4P2');
    assert.equal(normalizeRoomCode('C8K4P'), null);
    assert.equal(normalizeRoomCode('C8K4P0'), null); // 0 is not in the alphabet
    assert.equal(normalizeRoomCode(42), null);
  });
  test('race limits', () => {
    assert.equal(raceLimitSeconds({ mode: 'time', time: 60 }), 60);
    assert.equal(raceLimitSeconds({ mode: 'words', words: 10 }), 45);
    assert.equal(raceLimitSeconds({ mode: 'words', words: 100 }), 300);
  });
});

describe('lobby', () => {
  test('create makes the creator host and returns room state', async () => {
    const room = await mgr.create(A, { mode: 'time', time: 30 });
    assert.equal(room.hostId, A.id);
    const st = last(A, 'room_state').room;
    assert.equal(st.code, room.code);
    assert.equal(st.status, 'WAITING');
    assert.equal(st.maxPlayers, 4);
    assert.equal(st.players.length, 1);
    assert.equal(st.seed, null, 'text seed stays secret until the race starts');
  });

  test('invalid settings are rejected', async () => {
    await assert.rejects(mgr.create(A, { mode: 'time', time: 45 }), /Choose one of/);
    await assert.rejects(mgr.create(A, { mode: 'zen' }), /time, words, quote or custom/);
    await assert.rejects(mgr.create(A, { mode: 'custom', customText: '   ' }), /Add some text/);
  });

  test('a fifth player is turned away, server-side', async () => {
    const room = await roomOf4();
    await assert.rejects(mgr.join(E, room.code), err => err.code === 'ROOM_FULL');
    assert.equal(room.players.size, 4);
  });

  test('joining twice is harmless and does not duplicate the player', async () => {
    const room = await roomOf4();
    await mgr.join(B, room.code);
    assert.equal(room.players.size, 4);
  });

  test('unknown, malformed and restarted codes give the right errors', async () => {
    await assert.rejects(mgr.join(A, 'nope'), err => err.code === 'INVALID_CODE');
    await assert.rejects(mgr.join(A, 'ZZZZZZ'), err => err.code === 'ROOM_NOT_FOUND');
    await assert.rejects(mgr.join(A, 'RSTART'), err => err.code === 'ROOM_RESTARTED');
  });

  test('only the host can change settings, start or cancel', async () => {
    const room = await roomOf4();
    assert.throws(() => mgr.updateSettings(B.id, { mode: 'time', time: 15 }), err => err.code === 'NOT_HOST');
    assert.throws(() => mgr.start(B.id), err => err.code === 'NOT_HOST');
    assert.throws(() => mgr.cancel(C.id), err => err.code === 'NOT_HOST');
    assert.equal(room.status, 'WAITING');
    mgr.updateSettings(A.id, { mode: 'time', time: 15 });
    assert.equal(room.settings.time, 15);
  });

  test('changing settings clears ready flags', async () => {
    const room = await roomOf4();
    mgr.setReady(B.id, true);
    assert.equal(room.players.get(B.id).ready, true);
    mgr.updateSettings(A.id, { mode: 'words', words: 25 });
    assert.equal(room.players.get(B.id).ready, false);
  });

  test('host leaving before the start hands the room to the next player', async () => {
    const room = await roomOf4();
    mgr.leave(A.id);
    assert.equal(room.hostId, B.id);
    assert.equal(room.players.size, 3);
    assert.equal(last(C, 'room_state').room.hostId, B.id);
  });

  test('the last player leaving closes the room', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    mgr.leave(A.id);
    assert.equal(mgr.rooms.has(room.code), false);
    assert.deepEqual(store.ended.at(-1), { code: room.code, status: 'EXPIRED', reason: 'empty' });
  });

  test('cancel tells everyone and frees the room', async () => {
    const room = await roomOf4();
    mgr.cancel(A.id);
    assert.ok(last(D, 'room_cancelled'));
    assert.equal(mgr.rooms.has(room.code), false);
    assert.equal(mgr.roomFor(D.id), null);
  });

  test('joining another room leaves the first one', async () => {
    const r1 = await mgr.create(A, { mode: 'words', words: 10 });
    await mgr.join(B, r1.code);
    const r2 = await mgr.create(C, { mode: 'words', words: 10 });
    await mgr.join(B, r2.code);
    assert.equal(r1.players.has(B.id), false);
    assert.equal(mgr.roomFor(B.id), r2);
  });

  test('a player who drops in the lobby is removed after the grace period', async () => {
    const room = await roomOf4();
    mgr.onDisconnect(C.id);
    assert.equal(room.players.get(C.id).connected, false);
    mock.timers.tick(TIMING.disconnectGraceMs + TIMING.sweepMs);
    assert.equal(room.players.has(C.id), false);
  });

  test('a player who reconnects in time keeps their seat', async () => {
    const room = await roomOf4();
    mgr.onDisconnect(C.id);
    mock.timers.tick(10000);
    const info = mgr.onConnect(C);
    assert.equal(info.room.code, room.code);
    mock.timers.tick(TIMING.disconnectGraceMs + TIMING.sweepMs);
    assert.equal(room.players.has(C.id), true);
  });

  test('idle waiting rooms expire', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    mock.timers.tick(TIMING.waitingIdleMs + TIMING.sweepMs);
    assert.equal(mgr.rooms.has(room.code), false);
    assert.equal(last(A, 'room_expired').reason, 'idle');
  });
});

describe('invites', () => {
  test('only friends can be invited, and they see it', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    await assert.rejects(mgr.invite(A, B.id), err => err.code === 'NOT_FRIENDS');
    store.friends.add([A.id, B.id].sort().join(':'));
    await mgr.invite(A, B.id);
    assert.equal(last(B, 'invite').invite.code, room.code);
    assert.equal(last(B, 'invites').invites.length, 1);
    await assert.rejects(mgr.invite(A, A.id), err => err.code === 'INVITE_SELF');
  });

  test('declining removes the invite and tells the inviter', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    store.friends.add([A.id, B.id].sort().join(':'));
    await mgr.invite(A, B.id);
    mgr.declineInvite(B, room.code);
    assert.equal(last(B, 'invites').invites.length, 0);
    assert.equal(last(A, 'invite_declined').username, B.username);
  });
});

describe('race', () => {
  test('start runs a server-timed countdown, then the race', async () => {
    const room = await roomOf4();
    const t0 = Date.now();
    mgr.start(A.id);
    assert.equal(room.status, 'COUNTDOWN');
    const cd = last(C, 'start_countdown');
    assert.equal(cd.startAt, t0 + TIMING.countdownMs);
    assert.ok(Number.isInteger(cd.seed));
    for (const u of [A, B, C, D]) assert.equal(last(u, 'start_countdown').seed, cd.seed, 'everyone gets the same text');
    assert.throws(() => mgr.finish(B.id, result(80, 10)), err => err.code === 'WRONG_STATE');
    mock.timers.tick(TIMING.countdownMs);
    assert.equal(room.status, 'RUNNING');
    assert.ok(last(D, 'race_started'));
  });

  test('progress is batched and rebroadcast, never per message', async () => {
    const room = await roomOf4();
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs);
    mgr.progress(B.id, { progress: 40, wpm: 90, acc: 97, chars: 50 });
    mgr.progress(B.id, { progress: 41, wpm: 91, acc: 97, chars: 51 }); // too soon: ignored
    assert.equal(msgs(A, 'progress').length, 0);
    mock.timers.tick(TIMING.progressTickMs);
    const p = last(A, 'progress').players.find(x => x.id === B.id);
    assert.equal(p.wpm, 90);
    assert.equal(room.players.get(B.id).progress, 40);
  });

  test('everyone finishing ends the race with ranked standings and saved results', async () => {
    const room = await roomOf4();
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 20000);
    mgr.finish(A.id, result(94, 20, 98.2));
    mgr.finish(B.id, result(87, 20, 97.8));
    mgr.finish(C.id, result(102, 20, 99.1));
    assert.equal(room.status, 'RUNNING');
    mgr.finish(D.id, result(94, 20, 99.5)); // ties A on wpm, wins on accuracy
    assert.equal(room.status, 'FINISHED');
    const st = last(B, 'race_finished').standings;
    assert.deepEqual(st.map(s => s.username), ['user3', 'user4', 'user1', 'user2']);
    assert.deepEqual(st.map(s => s.rank), [1, 2, 3, 4]);
    assert.ok(st.every(s => s.status === 'valid'));
    await Promise.resolve();
    assert.equal(store.saved.length, 1);
    assert.equal(store.saved[0].standings.length, 4);
  });

  test('a claimed time that disagrees with the server clock is flagged and ranked last', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    await mgr.join(B, room.code);
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 30000);
    mgr.finish(A.id, result(60, 30));
    mgr.finish(B.id, result(200, 9)); // says 9 s, but 30 s have passed
    const st = last(A, 'race_finished').standings;
    assert.equal(st[0].username, A.username);
    assert.equal(st[1].status, 'flagged');
  });

  test('numbers that do not add up are marked suspicious', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 20000);
    mgr.finish(A.id, { ...result(150, 20), chars: { correct: 10, incorrect: 0, extra: 0, missed: 0 } });
    assert.equal(last(A, 'race_finished').standings[0].status, 'suspicious');
    assert.equal(room.status, 'FINISHED');
  });

  test('a timed race ends on the server clock and players who never finish are DNF', async () => {
    const room = await mgr.create(A, { mode: 'time', time: 15 });
    await mgr.join(B, room.code);
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 15000);
    mgr.finish(A.id, result(70, 15));
    assert.equal(room.status, 'RUNNING');
    mock.timers.tick(TIMING.finishGraceMs);
    assert.equal(room.status, 'FINISHED');
    const st = last(A, 'race_finished').standings;
    assert.equal(st[0].username, A.username);
    assert.equal(st[1].status, 'dnf');
  });

  test('host leaving mid-race does not stop it, and the host role moves on', async () => {
    const room = await roomOf4();
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 15000);
    mgr.leave(A.id);
    assert.equal(room.status, 'RUNNING');
    assert.equal(room.hostId, B.id);
    for (const u of [B, C, D]) mgr.finish(u.id, result(80, 15));
    assert.equal(room.status, 'FINISHED');
    const a = last(B, 'race_finished').standings.find(s => s.userId === A.id);
    assert.equal(a.status, 'dnf');
    assert.equal(a.left, true);
  });

  test('late joiners are refused once the race has started', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    mgr.start(A.id);
    await assert.rejects(mgr.join(B, room.code), err => err.code === 'ALREADY_STARTED');
  });

  test('a reconnecting racer gets the authoritative timing back', async () => {
    const room = await roomOf4();
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 5000);
    mgr.onDisconnect(B.id);
    const info = mgr.onConnect(B);
    assert.equal(info.room.status, 'RUNNING');
    assert.equal(info.room.startAt, room.startAt);
    assert.equal(info.room.seed, room.seed);
  });

  test('rematch creates a new room with the same settings and pulls players along', async () => {
    const room = await roomOf4({ mode: 'time', time: 30 });
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 30000);
    for (const u of [A, B, C, D]) mgr.finish(u.id, result(80, 30));
    await assert.rejects(mgr.rematch(B), err => err.code === 'NOT_HOST');
    const next = await mgr.rematch(A);
    assert.notEqual(next.code, room.code);
    assert.notEqual(next.id, room.id);
    assert.equal(next.settings.time, 30);
    assert.equal(next.hostId, A.id);
    assert.equal(last(C, 'rematch').code, next.code);
    await mgr.join(C, next.code);
    assert.equal(next.players.size, 2);
  });

  test('finished rooms are dropped from memory after a while', async () => {
    const room = await mgr.create(A, { mode: 'words', words: 10 });
    mgr.start(A.id);
    mock.timers.tick(TIMING.countdownMs + 10000);
    mgr.finish(A.id, result(80, 10));
    mock.timers.tick(TIMING.finishedTtlMs + TIMING.sweepMs);
    assert.equal(mgr.rooms.has(room.code), false);
    assert.equal(mgr.roomFor(A.id), null);
  });
});
