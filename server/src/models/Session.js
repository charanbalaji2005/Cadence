import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true },
  remember: { type: Boolean, default: false },
  userAgent: { type: String, default: '' },
  // Device facts for the account's session list and the admin panel. No fingerprinting.
  ip: { type: String, default: '' },
  device: { type: String, default: '' },
  browser: { type: String, default: '' },
  os: { type: String, default: '' },
  country: { type: String, default: '' },
  provider: { type: String, default: '' },
  lastActiveAt: { type: Date },
  // A revoked session (logout, admin action) is kept until it expires so it shows in history.
  revokedAt: { type: Date },
  revokedReason: { type: String, default: '' },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

sessionSchema.index({ createdAt: -1 });
sessionSchema.index({ user: 1, revokedAt: 1 });

// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
