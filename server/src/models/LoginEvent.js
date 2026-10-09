import mongoose from 'mongoose';

export const LOGIN_TYPES = ['signup', 'login', 'failed', 'logout', 'revoked', 'blocked'];

/** Every sign-in, sign-up, failure and sign-out. Raw emails of unknown accounts are never stored. */
const loginEventSchema = new mongoose.Schema({
  type: { type: String, enum: LOGIN_TYPES, required: true },
  success: { type: Boolean, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, default: '' },
  identifier: { type: String, default: '' },     // masked email, for display
  identifierHash: { type: String, default: '' }, // for counting repeated attempts without the address
  provider: { type: String, enum: ['email', 'google', 'github', 'srm_ap', ''], default: '' },
  reason: { type: String, default: '' },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  ip: { type: String, default: '' },
  device: String, browser: String, os: String, country: String,
  risk: { type: String, enum: ['normal', 'suspicious', 'critical'], default: 'normal' }
}, { timestamps: { createdAt: true, updatedAt: false } });

loginEventSchema.index({ createdAt: -1 });
loginEventSchema.index({ type: 1, createdAt: -1 });
loginEventSchema.index({ user: 1, createdAt: -1 });
loginEventSchema.index({ ip: 1, createdAt: -1 });
loginEventSchema.index({ identifierHash: 1, createdAt: -1 });

export const LoginEvent = mongoose.model('LoginEvent', loginEventSchema);
