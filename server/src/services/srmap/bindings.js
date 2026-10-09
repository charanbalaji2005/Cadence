import { IdentityBinding } from '../../models/IdentityBinding.js';
import { User } from '../../models/User.js';
import { hashIdentifier } from '../../utils/privacy.js';
import { track } from '../events.js';
import { fetchStudentRecord } from './provider.js';
import { sanitizeStudentPhoto } from './profile.js';

const PROVIDER = 'srm_ap';
const HISTORY_CAP = 25;
// A synced profile is refreshed from the directory at most once a day, on a verified sign-in.
const SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The only code that creates or removes SRM AP links, and the only writer of
 * User.connectedAccounts.srm_ap (which drives branding). Both are changed together.
 * Callers pass profiles that came from a verified SRM AP response, never from directory data.
 */

/** Verified profile -> the fields a binding stores. The full register number is reduced to a mask and a hash. */
export function storedFields(profile) {
  const gender = profile.gender || '';
  const photo = sanitizeStudentPhoto(profile.profilePhoto || '', gender);
  return {
    externalStudentId: profile.externalStudentId,
    registerNumberMasked: profile.registerNumberMasked || '',
    registerNumberHash: profile.registerNumber ? hashIdentifier(profile.registerNumber) : (profile.registerNumberHash || ''),
    verifiedEmail: profile.email || profile.verifiedEmail || '',
    displayName: profile.displayName || '',
    batchYear: profile.batchYear ?? undefined,
    batchSource: profile.batchSource || null,
    className: profile.className || '',
    section: profile.section || '',
    gender,
    profilePhoto: photo
  };
}

/** Bindings are found by SRM AP's stable student ID only, never by email or name. */
export const findActiveByIdentity = externalStudentId => (externalStudentId ? IdentityBinding.findOne({ provider: PROVIDER, active: true, externalStudentId }) : null);
export const findActiveForUser = userId => IdentityBinding.findOne({ provider: PROVIDER, user: userId, active: true });

/** The branding flag on the account: verified + batch only. Profile details stay on the binding. */
async function mirror(userId, binding, { session } = {}) {
  const update = binding
    ? { $set: { 'connectedAccounts.srm_ap': { verified: true, batchYear: binding.batchYear ?? null, boundAt: binding.boundAt } } }
    : { $unset: { 'connectedAccounts.srm_ap': 1 } };
  if (binding?.profilePhoto) {
    update.$set.avatar = binding.profilePhoto;
  }
  await User.updateOne({ _id: userId }, update, { session });
}

/**
 * Links a verified identity to an account. Unique indexes make concurrent attempts safe:
 * a second link for the same identity or account fails with code 11000.
 * Pass `session` to run inside the caller's transaction.
 */
export async function createBinding(user, profile, { by, session, consentAt = new Date() } = {}) {
  const now = new Date();
  const [binding] = await IdentityBinding.create([{
    user: user._id, provider: PROVIDER, ...storedFields(profile),
    identityVerified: true, active: true, consentAt, boundAt: now, lastAuthenticatedAt: now,
    profileSync: { status: 'pending', attempts: 0 },
    history: [{ type: 'bound', at: now, by: by?._id || user._id }]
  }], { session });
  await mirror(user._id, binding, { session });
  user.connectedAccounts = { ...(user.connectedAccounts || {}), srm_ap: { verified: true, batchYear: binding.batchYear ?? null, boundAt: binding.boundAt } };
  if (!session) track('ACCOUNT_LINKED', { user, metadata: { provider: PROVIDER } });
  return binding;
}

/**
 * After a verified sign-in: refresh what the verification returned and the last-authenticated time.
 * Empty values never overwrite stored ones, so details synced from the directory survive a sparse answer.
 */
export async function touchBinding(binding, profile) {
  const fields = storedFields(profile);
  delete fields.externalStudentId;
  const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  const changed = Object.entries(set).some(([k, v]) => (binding[k] ?? '') !== v);
  const now = new Date();
  const updated = await IdentityBinding.findOneAndUpdate(
    { _id: binding._id, active: true },
    { $set: { ...set, lastAuthenticatedAt: now }, $push: { history: { $each: [{ type: changed ? 'refreshed' : 'login', at: now }], $slice: -HISTORY_CAP } } },
    { new: true }
  );
  if (updated) await mirror(updated.user, updated);
  return updated || binding;
}

/** Does this binding's directory profile need fetching (never fetched, failed, or older than a day)? */
export const needsProfileSync = b => !!b && (b.profileSync?.status !== 'synced' || !b.profileSync?.syncedAt || Date.now() - new Date(b.profileSync.syncedAt).getTime() > SYNC_MAX_AGE_MS);

/**
 * Fetches this student's own record from the directory (get_student) and saves the approved attributes
 * on the binding: name, class, section, gender and photo. Never creates accounts or bindings, and is safe
 * to retry: a failure only records the status, so the next sign-in (or a manual retry) tries again.
 * `registerNumber` is the verified full number when the caller has it (it isn't stored); otherwise the
 * verified email is used. Returns { ok, code, binding }.
 */
export async function syncProfile(binding, { registerNumber = null, by = null } = {}) {
  let r;
  try { r = await fetchStudentRecord({ registerNumber, email: binding.verifiedEmail || null }); }
  catch (err) { console.error('SRM AP profile sync failed:', err?.name || 'error'); r = { ok: false, code: 'unavailable' }; }
  const now = new Date();
  const $set = { 'profileSync.attemptedAt': now };
  let entry;
  if (r.ok) {
    const a = r.attributes;
    const gender = a.gender || binding.gender || '';
    const photo = sanitizeStudentPhoto(a.profilePhoto || binding.profilePhoto, gender);
    Object.assign($set, {
      'profileSync.status': 'synced', 'profileSync.syncedAt': now, 'profileSync.lastError': '',
      className: a.className, section: a.section, gender, profilePhoto: photo
    });
    if (a.displayName) $set.displayName = a.displayName;
    if (!binding.verifiedEmail && a.email) $set.verifiedEmail = a.email;
    entry = { type: 'synced', at: now, by: by?._id };
  } else {
    Object.assign($set, { 'profileSync.status': r.code === 'not_found' ? 'not_found' : 'failed', 'profileSync.lastError': r.code });
    entry = { type: 'sync_failed', at: now, by: by?._id, note: r.code };
  }
  // Only an active binding is updated: an identity unbound meanwhile stays unbound.
  const updated = await IdentityBinding.findOneAndUpdate(
    { _id: binding._id, active: true },
    { $set, $inc: { 'profileSync.attempts': 1 }, $push: { history: { $each: [entry], $slice: -HISTORY_CAP } } },
    { new: true }
  );
  if (updated && r.ok) await mirror(updated.user, updated);
  return { ok: !!r.ok && !!updated, code: r.ok ? (updated ? 'synced' : 'unbound') : r.code, binding: updated || binding };
}

/** Never throws: sign-in and sign-up succeed even when the directory is down; the status says to retry. */
export const trySyncProfile = (binding, opts) => syncProfile(binding, opts).catch(err => {
  console.error('SRM AP profile sync failed:', err?.name || 'error');
  return { ok: false, code: 'failed', binding };
});

/** Ends a link. The record stays (inactive) so admins can see who was linked and when. */
export async function unbind(binding, { by, reason = '' } = {}) {
  binding.active = false;
  binding.unboundAt = new Date();
  binding.unboundBy = by?._id;
  binding.unboundReason = String(reason).slice(0, 300);
  binding.history.push({ type: 'unbound', at: binding.unboundAt, by: by?._id, note: binding.unboundReason });
  if (binding.history.length > HISTORY_CAP) binding.history.splice(0, binding.history.length - HISTORY_CAP);
  await binding.save();
  await mirror(binding.user, null);
  // Earlier builds copied the institutional photo into the avatar; it goes with the link. A photo the student chose stays.
  if (binding.profilePhoto) await User.updateOne({ _id: binding.user, avatar: binding.profilePhoto }, { $set: { avatar: '' } });
  track('ACCOUNT_UNLINKED', { user: binding.user, actor: by, metadata: { provider: PROVIDER, byAdmin: !!by && String(by._id) !== String(binding.user) } });
  return binding;
}

/** Can this account still sign in without SRM AP? Unlinking the only sign-in method would lock the student out. */
export async function hasOtherSignIn(userId) {
  const u = await User.findById(userId).select('+passwordHash googleId githubId').lean();
  return !!(u && ((u.passwordHash && u.passwordHash !== '!') || u.googleId || u.githubId));
}

/** Profile sync state for the student and admins. Error codes only; never a provider response. */
export const syncSummary = b => ({
  status: b?.profileSync?.status || 'pending',
  syncedAt: b?.profileSync?.syncedAt || null,
  attemptedAt: b?.profileSync?.attemptedAt || null,
  attempts: b?.profileSync?.attempts || 0,
  lastError: b?.profileSync?.lastError || ''
});

/** What the account page shows the student about their own link. The register number stays masked. */
export function bindingSummary(b) {
  if (!b) return { connected: false };
  return {
    connected: true,
    displayName: b.displayName,
    registerNumberMasked: b.registerNumberMasked || '',
    email: b.verifiedEmail || '',
    className: b.className || '',
    section: b.section || '',
    gender: b.gender || '',
    profilePhoto: sanitizeStudentPhoto(b.profilePhoto || '', b.gender),
    batchYear: b.batchYear ?? null,
    batchSource: b.batchSource,
    boundAt: b.boundAt,
    lastAuthenticatedAt: b.lastAuthenticatedAt,
    profileSync: syncSummary(b)
  };
}
