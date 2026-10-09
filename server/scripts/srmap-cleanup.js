/**
 * One-off cleanup for Connect SRM AP data written before identity verification was enforced.
 *
 * Earlier code created Cadence accounts and "verified" SRM AP links from SRM AP's directory API
 * (list_students / get_student) and signed students in by comparing passwords with the bcrypt hashes that
 * API returns. None of that is proof of identity, and SRM AP has never offered a verification endpoint,
 * so every SRM AP link that exists today is unverified.
 *
 * Usage (from server/):
 *   node scripts/srmap-cleanup.js            dry run: prints counts only, changes nothing
 *   node scripts/srmap-cleanup.js --apply    makes the changes below
 *
 * With --apply it:
 *   1. Ends every active SRM AP link (kept, inactive, for the audit trail) and removes the badge from the account.
 *   2. Deletes accounts the directory sync created for students who never used Cadence:
 *      provider "srm_ap", linked by the sync, no typing results and no sign-in sessions.
 *   3. Removes copied institutional details (name, email, register number, gender, class, photo) from
 *      user documents and full register numbers / gender from link records.
 *   4. Deletes pending SRM AP sign-ups.
 *   5. Clears avatars that were copied from SRM AP's photo URLs (those URLs contain the full register number).
 *
 * Run it once, BEFORE a real SRM AP verification endpoint is configured: it ends every active link,
 * including ones a real verification would later create.
 * Accounts with typing history are never deleted. SRM AP-only accounts that were used are listed by id so an
 * admin can help those students add another sign-in method.
 * Output contains counts and account ids only, never student details.
 */
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { Result } from '../src/models/Result.js';
import { Session } from '../src/models/Session.js';
import { Friendship } from '../src/models/Friendship.js';
import { DailyActivity } from '../src/models/DailyActivity.js';
import { IdentityBinding, PendingSignup } from '../src/models/IdentityBinding.js';

const APPLY = process.argv.includes('--apply');
const REASON = 'created without SRM AP credential verification';
const PHOTO_HOST = (() => { try { return new URL(config.srmap.directoryUrl).host; } catch { return 'oursrmap.purlyedit.in'; } })();
// A host is letters, digits, dots, hyphens and a port, so dots are the only regex characters to escape.
const photoAvatar = { avatar: new RegExp(`^https?://${PHOTO_HOST.split('.').join('\\.')}/`, 'i') };
const LEGACY_USER_FIELDS = ['name', 'collegeEmail', 'registrationId', 'gender', 'className', 'section', 'profilePhoto']
  .map(f => `connectedAccounts.srm_ap.${f}`);

async function main() {
  await mongoose.connect(config.mongoUri);
  const db = mongoose.connection;
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} on ${db.host}/${db.name}\n`);

  const bindings = await IdentityBinding.find({ provider: 'srm_ap', active: true }).select('user history createdAt').lean();
  const syncedUserIds = new Set(bindings.filter(b => (b.history || []).some(h => h.note === 'directory_sync')).map(b => String(b.user)));
  console.log(`Active SRM AP links (all unverified): ${bindings.length}`);
  console.log(`  of which created by the directory sync: ${syncedUserIds.size}`);

  // Accounts that exist only because of the directory sync and were never used.
  const srmUsers = await User.find({ provider: 'srm_ap' }).select('_id').lean();
  const unused = [];
  const usedSrmOnly = [];
  for (const u of srmUsers) {
    const id = u._id;
    const [results, sessions] = await Promise.all([Result.countDocuments({ user: id }), Session.countDocuments({ user: id })]);
    if (syncedUserIds.has(String(id)) && results === 0 && sessions === 0) unused.push(id);
    else usedSrmOnly.push({ id: String(id), results, sessions });
  }
  console.log(`Accounts with provider "srm_ap": ${srmUsers.length}`);
  console.log(`  never used, created by the directory sync (will be deleted): ${unused.length}`);
  console.log(`  used (kept; these students lose SRM AP sign-in until verification exists): ${usedSrmOnly.length}`);
  for (const u of usedSrmOnly) console.log(`    user ${u.id}: ${u.results} results, ${u.sessions} sessions`);

  // Raw collections: these fields are no longer in the schemas, and strict queries would drop them from the filter.
  const legacyUserDocs = await User.collection.countDocuments({ $or: LEGACY_USER_FIELDS.map(f => ({ [f]: { $exists: true } })) });
  const legacyBindingDocs = await IdentityBinding.collection.countDocuments({ $or: [{ registerNumber: { $exists: true } }, { gender: { $exists: true } }] });
  const pending = await PendingSignup.countDocuments({});
  console.log(`User documents holding copied SRM AP details: ${legacyUserDocs}`);
  console.log(`Link records holding full register numbers or gender: ${legacyBindingDocs}`);
  console.log(`Pending SRM AP sign-ups: ${pending}`);
  const photoAvatars = await User.countDocuments(photoAvatar);
  console.log(`Avatars copied from SRM AP photos: ${photoAvatars}`);

  if (!APPLY) { console.log('\nNothing changed. Re-run with --apply to clean up.'); return; }

  const now = new Date();
  const ended = await IdentityBinding.updateMany(
    { provider: 'srm_ap', active: true },
    { $set: { active: false, identityVerified: false, unboundAt: now, unboundReason: REASON }, $push: { history: { type: 'unbound', at: now, note: REASON } } }
  );
  const unbadged = await User.updateMany({ 'connectedAccounts.srm_ap': { $exists: true } }, { $unset: { 'connectedAccounts.srm_ap': 1 } });
  let deleted = 0;
  if (unused.length) {
    await Promise.all([
      Friendship.deleteMany({ $or: [{ requester: { $in: unused } }, { recipient: { $in: unused } }] }),
      DailyActivity.deleteMany({ user: { $in: unused } }),
      IdentityBinding.deleteMany({ user: { $in: unused } })
    ]);
    deleted = (await User.deleteMany({ _id: { $in: unused }, provider: 'srm_ap' })).deletedCount;
  }
  const scrubbedBindings = await IdentityBinding.collection.updateMany({}, { $unset: { registerNumber: '', gender: '' } });
  const removedPending = await PendingSignup.deleteMany({});
  const clearedAvatars = await User.updateMany(photoAvatar, { $set: { avatar: '' } });

  console.log('\nDone.');
  console.log(`  links ended: ${ended.modifiedCount}`);
  console.log(`  badges removed: ${unbadged.modifiedCount}`);
  console.log(`  unused synced accounts deleted: ${deleted}`);
  console.log(`  link records scrubbed: ${scrubbedBindings.modifiedCount}`);
  console.log(`  pending sign-ups removed: ${removedPending.deletedCount}`);
  console.log(`  copied SRM AP photo avatars cleared: ${clearedAvatars.modifiedCount}`);
}

main()
  .catch(err => { console.error('Cleanup failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
