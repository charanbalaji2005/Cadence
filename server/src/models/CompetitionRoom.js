import mongoose from 'mongoose';

export const ROOM_STATUS = ['WAITING', 'COUNTDOWN', 'RUNNING', 'FINISHED', 'CANCELLED', 'EXPIRED'];
export const ACTIVE_STATUS = ['WAITING', 'COUNTDOWN', 'RUNNING'];

/**
 * Durable metadata for a competition room. Live state (sockets, progress) lives only
 * in memory; this document is written a handful of times per room (create, start,
 * finish/cancel) so codes stay unique and a restart can be explained to players.
 */
const competitionRoomSchema = new mongoose.Schema({
  roomCode: { type: String, required: true, unique: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  maxPlayers: { type: Number, default: 4, min: 1, max: 4 },
  settings: {
    mode: { type: String, enum: ['time', 'words', 'quote', 'custom'], required: true },
    time: Number,
    words: Number,
    quoteLen: String,
    punctuation: Boolean,
    numbers: Boolean
  },
  status: { type: String, enum: ROOM_STATUS, default: 'WAITING' },
  endReason: { type: String, default: '' },
  // Written once when a race finishes, for the admin competitions view.
  standings: [{ _id: false, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, username: String, rank: Number, wpm: Number, acc: Number, status: String, left: Boolean }],
  disconnects: { type: Number, default: 0 },
  startedAt: Date,
  finishedAt: Date,
  // MongoDB deletes the document once this passes, so no cron job is needed.
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

competitionRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
competitionRoomSchema.index({ status: 1, finishedAt: -1 });

export const CompetitionRoom = mongoose.model('CompetitionRoom', competitionRoomSchema);
