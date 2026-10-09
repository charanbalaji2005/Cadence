import mongoose from 'mongoose';

/**
 * Broadcast messages sent by admins that are delivered to all users:
 * - 'inbox': direct messages appearing under the Inbox section of Cadence Mail
 * - 'announcement': platform notices and updates appearing under Announcements
 * - 'notification': alerts and status toasts appearing under Notifications
 */
const broadcastMessageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['inbox', 'announcement', 'notification'],
    default: 'inbox',
    required: true
  },
  category: {
    type: String,
    default: 'Cadence Team',
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  severity: {
    type: String,
    enum: ['info', 'success', 'warning', 'urgent'],
    default: 'info'
  },
  author: {
    type: String,
    default: 'Cadence Admin'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

broadcastMessageSchema.index({ active: 1, createdAt: -1 });

export const BroadcastMessage = mongoose.model('BroadcastMessage', broadcastMessageSchema);
