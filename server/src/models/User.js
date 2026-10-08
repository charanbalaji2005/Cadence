import mongoose from 'mongoose';

const keyStatSchema = new mongoose.Schema({ n: { type: Number, default: 0 }, e: { type: Number, default: 0 }, ms: { type: Number, default: 0 }, mc: { type: Number, default: 0 } }, { _id: false });
const bestSchema = new mongoose.Schema({ wpm: Number, acc: Number, raw: Number, consistency: Number, date: Date }, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 16 },
  usernameLower: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  googleId: { type: String, index: { unique: true, sparse: true } },
  githubId: { type: String, index: { unique: true, sparse: true } },
  avatar: { type: String, default: '' },
  provider: { type: String, enum: ['email', 'google', 'github'], default: 'email' },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  keyStats: { type: Map, of: keyStatSchema, default: {} },
  personalBests: { type: Map, of: bestSchema, default: {} }
}, { timestamps: true, minimize: false });

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), username: this.username, email: this.email, avatar: this.avatar, provider: this.provider, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
