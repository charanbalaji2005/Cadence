import mongoose from 'mongoose';

/**
 * Administrative audit trail. Append-only: every record carries the hash of the previous
 * one, so editing or deleting a record breaks the chain and shows up in verification.
 * There are no update or delete routes, and the model refuses those operations.
 */
const auditLogSchema = new mongoose.Schema({
  seq: { type: Number, required: true, unique: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorLabel: { type: String, required: true },   // "username (ROLE)" or "system"
  action: { type: String, required: true },
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  targetLabel: { type: String, default: '' },
  reason: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  ip: { type: String, default: '' },
  at: { type: Date, required: true },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true }
}, { versionKey: false, minimize: false });

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ actor: 1, at: -1 });
auditLogSchema.index({ targetId: 1, at: -1 });

function refuse(next) { next(new Error('Audit records cannot be modified or deleted.')); }
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(op, refuse);
}
auditLogSchema.pre('save', function onlyInsert(next) {
  if (!this.isNew) return next(new Error('Audit records cannot be modified.'));
  next();
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
