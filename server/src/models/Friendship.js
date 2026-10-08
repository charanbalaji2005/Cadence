import mongoose from 'mongoose';

/**
 * One document per pair of users, whatever the state of their relationship.
 * `pair` is the two ids sorted and joined, so a pair can never have two documents
 * (no duplicate requests, no duplicate friendships, no request in both directions).
 */
const friendshipSchema = new mongoose.Schema({
  pair: { type: String, required: true, unique: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'blocked'], required: true },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acceptedAt: { type: Date }
}, { timestamps: true });

// Listing someone's friends and requests looks them up from either side.
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

export const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

export const Friendship = mongoose.model('Friendship', friendshipSchema);
