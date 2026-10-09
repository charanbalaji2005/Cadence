import mongoose from 'mongoose';

export const IDENTITY_PROVIDERS = ['srm_ap'];

const historySchema = new mongoose.Schema({
  type: { type: String, enum: ['bound', 'login', 'refreshed', 'synced', 'sync_failed', 'unbound'], required: true },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, default: '', maxlength: 300 }
}, { _id: false });

/**
 * A verified link between a Cadence account and an institutional identity.
 * Only allow-listed profile fields are kept; credentials and raw provider responses never are.
 * Unbinding keeps the record (active: false) for the audit trail; uniqueness applies to active links only.
 */
const identityBindingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: IDENTITY_PROVIDERS, required: true },
  externalStudentId: { type: String, required: true, maxlength: 128 },
  registerNumberMasked: { type: String, default: '' },
  registerNumberHash: { type: String, default: '' }, // exact-match admin search without storing the number
  verifiedEmail: { type: String, default: '' },
  displayName: { type: String, default: '' },
  batchYear: { type: Number },
  // 'class' only appears on legacy records from before batch years had to be confirmed; it is never written now.
  batchSource: { type: String, enum: ['provider', 'register_number', 'class', null], default: null },
  className: { type: String, default: '' },
  section: { type: String, default: '' },
  gender: { type: String, default: '', maxlength: 20 },
  profilePhoto: { type: String, default: '' },
  // The student's own record from the directory API (get_student), fetched after verification.
  // pending: not fetched yet; synced: saved; not_found: the directory has no record; failed: retry later.
  profileSync: {
    status: { type: String, enum: ['pending', 'synced', 'not_found', 'failed'], default: 'pending' },
    attemptedAt: Date,
    syncedAt: Date,
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' }
  },
  identityVerified: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  // When the student agreed to Cadence keeping these fields (first-time sign-up or account linking).
  consentAt: { type: Date },
  boundAt: { type: Date, default: Date.now },
  lastAuthenticatedAt: { type: Date },
  unboundAt: { type: Date },
  unboundBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unboundReason: { type: String, default: '' },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

// One SRM AP identity -> at most one Cadence account, and one SRM AP link per account.
identityBindingSchema.index({ provider: 1, externalStudentId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_account_per_identity' });
identityBindingSchema.index({ user: 1, provider: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_identity_per_account' });
identityBindingSchema.index({ provider: 1, active: 1, boundAt: -1 });
identityBindingSchema.index({ registerNumberHash: 1 });
identityBindingSchema.index({ provider: 1, active: 1, 'profileSync.status': 1 });

export const IdentityBinding = mongoose.model('IdentityBinding', identityBindingSchema);

/**
 * A verified student who hasn't picked a username yet. Lives 15 minutes; only the token's hash is stored.
 * No Cadence account exists until the student confirms a username.
 */
const pendingSignupSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  provider: { type: String, enum: IDENTITY_PROVIDERS, required: true },
  profile: { type: mongoose.Schema.Types.Mixed, required: true },
  remember: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingSignup = mongoose.model('PendingSignup', pendingSignupSchema);
