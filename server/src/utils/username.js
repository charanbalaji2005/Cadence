import { User } from '../models/User.js';

/**
 * Validates a Cadence username against strict specifications:
 * - 3-20 characters
 * - lowercase letters, numbers, and underscores allowed
 * - must start with a letter (^[a-z])
 * - cannot end with an underscore
 * - cannot contain consecutive underscores (__)
 */
export function validateUsername(raw) {
  if (typeof raw !== 'string') return { valid: false, error: 'Username must be a string.' };
  const u = raw.trim().toLowerCase();

  if (u.length < 3 || u.length > 20) {
    return { valid: false, error: 'Username must be 3 to 20 characters.' };
  }
  if (!/^[a-z]/.test(u)) {
    return { valid: false, error: 'Username must start with a letter.' };
  }
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(u)) {
    return { valid: false, error: 'Use only lowercase letters, numbers, and underscores.' };
  }
  if (u.endsWith('_')) {
    return { valid: false, error: 'Username cannot end with an underscore.' };
  }
  if (u.includes('__')) {
    return { valid: false, error: 'Username cannot contain consecutive underscores.' };
  }

  return { valid: true, normalized: u };
}

/**
 * Normalizes input text (display name, email local part, or GitHub login)
 * into a valid base candidate for username suggestion.
 */
export function normalizeBaseUsername(input) {
  if (!input) return 'typist';
  let clean = String(input)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[^a-z]+/, '') // ensure starts with letter
    .replace(/_$/, '')       // ensure does not end with _
    .slice(0, 18);

  if (clean.length < 3) clean = 'typist';
  return clean;
}

/**
 * Generates an available suggested username.
 */
export async function generateAvailableUsername(base) {
  const candidateBase = normalizeBaseUsername(base);
  if (!(await User.exists({ $or: [{ usernameLower: candidateBase }, { usernameNormalized: candidateBase }] }))) {
    return candidateBase;
  }

  // Try appending a random 2-4 digit number
  for (let i = 0; i < 20; i++) {
    const suffix = Math.floor(10 + Math.random() * 899);
    const candidate = `${candidateBase.slice(0, 20 - String(suffix).length)}${suffix}`;
    if (!(await User.exists({ $or: [{ usernameLower: candidate }, { usernameNormalized: candidate }] }))) {
      return candidate;
    }
  }

  return `typist${Date.now().toString(36).slice(-4)}`;
}

/**
 * Accounts created before usernameNormalized existed don't have it, which would hide
 * them from friend search. Fills it in once at startup; a clash just skips that account.
 */
export async function backfillUsernameNormalized() {
  const missing = await User.find({ usernameNormalized: { $exists: false } }).select('usernameLower').limit(5000).lean();
  for (const u of missing) {
    try { await User.updateOne({ _id: u._id, usernameNormalized: { $exists: false } }, { $set: { usernameNormalized: u.usernameLower } }); }
    catch { /* another account already holds this name */ }
  }
  return missing.length;
}
