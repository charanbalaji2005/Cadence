import mongoose from 'mongoose';

// Set only on results typed in a multiplayer competition.
const raceSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'CompetitionRoom', required: true },
  code: { type: String, required: true },
  rank: { type: Number, required: true },
  players: { type: Number, required: true },
  status: { type: String, enum: ['valid', 'suspicious', 'flagged'], required: true },
  opponents: [{ _id: false, username: String, rank: Number, wpm: Number, status: String }]
}, { _id: false });

const resultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wpm: { type: Number, required: true },
  raw: { type: Number, required: true },
  acc: { type: Number, required: true },
  consistency: { type: Number, required: true },
  mode: { type: String, enum: ['time', 'words', 'quote', 'zen', 'custom'], required: true },
  mode2: { type: String, default: '' },
  language: { type: String, enum: ['english', 'english 1k', 'english advanced'], default: 'english' },
  punctuation: { type: Boolean, default: false },
  numbers: { type: Boolean, default: false },
  elapsed: { type: Number, required: true },
  chars: { correct: Number, incorrect: Number, extra: Number, missed: Number },
  lbEligible: { type: Boolean, default: false },
  imported: { type: Boolean, default: false },
  clientId: { type: String }, // set by the browser so a retried save never creates a duplicate
  race: { type: raceSchema, default: undefined }
}, { timestamps: { createdAt: true, updatedAt: false } });

resultSchema.index({ user: 1, createdAt: -1 });
resultSchema.index({ lbEligible: 1, mode2: 1, wpm: -1 });
resultSchema.index({ lbEligible: 1, mode2: 1, createdAt: -1 });
resultSchema.index({ user: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
// Competition history only scans the user's race results, not every test they took.
resultSchema.index({ user: 1, createdAt: -1, 'race.rank': 1 }, { partialFilterExpression: { 'race.rank': { $exists: true } } });

/** Race results that failed anti-cheat are kept for review but never feed stats, PBs or achievements. */
export const COUNTED_RESULTS = { 'race.status': { $nin: ['suspicious', 'flagged'] } };

resultSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(), wpm: this.wpm, raw: this.raw, acc: this.acc, consistency: this.consistency,
    mode: this.mode, mode2: this.mode2, language: this.language || 'english', punctuation: this.punctuation, numbers: this.numbers,
    elapsed: this.elapsed, chars: this.chars, date: this.createdAt.getTime(),
    ...(this.race ? { race: { code: this.race.code, rank: this.race.rank, players: this.race.players } } : {})
  };
};

export const Result = mongoose.model('Result', resultSchema);
