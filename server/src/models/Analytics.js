import mongoose from 'mongoose';

export const SOURCES = ['direct', 'search', 'social', 'referral', 'email', 'other'];

/**
 * One page view. Visitor and session ids are random ids made in the browser (no cookies,
 * no fingerprint). The route is the app's route pattern, never a full URL with query data.
 */
const pageViewSchema = new mongoose.Schema({
  vid: { type: String, required: true },
  sid: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  route: { type: String, required: true },
  durationMs: { type: Number, default: 0 },
  device: String, browser: String, os: String, country: String
}, { timestamps: { createdAt: true, updatedAt: false } });

pageViewSchema.index({ createdAt: -1 });
pageViewSchema.index({ route: 1, createdAt: -1 });
pageViewSchema.index({ sid: 1, createdAt: 1 });

/** One visit: a browser tab's activity until 30 minutes without activity. Updated per page, not appended. */
const visitorSessionSchema = new mongoose.Schema({
  sid: { type: String, required: true, unique: true },
  vid: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startedAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  pages: { type: Number, default: 1 },
  entryRoute: String,
  exitRoute: String,
  source: { type: String, enum: SOURCES, default: 'direct' },
  referrer: { type: String, default: '' },   // host only
  returning: { type: Boolean, default: false },
  device: String, browser: String, os: String, country: String,
  screen: { type: String, default: '' }      // width bucket, e.g. "1280-1919"
});

visitorSessionSchema.index({ startedAt: -1 });
visitorSessionSchema.index({ vid: 1, startedAt: -1 });
visitorSessionSchema.index({ user: 1, startedAt: -1 });

export const PageView = mongoose.model('PageView', pageViewSchema);
export const VisitorSession = mongoose.model('VisitorSession', visitorSessionSchema);
