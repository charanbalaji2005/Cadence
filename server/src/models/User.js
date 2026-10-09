import mongoose from 'mongoose';

const keyStatSchema = new mongoose.Schema({ n: { type: Number, default: 0 }, e: { type: Number, default: 0 }, ms: { type: Number, default: 0 }, mc: { type: Number, default: 0 } }, { _id: false });
const bestSchema = new mongoose.Schema({ wpm: Number, acc: Number, raw: Number, consistency: Number, date: Date }, { _id: false });

export const ROLES = ['USER', 'ANALYST', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'];
export const USER_STATUS = ['active', 'suspended', 'deleted'];

const suspensionSchema = new mongoose.Schema({
  reason: { type: String, enum: ['spam', 'abuse', 'security', 'policy', 'other'] },
  note: { type: String, maxlength: 500 },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at: Date
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 20 },
  usernameLower: { type: String, required: true },
  usernameNormalized: { type: String, index: { unique: true, sparse: true } },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  googleId: { type: String, index: { unique: true, sparse: true } },
  githubId: { type: String, index: { unique: true, sparse: true } },
  avatar: { type: String, default: '' },
  provider: { type: String, enum: ['email', 'google', 'github', 'srm_ap'], default: 'email' },
  profileCompleted: { type: Boolean, default: false },
  settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  keyStats: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  personalBests: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  // Administration. Only these fields decide access; they are never taken from client input.
  role: { type: String, enum: ROLES, default: 'USER' },
  status: { type: String, enum: USER_STATUS, default: 'active' },
  suspension: { type: suspensionSchema, default: undefined },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastLoginAt: Date,
  lastActiveAt: Date,
  signupCountry: { type: String, default: '' },
  // Public GitHub/Google profile facts only. OAuth tokens are never stored.
  githubLogin: { type: String, default: '' },
  githubConnectedAt: Date,
  googleConnectedAt: Date,
  lastAuthProvider: { type: String, default: '' },
  // Mirror of the active IdentityBinding, written only by services/srmap/bindings.js after verification.
  // Branding and badges read this; nothing from the browser can set it. It deliberately holds no
  // institutional profile data: that lives on the IdentityBinding, which is never published.
  connectedAccounts: {
    srm_ap: {
      type: new mongoose.Schema({
        verified: Boolean,
        batchYear: Number,
        boundAt: Date
      }, { _id: false }),
      default: undefined
    }
  }
}, { timestamps: true, minimize: false });

userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ role: 1 });
userSchema.index({ lastActiveAt: -1 });
// SRM AP leaderboard: verified students, optionally by batch.
userSchema.index({ 'connectedAccounts.srm_ap.verified': 1, 'connectedAccounts.srm_ap.batchYear': 1 }, { sparse: true });

userSchema.methods.toPublic = function toPublic() {
  const srm = this.connectedAccounts?.srm_ap;
  let av = this.avatar || '';
  if (av) {
    av = av.replace(/uploads\/profile_photos\/profiles\//g, 'profiles/')
           .replace(/uploads\/profile_photos\/(uploads\/profile_photos\/)+/g, 'uploads/profile_photos/');
    if (av.startsWith('http://oursrmap.purlyedit.in/')) {
      av = 'https://oursrmap.purlyedit.in/' + av.slice('http://oursrmap.purlyedit.in/'.length);
    }
  }
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    avatar: av,
    provider: this.provider,
    profileCompleted: this.profileCompleted !== false,
    role: this.role || 'USER',
    createdAt: this.createdAt,
    connections: {
      srm_ap: srm?.verified ? {
        verified: true,
        batchYear: srm.batchYear ?? null
      } : null
    }
  };
};

export const User = mongoose.model('User', userSchema);
