import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Result } from '../models/Result.js';
import { Friendship } from '../models/Friendship.js';
import { DailyActivity } from '../models/DailyActivity.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { hub } from '../realtime/hub.js';
import { config } from '../config.js';
import { audit } from './audit.js';
import { track, notifyAdmins } from './events.js';
import { ROLE_RANK } from '../middleware/admin.js';

/** Closes the user's live sockets (all of them, or only those opened with one session). */
export function kickSockets(userId, sessionId) {
  const set = hub.sockets.get(String(userId));
  if (!set) return 0;
  let n = 0;
  for (const ws of [...set]) if (!sessionId || ws.sessionId === String(sessionId)) { ws.close(4401, 'Session ended'); n++; }
  return n;
}

/** Ends sessions. They stay listed (as revoked) until they would have expired anyway. */
export async function revokeSessions(userId, { sessionId, reason = 'admin', by } = {}) {
  const filter = { user: userId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() }, ...(sessionId ? { _id: sessionId } : {}) };
  const r = await Session.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason, ...(by ? { revokedBy: by._id } : {}) } });
  kickSockets(userId, sessionId);
  if (r.modifiedCount) {
    await LoginEvent.create({ type: 'revoked', success: true, user: userId, reason, ...(sessionId ? { session: sessionId } : {}) }).catch(() => {});
  }
  return r.modifiedCount;
}

const label = u => `${u.username} <${u.email}>`;

export async function suspendUser(target, { by, reason, note, req }) {
  target.status = 'suspended';
  target.suspension = { reason, note: note || '', by: by._id, at: new Date() };
  await target.save();
  const revoked = await revokeSessions(target._id, { reason: 'suspended', by });
  await audit({ actor: by, action: 'SUSPEND_USER', targetType: 'user', targetId: target._id, targetLabel: label(target), reason: [reason, note].filter(Boolean).join(': '), metadata: { sessionsRevoked: revoked }, req });
  track('ACCOUNT_SUSPENDED', { user: target, actor: by, metadata: { reason } });
  return target;
}

export async function activateUser(target, { by, req }) {
  const was = target.status;
  target.status = 'active';
  target.suspension = undefined;
  target.deletedAt = undefined;
  target.deletedBy = undefined;
  await target.save();
  await audit({ actor: by, action: was === 'deleted' ? 'RESTORE_USER' : 'ACTIVATE_USER', targetType: 'user', targetId: target._id, targetLabel: label(target), metadata: { previousStatus: was }, req });
  track('ACCOUNT_ACTIVATED', { user: target, actor: by, metadata: { previousStatus: was } });
  return target;
}

/** Soft delete: the account can no longer sign in and is hidden, but can be restored. */
export async function softDeleteUser(target, { by, reason, req }) {
  target.status = 'deleted';
  target.deletedAt = new Date();
  target.deletedBy = by._id;
  await target.save();
  const revoked = await revokeSessions(target._id, { reason: 'deleted', by });
  await audit({ actor: by, action: 'DELETE_USER', targetType: 'user', targetId: target._id, targetLabel: label(target), reason: reason || '', metadata: { soft: true, sessionsRevoked: revoked }, req });
  track('ADMIN_ACTION', { user: target, actor: by, target: 'DELETE_USER', metadata: { soft: true } });
  return target;
}

/** Permanent removal of an already soft-deleted account and its typing data. Audit records keep a snapshot label. */
export async function purgeUser(target, { by, req }) {
  const id = target._id;
  const snapshot = label(target);
  await Promise.all([
    Result.deleteMany({ user: id }), Session.deleteMany({ user: id }), DailyActivity.deleteMany({ user: id }),
    Friendship.deleteMany({ $or: [{ requester: id }, { recipient: id }] }), User.deleteOne({ _id: id })
  ]);
  kickSockets(id);
  await audit({ actor: by, action: 'PURGE_USER', targetType: 'user', targetId: id, targetLabel: snapshot, metadata: { permanent: true }, req });
}

export async function changeRole(target, { by, role, req }) {
  const from = target.role || 'USER';
  target.role = role;
  await target.save();
  await audit({ actor: by, action: 'CHANGE_ROLE', targetType: 'user', targetId: target._id, targetLabel: label(target), metadata: { from, to: role }, req });
  track('ADMIN_ACTION', { user: target, actor: by, target: 'CHANGE_ROLE', metadata: { from, to: role } });
  if (ROLE_RANK[role] >= ROLE_RANK.ADMIN && ROLE_RANK[from] < ROLE_RANK.ADMIN) {
    notifyAdmins({ type: 'new_admin', severity: 'warning', title: `${target.username} is now ${role === 'SUPER_ADMIN' ? 'a super admin' : 'an admin'}`, body: `Granted by ${by.username}`, link: `/admin/users/${target._id}`, dedupeKey: `admin:${target._id}:${role}` });
  }
  return target;
}

/**
 * Accounts listed in ADMIN_EMAILS become SUPER_ADMIN. This is how the first administrator is
 * created; it only ever promotes, so removing an email from the list doesn't demote anyone.
 */
export async function applyBootstrapRole(user) {
  if (!user?.email || !config.adminEmails.includes(user.email.toLowerCase()) || user.role === 'SUPER_ADMIN') return false;
  const from = user.role || 'USER';
  await User.updateOne({ _id: user._id }, { $set: { role: 'SUPER_ADMIN' } });
  user.role = 'SUPER_ADMIN';
  await audit({ actor: null, action: 'BOOTSTRAP_SUPER_ADMIN', targetType: 'user', targetId: user._id, targetLabel: label(user), reason: 'Listed in ADMIN_EMAILS', metadata: { from, to: 'SUPER_ADMIN' } });
  return true;
}

export async function bootstrapAdmins() {
  if (!config.adminEmails.length) return 0;
  const users = await User.find({ email: { $in: config.adminEmails }, role: { $ne: 'SUPER_ADMIN' } });
  for (const u of users) await applyBootstrapRole(u);
  return users.length;
}
