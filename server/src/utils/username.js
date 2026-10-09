import crypto from 'node:crypto';
import { User } from '../models/User.js';

/** Names that would impersonate staff, the app or a system route. */
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'staff', 'moderator', 'mod', 'owner',
  'cadence', 'typeflow', 'official', 'security', 'api', 'login', 'logout', 'register', 'signup', 'settings',
  'account', 'profile', 'null', 'undefined', 'anonymous', 'guest', 'srmap', 'srm_ap', 'srmapofficial', 'connectsrmap'
]);

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
  if (RESERVED_USERNAMES.has(u)) {
    return { valid: false, error: 'That username is reserved. Pick another one.' };
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

/** Lowercase ASCII words from a display name: "Neelampalli Charan Balaji" -> ['neelampalli', 'charan', 'balaji']. */
export function nameParts(name) {
  return String(name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 2).slice(0, 4);
}

/**
 * Username ideas from a verified display name. Uses the name and, at most, a two-digit batch year;
 * never a register number, email or other identifier. `round` > 0 mixes in fresh random variants.
 */
export function usernameCandidates(displayName, { batchYear, round = 0 } = {}) {
  const parts = nameParts(displayName);
  const yy = batchYear ? String(batchYear).slice(-2) : '';
  const list = [];
  const add = v => { const r = validateUsername(String(v).slice(0, 20).replace(/_+$/, '')); if (r.valid && !list.includes(r.normalized)) list.push(r.normalized); };
  if (parts.length) {
    // Indian names often put the family name first, so both the first two words and the last two are tried.
    const [a, b] = parts;
    const last = parts[parts.length - 1];
    const given = parts.length > 2 ? parts[1] : a;
    if (b) { add(`${given}${last}`); add(`${given}_${last}`); add(`${a}${b}`); }
    if (yy) add(`${given}${last !== given ? last : ''}${yy}`);
    add(`${given}_types`); add(`${given}keys`); add(`${given}_cadence`); add(`${given}plays`);
    if (b) add(`${given[0]}${last}`);
  }
  const base = parts.length ? (parts.length > 2 ? parts[1] : parts[0]) : 'typist';
  const extra = round > 0 ? 4 : 2;
  for (let i = 0; i < extra; i++) add(`${base.slice(0, 15)}${crypto.randomInt(10, 9999)}`);
  if (round > 0) {
    // Rotate so regenerating shows different ideas first.
    const shift = (round * 3) % Math.max(1, list.length);
    return [...list.slice(shift), ...list.slice(0, shift)];
  }
  return list;
}

/** 3 to 5 available usernames for a display name. One database query per batch of ideas. */
export async function suggestUsernames(displayName, opts = {}) {
  const free = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 3 && free.length < 3; attempt++) {
    const round = attempt === 0 ? (opts.round || 0) : (opts.round || 0) + attempt;
    const batch = usernameCandidates(displayName, { ...opts, round }).filter(c => !seen.has(c));
    batch.forEach(c => seen.add(c));
    if (!batch.length) continue;
    const rows = await User.find({ $or: [{ usernameNormalized: { $in: batch } }, { usernameLower: { $in: batch } }] }).select('usernameNormalized usernameLower').lean();
    const taken = new Set(rows.flatMap(u => [u.usernameNormalized, u.usernameLower]));
    free.push(...batch.filter(c => !taken.has(c)));
  }
  return free.slice(0, 5);
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
