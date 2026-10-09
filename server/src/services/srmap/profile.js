import { z } from 'zod';
import { normalizeRegisterNumber, parseRegisterNumber, resolveBatch, maskRegisterNumber } from './regno.js';
import { config } from '../../config.js';

/**
 * Turns a raw SRM AP response into the few fields Cadence keeps. Anything not on the allow-list
 * (passwords, hashes, tokens, phone numbers, addresses...) is dropped before validation, so it
 * never reaches the database, logs or the browser.
 */

const SENSITIVE_KEY = /pass|pwd|secret|token|hash|otp|pin\b|salt|cookie|session|api[_-]?key|phone|mobile|address|dob|birth|aadhaar|aadhar/i;

/** Deep copy without sensitive keys. Used before anything else touches the response. */
export function stripSensitive(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => stripSensitive(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) if (!SENSITIVE_KEY.test(k)) out[k] = stripSensitive(v, depth + 1);
  return out;
}

const text = max => z.union([z.string(), z.number()]).transform(v => String(v).trim()).pipe(z.string().max(max)).optional().nullable();

const studentSchema = z.object({
  student_id: z.union([z.string(), z.number()]).transform(v => String(v).trim()).pipe(z.string().min(1, 'missing student_id').max(128)),
  register_number: text(32),
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable(),
  batch: z.union([z.string(), z.number()]).optional().nullable(),
  class: text(60),
  section: text(20),
  photo: z.string().trim().url().max(500).optional().nullable()
});

/** The documented verification response: { status: true, verified: true, student: {...} }. */
const verifyResponseSchema = z.object({
  status: z.literal(true),
  verified: z.literal(true),
  student: studentSchema
});

/**
 * Validates a verification response. Returns { ok: true, profile } or { ok: false, reason }.
 * The profile holds only allow-listed, normalised fields.
 */
export function parseVerifyResponse(raw, opts = config.srmap) {
  const r = verifyResponseSchema.safeParse(stripSensitive(raw));
  if (!r.success) return { ok: false, reason: 'schema' };
  const s = r.data.student;

  let registerNumber = null;
  if (s.register_number) {
    const p = parseRegisterNumber(s.register_number, opts);
    if (!p.ok) return { ok: false, reason: 'register_number_format' };
    registerNumber = p.registerNumber;
  }
  const batch = resolveBatch({ providerBatch: s.batch, registerNumber }, opts);
  return {
    ok: true,
    profile: {
      externalStudentId: s.student_id,
      registerNumber,
      registerNumberMasked: registerNumber ? maskRegisterNumber(registerNumber) : '',
      email: s.email || null,
      displayName: (s.name || '').replace(/\s+/g, ' ').slice(0, 120),
      batchYear: batch.year,
      batchSource: batch.source,
      className: s.class || '',
      section: s.section || '',
      // Only https photos; anything else is dropped rather than rewritten.
      profilePhoto: s.photo && /^https:\/\//i.test(s.photo) ? s.photo : ''
    }
  };
}

/**
 * The directory API's get_student answer: { status: true, student: { name, email, class, section, gender, profile_photo, password } }.
 * Used only after SRM AP has verified the student, to fill in their profile. `password` (a hash) is
 * stripped first like every other sensitive key. Returns { ok: true, attributes } or { ok: false, reason }.
 */
const directoryStudentSchema = z.object({
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable(),
  class: text(60),
  section: text(20),
  gender: text(20),
  profile_photo: z.string().trim().max(500).optional().nullable()
});
const directoryResponseSchema = z.object({ status: z.literal(true), student: directoryStudentSchema });

export const SRM_DEFAULT_FEMALE_AVATAR = 'https://oursrmap.purlyedit.in/def_female_profile.jpeg';
export const SRM_DEFAULT_MALE_AVATAR = 'https://oursrmap.purlyedit.in/def_male_profile.jpeg';

export function isFemaleGender(gender) {
  return /^(female|f|girl|woman)$/i.test(String(gender || '').trim());
}

export function getDefaultAvatar(gender) {
  return isFemaleGender(gender) ? SRM_DEFAULT_FEMALE_AVATAR : SRM_DEFAULT_MALE_AVATAR;
}

export function sanitizeStudentPhoto(rawPhoto, gender) {
  let photo = String(rawPhoto || '').trim();
  if (photo) {
    photo = photo.replace(/uploads\/profile_photos\/(uploads\/profile_photos\/)+/g, 'uploads/profile_photos/');
    photo = photo.replace(/uploads\/profile_photos\/profiles\//g, 'profiles/');
    if (photo.startsWith('http://oursrmap.purlyedit.in/')) {
      photo = 'https://oursrmap.purlyedit.in/' + photo.slice('http://oursrmap.purlyedit.in/'.length);
    }
  }
  if (!photo || photo === '0' || photo === 'null' || photo === 'undefined' || photo.includes('default.') || photo.includes('avatar.png') || photo.endsWith('/uploads/profile_photos/')) {
    return getDefaultAvatar(gender);
  }
  return photo;
}

/** https photos are kept. An http photo is upgraded only on the directory's own host, which serves https. */
function photoUrl(raw, directoryUrl) {
  if (!raw) return '';
  try {
    let cleaned = String(raw).trim()
      .replace(/uploads\/profile_photos\/(uploads\/profile_photos\/)+/g, 'uploads/profile_photos/')
      .replace(/uploads\/profile_photos\/profiles\//g, 'profiles/');
    const u = new URL(cleaned);
    if (u.protocol === 'https:') return u.toString();
    if (u.protocol === 'http:' && directoryUrl && u.host === new URL(directoryUrl).host) { u.protocol = 'https:'; return u.toString(); }
  } catch { /* not a URL */ }
  return '';
}

export function parseDirectoryRecord(raw, { directoryUrl } = {}) {
  const r = directoryResponseSchema.safeParse(stripSensitive(raw));
  if (!r.success) return { ok: false, reason: 'schema' };
  const s = r.data.student;
  return {
    ok: true,
    attributes: {
      email: s.email || null,
      displayName: (s.name || '').replace(/\s+/g, ' ').slice(0, 120),
      className: s.class || '',
      section: s.section || '',
      gender: s.gender || '',
      profilePhoto: photoUrl(s.profile_photo, directoryUrl)
    }
  };
}

/** Does the verified record belong to what the student typed? A provider that answers for someone else is refused. */
export function matchesIdentifier(profile, id) {
  if (id.kind === 'register_number') return !!profile.registerNumber && profile.registerNumber === normalizeRegisterNumber(id.registerNumber);
  if (id.kind === 'email') return !!profile.email && profile.email === id.email;
  return false;
}
