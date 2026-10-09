import mongoose from 'mongoose';

export const ACTIVITY_TYPES = [
  'USER_SIGNUP', 'USER_LOGIN', 'USER_LOGOUT', 'PROFILE_UPDATED', 'SETTINGS_CHANGED', 'ACCOUNT_DELETED',
  'FRIEND_REQUEST', 'FRIEND_ACCEPTED',
  'ROOM_CREATED', 'ROOM_JOINED', 'ROOM_LEFT', 'GAME_STARTED', 'GAME_FINISHED',
  'ACCOUNT_SUSPENDED', 'ACCOUNT_ACTIVATED', 'ADMIN_ACTION', 'SECURITY_EVENT', 'ACCOUNT_LINKED', 'ACCOUNT_UNLINKED'
];

/** What users did (and what admins did to them). Typing tests live in Result and are merged in when read. */
const activityEventSchema = new mongoose.Schema({
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set when someone else acted, e.g. an admin
  target: { type: String, default: '' },
  result: { type: String, enum: ['success', 'failure'], default: 'success' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false });

activityEventSchema.index({ createdAt: -1 });
activityEventSchema.index({ user: 1, createdAt: -1 });
activityEventSchema.index({ type: 1, createdAt: -1 });

export const ActivityEvent = mongoose.model('ActivityEvent', activityEventSchema);
