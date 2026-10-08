import crypto from 'node:crypto';
import { isPlausible } from '../utils/rank.js';
import { MAX_PLAYERS, RoomError, settingsSchema, raceLimitSeconds, generateRoomCode, normalizeRoomCode, mode2For } from './protocol.js';

export const TIMING = {
  countdownMs: 4000,          // start pressed -> GO; leaves room for a 3, 2, 1 after the message lands
  finishGraceMs: 4000,        // after the race clock ends, how long to wait for late "finish" messages
  progressTickMs: 300,        // live progress is batched per room at this rate
  progressMinGapMs: 150,      // a client sending faster than this is ignored, not disconnected
  sweepMs: 15000,
  waitingIdleMs: 30 * 60 * 1000,
  disconnectGraceMs: 45000,   // a player who drops in the lobby keeps their seat this long
  finishedTtlMs: 10 * 60 * 1000,
  elapsedToleranceS: 5        // how far a claimed race time may trail the server clock (latency, throttled tabs)
};

const ACTIVE = new Set(['WAITING', 'COUNTDOWN', 'RUNNING']);
const RANK_GROUP = { valid: 0, suspicious: 0, flagged: 1, dnf: 2 };
const round1 = n => Math.round(n * 10) / 10;

/**
 * Owns every live room. Rooms exist only in this process's memory; the store records
 * just enough in MongoDB to keep codes unique and to save final results.
 *
 * deps: { send(userId, msg), isOnline(userId), store, timing?, log?, track?(type, user, metadata) }
 */
export class RoomManager {
  constructor({ send, isOnline = () => true, store, timing = {}, log = console, track = () => {} }) {
    this.track = track;
    this.sendTo = send;
    this.isOnline = isOnline;
    this.store = store;
    this.t = { ...TIMING, ...timing };
    this.log = log;
    this.rooms = new Map();    // code -> room
    this.userRoom = new Map(); // userId -> code
    this.sweeper = setInterval(() => this.sweep(), this.t.sweepMs);
    this.sweeper.unref?.();
  }

  stop() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) this.clearTimers(room);
  }

  /* ---------- views ---------- */

  playerView(room, p) {
    return {
      id: p.userId, username: p.username, avatar: p.avatar, host: p.userId === room.hostId,
      ready: p.ready, connected: p.connected, left: p.left, finished: p.finished,
      progress: round1(p.progress), wpm: Math.round(p.wpm), acc: round1(p.acc), chars: p.chars
    };
  }

  snapshot(room) {
    return {
      id: room.id, code: room.code, status: room.status, hostId: room.hostId, maxPlayers: MAX_PLAYERS,
      settings: room.settings, limit: room.limit,
      players: [...room.players.values()].map(p => this.playerView(room, p)),
      startAt: room.startAt, endsAt: room.endsAt, seed: room.status === 'WAITING' ? null : room.seed,
      standings: room.standings ? room.standings.map(publicStanding) : null,
      rematchCode: room.rematchCode || null, serverTime: Date.now()
    };
  }

  inviteView(room, fromId) {
    const from = room.players.get(fromId);
    const { customText, ...settings } = room.settings;
    return {
      code: room.code, players: this.active(room).length, maxPlayers: MAX_PLAYERS, settings,
      from: from ? { id: from.userId, username: from.username, avatar: from.avatar } : null
    };
  }

  invitesFor(userId) {
    const out = [];
    for (const room of this.rooms.values()) {
      if (room.status !== 'WAITING' || !room.invites.has(userId) || room.players.has(userId)) continue;
      if (this.active(room).length >= MAX_PLAYERS) continue;
      out.push(this.inviteView(room, room.invites.get(userId)));
    }
    return out;
  }

  roomFor(userId) {
    const code = this.userRoom.get(userId);
    return code ? this.rooms.get(code) || null : null;
  }

  /* ---------- messaging ---------- */

  broadcast(room, msg, exceptUserId) {
    const data = JSON.stringify(msg);
    for (const p of room.players.values()) if (!p.left && p.userId !== exceptUserId) this.sendTo(p.userId, data);
  }
  emitState(room, exceptUserId) { this.broadcast(room, { type: 'room_state', room: this.snapshot(room) }, exceptUserId); }
  pushInvites(userId) { this.sendTo(userId, { type: 'invites', invites: this.invitesFor(userId) }); }
  refreshInvites(room) { for (const id of room.invites.keys()) this.pushInvites(id); }

  /* ---------- helpers ---------- */

  active(room) { return [...room.players.values()].filter(p => !p.left); }

  requireRoom(userId) {
    const room = this.roomFor(userId);
    if (!room) throw new RoomError('NOT_IN_ROOM');
    return room;
  }

  requireHost(room, userId) { if (room.hostId !== userId) throw new RoomError('NOT_HOST'); }

  parseSettings(raw) {
    const r = settingsSchema.safeParse(raw);
    if (!r.success) throw new RoomError('BAD_REQUEST', r.error.issues[0]?.message);
    return r.data;
  }

  addPlayer(room, user) {
    room.players.set(user.id, {
      userId: user.id, username: user.username, avatar: user.avatar || '', joinedAt: Date.now(),
      ready: false, connected: this.isOnline(user.id), disconnectedAt: null, left: false,
      finished: false, progress: 0, wpm: 0, acc: 100, chars: 0, lastProgressAt: 0, result: null
    });
    room.invites.delete(user.id);
    this.userRoom.set(user.id, room.code);
  }

  /** Hands the host role to the longest-waiting player who is still around. */
  transferHost(room) {
    const candidates = this.active(room);
    const next = candidates.find(p => p.connected) || candidates[0];
    if (next) room.hostId = next.userId;
  }

  clearTimers(room) {
    clearTimeout(room.timers.start);
    clearTimeout(room.timers.end);
    clearInterval(room.timers.progress);
    room.timers = {};
  }

  /** Ends a live room (cancelled, idle, emptied) and records why. */
  destroy(room, status, reason) {
    this.clearTimers(room);
    if (status === 'CANCELLED') this.broadcast(room, { type: 'room_cancelled', code: room.code, reason });
    else if (reason !== 'empty') this.broadcast(room, { type: 'room_expired', code: room.code, reason });
    this.evict(room);
    this.store.markEnded(room, status, reason).catch(err => this.log.error('Room end not saved:', err.message));
  }

  /** Forgets a room in memory without touching the database. */
  evict(room) {
    this.clearTimers(room);
    for (const p of room.players.values()) if (this.userRoom.get(p.userId) === room.code) this.userRoom.delete(p.userId);
    this.rooms.delete(room.code);
    this.refreshInvites(room);
  }

  /* ---------- lobby ---------- */

  async create(user, rawSettings, inviteIds = []) {
    const settings = this.parseSettings(rawSettings);
    this.leave(user.id);
    const now = Date.now();
    const room = {
      id: this.store.newId(), code: null, hostId: user.id, status: 'WAITING', settings, limit: raceLimitSeconds(settings),
      players: new Map(), invites: new Map(), createdAt: now, lastActivity: now,
      seed: null, startAt: null, endsAt: null, finishedAt: null, standings: null, rematchCode: null,
      timers: {}, progressDirty: false, disconnects: 0
    };
    // The code is reserved in memory first so two rooms created at once can't take the same one.
    for (let attempt = 0; ; attempt++) {
      const code = generateRoomCode();
      if (this.rooms.has(code)) continue;
      room.code = code;
      this.rooms.set(code, room);
      try {
        if (await this.store.codeExists(code)) throw Object.assign(new Error('taken'), { code: 11000 });
        await this.store.createRoom(room);
        break;
      } catch (err) {
        this.rooms.delete(code);
        if (err.code !== 11000 || attempt >= 5) throw err;
      }
    }
    this.addPlayer(room, user);
    this.emitState(room);
    this.track('ROOM_CREATED', user, { code: room.code, mode: settings.mode });
    for (const id of inviteIds) {
      try { await this.invite(user, id); }
      catch (err) { this.sendTo(user.id, { type: 'error', ref: 'invite', code: err.code || 'SERVER', message: err.message }); }
    }
    return room;
  }

  async join(user, rawCode) {
    const code = normalizeRoomCode(rawCode);
    if (!code) throw new RoomError('INVALID_CODE');
    const room = this.rooms.get(code);
    if (!room) throw new RoomError((await this.store.endedByRestart(code, user.id)) ? 'ROOM_RESTARTED' : 'ROOM_NOT_FOUND');
    const existing = room.players.get(user.id);
    if (existing && !existing.left) {
      // Already inside (another tab, or a reconnect): just resend the state.
      existing.connected = true; existing.disconnectedAt = null;
      this.userRoom.set(user.id, code);
      this.sendTo(user.id, { type: 'room_state', room: this.snapshot(room) });
      return room;
    }
    if (room.status !== 'WAITING') throw new RoomError('ALREADY_STARTED');
    if (this.active(room).length >= MAX_PLAYERS) throw new RoomError('ROOM_FULL');
    this.leave(user.id);
    this.addPlayer(room, user);
    room.lastActivity = Date.now();
    this.track('ROOM_JOINED', user, { code });
    this.broadcast(room, { type: 'player_joined', player: this.playerView(room, room.players.get(user.id)) }, user.id);
    this.emitState(room);
    this.refreshInvites(room);
    this.pushInvites(user.id);
    return room;
  }

  /** Leaves whatever room the user is in. During a race the player stays on the board as did-not-finish. */
  leave(userId) {
    const room = this.roomFor(userId);
    this.userRoom.delete(userId);
    if (!room) return;
    const p = room.players.get(userId);
    if (!p) return;
    if (room.status !== 'FINISHED') this.track('ROOM_LEFT', { id: userId, username: p.username }, { code: room.code, during: room.status });
    if (room.status === 'COUNTDOWN' || room.status === 'RUNNING') {
      p.left = true; p.connected = false;
      if (room.hostId === userId) this.transferHost(room);
      this.broadcast(room, { type: 'player_left', userId });
      this.emitState(room);
      if (this.allDone(room)) this.finalize(room);
      return;
    }
    room.players.delete(userId);
    if (!this.active(room).length) {
      if (room.status === 'WAITING') this.destroy(room, 'EXPIRED', 'empty');
      else this.evict(room);
      return;
    }
    if (room.hostId === userId) this.transferHost(room);
    room.lastActivity = Date.now();
    this.broadcast(room, { type: 'player_left', userId });
    this.emitState(room);
    this.refreshInvites(room);
  }

  setReady(userId, ready) {
    const room = this.requireRoom(userId);
    if (room.status !== 'WAITING') throw new RoomError('WRONG_STATE');
    room.players.get(userId).ready = ready;
    room.lastActivity = Date.now();
    this.broadcast(room, { type: 'player_ready', userId, ready });
    this.emitState(room);
  }

  updateSettings(userId, rawSettings) {
    const room = this.requireRoom(userId);
    this.requireHost(room, userId);
    if (room.status !== 'WAITING') throw new RoomError('WRONG_STATE');
    room.settings = this.parseSettings(rawSettings);
    room.limit = raceLimitSeconds(room.settings);
    // Players agreed to the old settings, so they confirm again.
    for (const p of room.players.values()) p.ready = false;
    room.lastActivity = Date.now();
    this.emitState(room);
    this.refreshInvites(room);
  }

  async invite(user, targetId) {
    const room = this.requireRoom(user.id);
    if (room.status !== 'WAITING') throw new RoomError('WRONG_STATE');
    if (targetId === user.id) throw new RoomError('INVITE_SELF');
    if (room.players.has(targetId)) throw new RoomError('ALREADY_IN_ROOM');
    if (this.active(room).length >= MAX_PLAYERS) throw new RoomError('ROOM_FULL');
    if (!(await this.store.areFriends(user.id, targetId))) throw new RoomError('NOT_FRIENDS');
    if (this.rooms.get(room.code) !== room || room.status !== 'WAITING') throw new RoomError('WRONG_STATE');
    room.invites.set(targetId, user.id);
    this.sendTo(targetId, { type: 'invite', invite: this.inviteView(room, user.id) });
    this.pushInvites(targetId);
    this.sendTo(user.id, { type: 'invite_sent', userId: targetId });
  }

  declineInvite(user, rawCode) {
    const room = this.rooms.get(normalizeRoomCode(rawCode));
    if (!room) { this.pushInvites(user.id); return; }
    const inviter = room.invites.get(user.id);
    room.invites.delete(user.id);
    this.pushInvites(user.id);
    if (inviter) this.sendTo(inviter, { type: 'invite_declined', code: room.code, username: user.username });
  }

  cancel(userId) {
    const room = this.requireRoom(userId);
    this.requireHost(room, userId);
    if (room.status !== 'WAITING' && room.status !== 'COUNTDOWN') throw new RoomError('WRONG_STATE');
    this.destroy(room, 'CANCELLED', 'host');
  }

  /* ---------- race ---------- */

  start(userId) {
    const room = this.requireRoom(userId);
    this.requireHost(room, userId);
    if (room.status !== 'WAITING') throw new RoomError('WRONG_STATE');
    if (!this.active(room).length) throw new RoomError('WRONG_STATE');
    const now = Date.now();
    room.status = 'COUNTDOWN';
    // The seed is revealed only now, so nobody can read the text ahead of time.
    room.seed = crypto.randomInt(1, 2 ** 31 - 1);
    room.startAt = now + this.t.countdownMs;
    room.endsAt = room.startAt + room.limit * 1000;
    for (const p of room.players.values()) Object.assign(p, { finished: false, progress: 0, wpm: 0, acc: 100, chars: 0, result: null });
    const invited = [...room.invites.keys()];
    room.invites.clear();
    invited.forEach(id => this.pushInvites(id));
    this.broadcast(room, { type: 'start_countdown', startAt: room.startAt, endsAt: room.endsAt, seed: room.seed, serverTime: now });
    this.track('GAME_STARTED', { id: userId, username: room.players.get(userId)?.username }, { code: room.code, players: this.active(room).length, mode: room.settings.mode });
    this.emitState(room);
    room.timers.start = setTimeout(() => this.beginRace(room), this.t.countdownMs);
    this.store.markStarted(room).catch(err => this.log.error('Room start not saved:', err.message));
  }

  beginRace(room) {
    if (room.status !== 'COUNTDOWN' || this.rooms.get(room.code) !== room) return;
    room.status = 'RUNNING';
    this.broadcast(room, { type: 'race_started', startAt: room.startAt, endsAt: room.endsAt, serverTime: Date.now() });
    this.emitState(room);
    room.timers.progress = setInterval(() => this.flushProgress(room), this.t.progressTickMs);
    room.timers.end = setTimeout(() => this.finalize(room), Math.max(0, room.endsAt - Date.now()) + this.t.finishGraceMs);
  }

  progress(userId, d) {
    const room = this.roomFor(userId);
    if (!room || room.status !== 'RUNNING') return;
    const p = room.players.get(userId);
    if (!p || p.left || p.finished) return;
    const now = Date.now();
    if (now - p.lastProgressAt < this.t.progressMinGapMs) return;
    p.lastProgressAt = now;
    p.progress = d.progress; p.wpm = d.wpm; p.acc = d.acc; p.chars = d.chars;
    room.progressDirty = true;
  }

  flushProgress(room) {
    if (!room.progressDirty) return;
    room.progressDirty = false;
    this.broadcast(room, {
      type: 'progress',
      players: [...room.players.values()].map(p => ({ id: p.userId, progress: round1(p.progress), wpm: Math.round(p.wpm), acc: round1(p.acc), chars: p.chars, finished: p.finished, left: p.left }))
    });
  }

  /** Anti-cheat: the claimed race time has to match the server's clock, and the numbers have to agree. */
  judge(room, d, now) {
    const s = room.settings;
    const serverElapsed = (now - room.startAt) / 1000;
    // Claiming more time than has passed is impossible.
    if (d.elapsed > serverElapsed + 1.5 || d.elapsed > room.limit + 1.5) return 'flagged';
    if (s.mode === 'time' && Math.abs(d.elapsed - s.time) > 1.5) return 'flagged';
    // Claiming to have finished well before the message arrived would inflate wpm.
    if (s.mode !== 'time' && serverElapsed - d.elapsed > this.t.elapsedToleranceS) return 'flagged';
    if (!isPlausible({ ...d, mode: s.mode, mode2: mode2For(s) })) return 'suspicious';
    return 'valid';
  }

  finish(userId, d) {
    const room = this.requireRoom(userId);
    if (room.status === 'FINISHED') return;
    if (room.status !== 'RUNNING') throw new RoomError('WRONG_STATE');
    const p = room.players.get(userId);
    if (!p || p.left || p.finished) return;
    const now = Date.now();
    const typed = d.chars.correct + d.chars.incorrect + d.chars.extra;
    p.finished = true;
    p.finishedAt = now;
    p.wpm = d.wpm; p.acc = d.acc;
    if (room.settings.mode !== 'time' && d.chars.missed === 0 && typed > 0) p.progress = 100;
    // Nothing typed is a did-not-finish, not a 0 wpm result.
    p.result = typed > 0 ? { ...d, status: this.judge(room, d, now) } : null;
    room.progressDirty = true;
    this.broadcast(room, { type: 'player_finished', userId, wpm: Math.round(d.wpm), acc: round1(d.acc) });
    if (this.allDone(room)) this.finalize(room);
  }

  allDone(room) { return this.active(room).every(p => p.finished); }

  /** Ranks by wpm, then accuracy, then whoever finished sooner. Flagged results and DNFs go last. */
  rank(room) {
    const entries = [...room.players.values()].map(p => {
      const status = p.result ? p.result.status : 'dnf';
      let result = null;
      if (p.result) { const { status: _s, ...rest } = p.result; result = rest; }
      return { userId: p.userId, username: p.username, avatar: p.avatar, left: p.left, status, result, progress: p.progress };
    });
    entries.sort((a, b) =>
      RANK_GROUP[a.status] - RANK_GROUP[b.status]
      || (b.result?.wpm ?? 0) - (a.result?.wpm ?? 0)
      || (b.result?.acc ?? 0) - (a.result?.acc ?? 0)
      || (a.result?.elapsed ?? Infinity) - (b.result?.elapsed ?? Infinity)
      || b.progress - a.progress);
    entries.forEach((e, i) => { e.rank = i + 1; });
    return entries;
  }

  finalize(room) {
    if (room.status === 'FINISHED' || this.rooms.get(room.code) !== room) return;
    this.flushProgress(room);
    this.clearTimers(room);
    room.status = 'FINISHED';
    room.finishedAt = Date.now();
    const standings = this.rank(room);
    room.standings = standings;
    if (!this.active(room).some(p => p.userId === room.hostId)) this.transferHost(room);
    this.broadcast(room, { type: 'race_finished', code: room.code, standings: standings.map(publicStanding) });
    for (const s of standings) this.track('GAME_FINISHED', { id: s.userId, username: s.username }, { code: room.code, rank: s.rank, players: standings.length, status: s.status, wpm: s.result ? Math.round(s.result.wpm) : 0 });
    this.emitState(room);
    this.store.saveResults(room, standings)
      .then(() => this.broadcast(room, { type: 'results_saved', code: room.code }))
      .catch(err => this.log.error('Competition results not saved:', err.message));
    this.store.markEnded(room, 'FINISHED').catch(err => this.log.error('Room end not saved:', err.message));
    if (!this.active(room).length) this.evict(room);
  }

  /** Host only: a fresh room with the same settings. Everyone still on the results screen is pulled along. */
  async rematch(user) {
    const old = this.requireRoom(user.id);
    this.requireHost(old, user.id);
    if (old.status !== 'FINISHED') throw new RoomError('WRONG_STATE');
    const others = this.active(old).filter(p => p.userId !== user.id);
    const next = await this.create(user, old.settings);
    old.rematchCode = next.code;
    for (const p of others) {
      if (this.userRoom.get(p.userId) !== old.code) continue;
      next.invites.set(p.userId, user.id);
      this.sendTo(p.userId, { type: 'rematch', code: next.code, from: user.username });
      this.pushInvites(p.userId);
    }
    this.emitState(old);
    return next;
  }

  /* ---------- connections ---------- */

  /** A socket opened. Returns what the client needs to resume. */
  onConnect(user) {
    const room = this.roomFor(user.id);
    if (room) {
      const p = room.players.get(user.id);
      if (p && !p.left) {
        const was = p.connected;
        p.connected = true; p.disconnectedAt = null; p.username = user.username; p.avatar = user.avatar || p.avatar;
        if (!was) this.emitState(room, user.id);
      }
    }
    return { room: room ? this.snapshot(room) : null, invites: this.invitesFor(user.id) };
  }

  /** The user's last socket closed. */
  onDisconnect(userId) {
    const room = this.roomFor(userId);
    const p = room?.players.get(userId);
    if (!p || p.left) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (room.status === 'COUNTDOWN' || room.status === 'RUNNING') room.disconnects = (room.disconnects || 0) + 1;
    this.emitState(room, userId);
  }

  sweep(now = Date.now()) {
    for (const room of [...this.rooms.values()]) {
      if (room.status === 'WAITING') {
        if (now - room.lastActivity > this.t.waitingIdleMs) { this.destroy(room, 'EXPIRED', 'idle'); continue; }
        for (const p of [...room.players.values()]) {
          if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > this.t.disconnectGraceMs && this.userRoom.get(p.userId) === room.code) this.leave(p.userId);
        }
      } else if (room.status === 'FINISHED') {
        if (now - room.finishedAt > this.t.finishedTtlMs) this.evict(room);
      } else if (room.status === 'RUNNING' && now > room.endsAt + this.t.finishGraceMs * 3) {
        this.finalize(room); // backstop in case the end timer was lost
      }
    }
  }

  /** Every room in memory, for the admin panel. */
  list() {
    return [...this.rooms.values()].map(room => ({
      ...this.snapshot(room),
      createdAt: room.createdAt, finishedAt: room.finishedAt, disconnects: room.disconnects || 0,
      host: room.players.get(room.hostId)?.username || null, invited: room.invites.size
    }));
  }

  /** An administrator closes a room in any state. Players are told why; nothing is saved for an unfinished race. */
  adminClose(code) {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) throw new RoomError('ROOM_NOT_FOUND');
    if (room.status === 'FINISHED') { this.evict(room); return { code: room.code, status: 'FINISHED' }; }
    this.destroy(room, 'CANCELLED', 'admin');
    return { code: room.code, status: 'CANCELLED' };
  }

  /** Tells everyone in a live room that the server is going away (deploy or restart). */
  shutdown() {
    for (const room of this.rooms.values()) {
      if (ACTIVE.has(room.status)) this.broadcast(room, { type: 'room_expired', code: room.code, reason: 'restart' });
      this.clearTimers(room);
    }
    this.stop();
  }
}

function publicStanding(s) {
  const r = s.result;
  return {
    userId: s.userId, username: s.username, avatar: s.avatar, rank: s.rank, status: s.status, left: s.left,
    wpm: r ? round1(r.wpm) : 0, raw: r ? round1(r.raw) : 0, acc: r ? round1(r.acc) : 0,
    consistency: r ? round1(r.consistency) : 0, elapsed: r ? round1(r.elapsed) : 0
  };
}
