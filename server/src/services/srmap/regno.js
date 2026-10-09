import { config } from '../../config.js';

/**
 * The format and year mapping come from config, so a change in the institution's numbering
 * is a config change. Nothing here proves identity; it only rejects input that can't be valid.
 */

/** "2017-2026" or "2023,2024,2025" -> Set of years. Malformed parts are ignored. */
export function parseBatchYears(spec) {
  const years = new Set();
  for (const part of String(spec || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const range = /^(\d{4})\s*-\s*(\d{4})$/.exec(part);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      for (let y = Math.min(a, b); y <= Math.max(a, b) && y - Math.min(a, b) < 100; y++) years.add(y);
    } else if (/^\d{4}$/.test(part)) years.add(Number(part));
  }
  return years;
}

function compile(pattern) {
  try { return new RegExp(pattern); } catch { return /^AP(\d{2})\d{9}$/; }
}

/** Uppercase, no whitespace. Register numbers are case-insensitive as typed. */
export const normalizeRegisterNumber = raw => String(raw ?? '').replace(/\s+/g, '').toUpperCase();

export function parseRegisterNumber(raw, opts = config.srmap) {
  const value = normalizeRegisterNumber(raw);
  if (!value) return { ok: false, error: 'Enter your SRM AP register number or institutional email.' };
  const m = compile(opts.regnoPattern).exec(value);
  if (!m) return { ok: false, error: "That doesn't look like an SRM AP register number." };
  const yearCode = m[1] && /^\d{2}$/.test(m[1]) ? m[1] : null;
  return { ok: true, registerNumber: value, yearCode };
}

/**
 * The admission year for a register number, only when its year code maps to a configured batch.
 * AP24... becomes 2024 only if 2024 is a confirmed batch year; anything else stays unknown.
 */
export function batchFromRegisterNumber(registerNumber, opts = config.srmap) {
  const p = parseRegisterNumber(registerNumber, opts);
  if (!p.ok || !p.yearCode) return null;
  const year = 2000 + Number(p.yearCode);
  const years = parseBatchYears(opts?.batchYears);
  return years.has(year) ? year : null;
}

/** A batch reported by SRM AP itself: 2024, "2024", "2024-2028" or "24". */
export function normalizeProviderBatch(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const m = /^(\d{4})(?:\s*[-/]\s*\d{2,4})?$/.exec(s) || /^(\d{2})$/.exec(s);
  if (!m) return null;
  const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  return year >= 2000 && year <= 2100 ? year : null;
}

/**
 * The provider's batch wins; otherwise the register number's year code, but only for a confirmed batch year.
 * Nothing else (class names, year of study) is used to guess a batch: an unconfirmed batch stays unknown.
 */
export function resolveBatch({ providerBatch, registerNumber }, opts = config.srmap) {
  const fromProvider = normalizeProviderBatch(providerBatch);
  if (fromProvider) return { year: fromProvider, source: 'provider' };
  const fromNumber = registerNumber ? batchFromRegisterNumber(registerNumber, opts) : null;
  if (fromNumber) return { year: fromNumber, source: 'register_number' };
  return { year: null, source: null };
}

export function isInstitutionalEmail(email, opts = config.srmap) {
  const m = /^[^\s@]+@([^\s@]+)$/.exec(String(email || '').trim().toLowerCase());
  return !!m && opts.emailDomains.includes(m[1]);
}

/** Classifies what the student typed. Returns { ok, kind: 'register_number' | 'email', value, ... } or { ok: false, error }. */
export function parseIdentifier(raw, opts = config.srmap) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Enter your SRM AP register number or institutional email.' };
  if (s.length > 254) return { ok: false, error: 'That identifier is too long.' };
  if (s.includes('@')) {
    const email = s.toLowerCase();
    if (!isInstitutionalEmail(email, opts)) {
      return { ok: false, error: `Use your institutional email (${opts.emailDomains.map(d => `@${d}`).join(' or ')}).` };
    }
    return { ok: true, kind: 'email', value: email, email };
  }
  const p = parseRegisterNumber(s, opts);
  if (!p.ok) return p;
  return { ok: true, kind: 'register_number', value: p.registerNumber, registerNumber: p.registerNumber, yearCode: p.yearCode };
}

/** "AP24110010895" -> "Apxxxxxxxxxxx": matches user format request. */
export function maskRegisterNumber(v) {
  const s = normalizeRegisterNumber(v);
  if (!s) return '';
  return 'Apxxxxxxxxxxx';
}
