import mongoose from 'mongoose';

const dailyActivitySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  dayDate: { type: Date, required: true }, // Midnight Date object
  tests: { type: Number, default: 0 },
  characters: { type: Number, default: 0 },
  typingTime: { type: Number, default: 0 }, // Elapsed in seconds
  bestWpm: { type: Number, default: 0 },
  averageWpm: { type: Number, default: 0 },
  averageAccuracy: { type: Number, default: 0 },
  achievements: { type: [String], default: [] }
}, { timestamps: true });

// Compound unique index ensuring one record per user per day
dailyActivitySchema.index({ user: 1, date: 1 }, { unique: true });
dailyActivitySchema.index({ user: 1, dayDate: -1 });

dailyActivitySchema.methods.toPublic = function toPublic() {
  return {
    date: this.date,
    tests: this.tests,
    characters: this.characters,
    typingTime: this.typingTime,
    bestWpm: Math.round(this.bestWpm),
    averageWpm: Math.round(this.averageWpm),
    averageAccuracy: Number(this.averageAccuracy.toFixed(1)),
    achievements: this.achievements || []
  };
};

export const DailyActivity = mongoose.model('DailyActivity', dailyActivitySchema);
