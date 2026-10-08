import mongoose from 'mongoose';
import { CompetitionRoom, ACTIVE_STATUS } from '../models/CompetitionRoom.js';
import { Result } from '../models/Result.js';
import { User } from '../models/User.js';
import { Friendship, pairKey } from '../models/Friendship.js';
import { recordDailyTest } from '../utils/activity.js';
import { userStatsUpdate } from '../utils/resultStats.js';
import { mode2For } from './protocol.js';

const WAITING_TTL_MS = 30 * 60 * 1000;
const ENDED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * MongoDB side of competitions. A race costs about three room writes plus one result
 * per player; live progress never reaches the database.
 */
export const mongoStore = {
  newId: () => new mongoose.Types.ObjectId().toString(),

  async codeExists(code) { return !!(await CompetitionRoom.exists({ roomCode: code })); },

  async createRoom(room) {
    await CompetitionRoom.create({
      _id: room.id, roomCode: room.code, host: room.hostId, players: [room.hostId], maxPlayers: room.maxPlayers,
      settings: settingsDoc(room.settings), status: 'WAITING', expiresAt: new Date(Date.now() + WAITING_TTL_MS)
    });
  },

  async markStarted(room) {
    await CompetitionRoom.updateOne({ _id: room.id }, {
      $set: { status: 'RUNNING', host: room.hostId, players: [...room.players.keys()], settings: settingsDoc(room.settings), startedAt: new Date(room.startAt), expiresAt: new Date(Date.now() + ENDED_TTL_MS) }
    });
  },

  async markEnded(room, status, reason = '') {
    const finished = status === 'FINISHED' && room.standings;
    // Finished races are kept as history (admin competitions view, until the retention purge); others expire after a day.
    const set = { status, endReason: reason, finishedAt: new Date(), disconnects: room.disconnects || 0 };
    if (finished) set.standings = room.standings.map(s => ({ user: s.userId, username: s.username, rank: s.rank, wpm: s.result?.wpm || 0, acc: s.result?.acc || 0, status: s.status, left: !!s.left }));
    else set.expiresAt = new Date(Date.now() + ENDED_TTL_MS);
    await CompetitionRoom.updateOne({ _id: room.id }, finished ? { $set: set, $unset: { expiresAt: 1 } } : { $set: set });
  },

  /** On boot nothing is live any more, so rooms the last process left open are closed out. */
  async expireOrphans() {
    const r = await CompetitionRoom.updateMany({ status: { $in: ACTIVE_STATUS } }, { $set: { status: 'EXPIRED', endReason: 'restart', expiresAt: new Date(Date.now() + ENDED_TTL_MS) } });
    return r.modifiedCount || 0;
  },

  async endedByRestart(code, userId) {
    return !!(await CompetitionRoom.exists({ roomCode: code, endReason: 'restart', players: userId }));
  },

  async areFriends(a, b) {
    return !!(await Friendship.exists({ pair: pairKey(a, b), status: 'accepted' }));
  },

  async pendingRequests(userId) {
    return Friendship.countDocuments({ recipient: userId, status: 'pending' });
  },

  /** Saves one Result per player who finished. Valid ones also update activity, key stats and PBs. */
  async saveResults(room, standings) {
    const finished = standings.filter(s => s.result);
    const mode2 = mode2For(room.settings);
    const base = { mode: room.settings.mode, mode2, punctuation: room.settings.punctuation, numbers: room.settings.numbers };
    await Promise.all(finished.map(async s => {
      const d = { ...base, ...s.result };
      const opponents = standings.filter(o => o.userId !== s.userId).map(o => ({ username: o.username, rank: o.rank, wpm: o.result ? o.result.wpm : 0, status: o.status }));
      const result = await Result.create({
        user: s.userId, wpm: d.wpm, raw: d.raw, acc: d.acc, consistency: d.consistency, mode: d.mode, mode2, punctuation: d.punctuation, numbers: d.numbers,
        elapsed: Math.max(1, d.elapsed), chars: d.chars, lbEligible: false,
        race: { room: room.id, code: room.code, rank: s.rank, players: standings.length, status: s.status, opponents }
      });
      if (s.status !== 'valid') return;
      await recordDailyTest(s.userId, result);
      const user = await User.findById(s.userId).select('personalBests');
      if (!user) return;
      const { update } = userStatsUpdate(user, d);
      if (Object.keys(update).length) await User.updateOne({ _id: s.userId }, update);
    }));
  }
};

const settingsDoc = s => ({ mode: s.mode, time: s.time, words: s.words, quoteLen: s.quoteLen, punctuation: s.punctuation, numbers: s.numbers });
