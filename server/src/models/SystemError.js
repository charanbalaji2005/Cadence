import mongoose from 'mongoose';

/** Errors grouped by fingerprint, so a repeating error is one row with a count. Text is scrubbed of secrets. */
const systemErrorSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true },
  source: { type: String, enum: ['server', 'client', 'realtime'], default: 'server' },
  type: { type: String, default: 'Error' },
  message: { type: String, default: '' },
  route: { type: String, default: '' },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  stack: { type: String, default: '' },
  count: { type: Number, default: 1 },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  lastRequestId: { type: String, default: '' },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
  statusBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  statusAt: Date
});
systemErrorSchema.index({ lastSeen: -1 });
systemErrorSchema.index({ status: 1, lastSeen: -1 });

/** One tiny row per occurrence, so "errors in the last hour/day/week" can be counted. */
const errorEventSchema = new mongoose.Schema({ fingerprint: String, at: { type: Date, default: Date.now } }, { versionKey: false });
errorEventSchema.index({ at: -1 });

export const SystemError = mongoose.model('SystemError', systemErrorSchema);
export const ErrorEvent = mongoose.model('ErrorEvent', errorEventSchema);
