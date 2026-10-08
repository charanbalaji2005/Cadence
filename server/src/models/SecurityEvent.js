import mongoose from 'mongoose';

export const SEVERITIES = ['normal', 'suspicious', 'critical'];

/**
 * A detected pattern (repeated failures, one IP trying many accounts, ...). Repeats of the
 * same pattern inside a short window update one record instead of creating thousands.
 */
const securityEventSchema = new mongoose.Schema({
  type: { type: String, required: true },
  severity: { type: String, enum: SEVERITIES, default: 'normal' },
  title: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ip: { type: String, default: '' },
  identifier: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  dedupeKey: { type: String, required: true },
  count: { type: Number, default: 1 },
  lastSeenAt: { type: Date, default: Date.now },
  acknowledgedAt: Date,
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, minimize: false });

securityEventSchema.index({ createdAt: -1 });
securityEventSchema.index({ dedupeKey: 1, lastSeenAt: -1 });
securityEventSchema.index({ severity: 1, createdAt: -1 });
securityEventSchema.index({ user: 1, createdAt: -1 });

export const SecurityEvent = mongoose.model('SecurityEvent', securityEventSchema);
