import mongoose from 'mongoose';

const resultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wpm: { type: Number, required: true },
  raw: { type: Number, required: true },
  acc: { type: Number, required: true },
  consistency: { type: Number, required: true },
  mode: { type: String, enum: ['time', 'words', 'quote', 'zen', 'custom'], required: true },
  mode2: { type: String, default: '' },
  punctuation: { type: Boolean, default: false },
  numbers: { type: Boolean, default: false },
  elapsed: { type: Number, required: true },
  chars: { correct: Number, incorrect: Number, extra: Number, missed: Number },
  lbEligible: { type: Boolean, default: false },
  imported: { type: Boolean, default: false },
  clientId: { type: String } // set by the browser so a retried save never creates a duplicate
}, { timestamps: { createdAt: true, updatedAt: false } });

resultSchema.index({ user: 1, createdAt: -1 });
resultSchema.index({ lbEligible: 1, mode2: 1, wpm: -1 });
resultSchema.index({ lbEligible: 1, mode2: 1, createdAt: -1 });
resultSchema.index({ user: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

resultSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(), wpm: this.wpm, raw: this.raw, acc: this.acc, consistency: this.consistency,
    mode: this.mode, mode2: this.mode2, punctuation: this.punctuation, numbers: this.numbers,
    elapsed: this.elapsed, chars: this.chars, date: this.createdAt.getTime()
  };
};

export const Result = mongoose.model('Result', resultSchema);
