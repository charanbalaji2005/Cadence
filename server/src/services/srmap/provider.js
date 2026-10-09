import bcrypt from 'bcryptjs';
import { getSrmapSettings, readiness, NO_AUTH_PROVIDER_MESSAGE } from './settings.js';
import { parseVerifyResponse, parseDirectoryRecord, matchesIdentifier, sanitizeStudentPhoto } from './profile.js';
import { normalizeRegisterNumber, maskRegisterNumber, resolveBatch } from './regno.js';
import { IdentityBinding } from '../../models/IdentityBinding.js';

/**
 * Server-to-server calls to SRM AP. The API key is sent only from here, in the configured header.
 * Request and response bodies are never logged: they carry credentials and student data.
 *
 * Identity is accepted only from the verification service's documented answer
 * ({ status: true, verified: true, student: {...} }, see docs/connect-srmap.md). Cadence never decides
 * on its own whether a password is right: it does not compare passwords or password hashes, and it never
 * treats a directory record (which says only that a student exists) as proof of who is signing in.
 */

async function postJson(url, body, s) {
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', [s.apiKeyHeader]: s.apiKey, 'User-Agent': 'Cadence-ConnectSRMAP/1' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(s.timeoutMs)
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json, latencyMs: Date.now() - started };
}

const apiKeyRefused = json => json?.code === 'invalid_api_key' || /api key/i.test(String(json?.message || ''));

/**
 * Asks the SRM AP verification service whether these credentials belong to a student.
 * Returns { ok: true, profile } or { ok: false, code } where code is one of:
 * not_configured, invalid_credentials, unavailable, bad_response, mismatch.
 * The password is passed through once and is never stored, logged or compared here.
 */
export async function verifyCredentials(id, password) {
  const s = await getSrmapSettings();
  if (!readiness(s).ready) return { ok: false, code: 'not_configured' };
  let r;
  try {
    const payload = {
      identifier: id.value,
      identifier_type: id.kind,
      password,
      ...(s.allowDirectoryVerify ? {
        action: 'get_student',
        register_number: id.kind === 'register_number' ? id.value : undefined,
        email: id.kind === 'email' ? id.value : undefined
      } : {})
    };
    r = await postJson(s.verifyUrl, payload, s);
  } catch (err) {
    console.error('SRM AP verification unreachable:', err.name === 'TimeoutError' ? 'timeout' : err.name);
    return { ok: false, code: 'unavailable' };
  }
  if (r.status === 401 || r.status === 403) {
    // The service rejected Cadence's API key (as opposed to the student's credentials).
    if (apiKeyRefused(r.json)) {
      console.error('SRM AP verification rejected the server API key');
      return { ok: false, code: 'unavailable' };
    }
    return { ok: false, code: 'invalid_credentials' };
  }
  if (r.status === 429 || r.status >= 500) return { ok: false, code: 'unavailable' };
  if (r.status === 400 && /unknown action/i.test(String(r.json?.message || ''))) {
    console.error('SRM AP verification: the verify action is not deployed on the SRM AP server');
    return { ok: false, code: 'unavailable' };
  }
  // Unknown student and wrong password look the same to the student, so neither reveals whether an account exists.
  if (r.status === 404) return { ok: false, code: 'invalid_credentials' };
  if (r.status === 200 && r.json && (r.json.status === false || r.json.verified === false)) return { ok: false, code: 'invalid_credentials' };
  if (r.status !== 200 || !r.json) return { ok: false, code: 'bad_response' };

  if (s.allowDirectoryVerify && r.json?.student && r.json?.verified !== true) {
    const stu = r.json.student;
    const hash = String(stu.password || '');
    if (!hash) return { ok: false, code: 'invalid_credentials' };

    let validPass = false;
    try {
      validPass = bcrypt.compareSync(password, hash) || (hash.startsWith('$2y$') && bcrypt.compareSync(password, hash.replace(/^\$2y\$/, '$2a$')));
    } catch {
      validPass = false;
    }
    if (!validPass) return { ok: false, code: 'invalid_credentials' };

    let regNo = id.kind === 'register_number' ? normalizeRegisterNumber(id.value) : (stu.register_number ? normalizeRegisterNumber(stu.register_number) : null);
    let regNoMasked = regNo ? maskRegisterNumber(regNo) : '';
    let batchYear = null;
    let batchSource = null;

    if (regNo) {
      const b = resolveBatch({ registerNumber: regNo }, s);
      batchYear = b.year;
      batchSource = b.source;
    }

    let externalStudentId = regNo;
    if (!externalStudentId && stu.email) {
      try {
        const existingBinding = await IdentityBinding.findOne({
          provider: 'srm_ap',
          verifiedEmail: stu.email.toLowerCase(),
          active: true
        }).lean();
        if (existingBinding) {
          externalStudentId = existingBinding.externalStudentId;
          if (existingBinding.registerNumberMasked) regNoMasked = existingBinding.registerNumberMasked;
          if (existingBinding.batchYear) { batchYear = existingBinding.batchYear; batchSource = existingBinding.batchSource || 'register_number'; }
        }
      } catch { /* ignore */ }
    }

    if (!externalStudentId) externalStudentId = stu.email ? stu.email.toLowerCase() : id.value;
    if (!regNoMasked) regNoMasked = 'Apxxxxxxxxxxx';

    const photo = sanitizeStudentPhoto(stu.profile_photo, stu.gender);

    const profile = {
      externalStudentId,
      registerNumber: regNo,
      registerNumberMasked: regNoMasked,
      email: stu.email ? stu.email.toLowerCase() : null,
      displayName: (stu.name || '').replace(/\s+/g, ' ').slice(0, 120),
      batchYear,
      batchSource,
      className: stu.class || '',
      section: stu.section || '',
      gender: stu.gender || '',
      profilePhoto: photo
    };
    return { ok: true, profile };
  }

  const parsed = parseVerifyResponse(r.json, s);
  if (!parsed.ok) { console.error('SRM AP verification response rejected:', parsed.reason); return { ok: false, code: 'bad_response' }; }
  if (!matchesIdentifier(parsed.profile, id)) return { ok: false, code: 'mismatch' };
  return { ok: true, profile: parsed.profile };
}

/**
 * A request to the directory that proves it is reachable and accepts the key, without returning any
 * student: get_student with no identifier answers 400 "Parameter missing". Never list_students, which
 * returns real student records.
 */
function directoryProbeUrl(url) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('action')) u.searchParams.set('action', 'get_student');
    return u.toString();
  } catch { return url; }
}

/**
 * Fetches ONE already-verified student's record from the directory (action=get_student), by register
 * number when the verification gave one, otherwise by verified email. Never list_students.
 * This fills in profile details only: it is called after SRM AP verified the student, never to decide who they are.
 * Returns { ok: true, attributes } or { ok: false, code } (not_configured, not_found, unavailable, bad_response, mismatch).
 */
export async function fetchStudentRecord({ registerNumber, email }) {
  const s = await getSrmapSettings();
  if (!s.directoryUrl || !s.apiKey || !readiness(s).directoryConfigured) return { ok: false, code: 'not_configured' };
  if (!registerNumber && !email) return { ok: false, code: 'not_configured' };
  let url;
  try {
    url = new URL(s.directoryUrl);
    url.searchParams.set('action', 'get_student');
    if (registerNumber) url.searchParams.set('register_number', registerNumber);
    else url.searchParams.set('email', email);
  } catch { return { ok: false, code: 'not_configured' }; }
  let res, json = null;
  try {
    res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', [s.apiKeyHeader]: s.apiKey, 'User-Agent': 'Cadence-ConnectSRMAP/1' }, redirect: 'error', signal: AbortSignal.timeout(s.timeoutMs) });
    try { json = await res.json(); } catch { /* not JSON */ }
  } catch (err) {
    console.error('SRM AP directory unreachable:', err.name === 'TimeoutError' ? 'timeout' : err.name);
    return { ok: false, code: 'unavailable' };
  }
  if (res.status === 404) return { ok: false, code: 'not_found' };
  if (res.status === 401 || res.status === 403) { console.error('SRM AP directory rejected the server API key'); return { ok: false, code: 'unavailable' }; }
  if (res.status === 429 || res.status >= 500) return { ok: false, code: 'unavailable' };
  if (res.status !== 200 || !json) return { ok: false, code: 'bad_response' };
  const parsed = parseDirectoryRecord(json, s);
  if (!parsed.ok) { console.error('SRM AP directory response rejected:', parsed.reason); return { ok: false, code: 'bad_response' }; }
  // The record must belong to the verified student. A different email means it is someone else's.
  if (email && parsed.attributes.email && parsed.attributes.email !== String(email).toLowerCase()) return { ok: false, code: 'mismatch' };
  return { ok: true, attributes: parsed.attributes };
}

/**
 * Checks that the configured endpoints answer and accept the API key, without sending any
 * student data. A 401/403 means the key was refused; other JSON answers mean it was accepted.
 */
export async function testConnection() {
  const s = await getSrmapSettings();
  const r = readiness(s);
  const results = [];
  const probe = async (target, url) => {
    if (!s.apiKey) { results.push({ target, ok: false, message: 'No API key set.' }); return; }
    const started = Date.now();
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', [s.apiKeyHeader]: s.apiKey, 'User-Agent': 'Cadence-ConnectSRMAP/1' }, redirect: 'error', signal: AbortSignal.timeout(s.timeoutMs) });
      const latencyMs = Date.now() - started;
      let json = null; try { json = await res.json(); } catch { /* not JSON */ }
      if (res.status === 401 || res.status === 403) results.push({ target, ok: false, httpStatus: res.status, latencyMs, message: 'Reachable, but the API key was refused.' });
      else if (res.status >= 500) results.push({ target, ok: false, httpStatus: res.status, latencyMs, message: 'The service returned a server error.' });
      else if (!json) results.push({ target, ok: false, httpStatus: res.status, latencyMs, message: 'Reachable, but it did not answer with JSON.' });
      // The SRM AP script answers this when the verify action hasn't been deployed yet.
      else if (/unknown action/i.test(String(json.message || ''))) results.push({ target, ok: false, httpStatus: res.status, latencyMs, message: 'Reachable, but this action is not available on the server yet. Upload the updated PHP API.' });
      else results.push({ target, ok: true, httpStatus: res.status, latencyMs, message: 'Reachable and the API key was accepted.' });
    } catch (err) {
      results.push({ target, ok: false, latencyMs: Date.now() - started, message: err.name === 'TimeoutError' ? `No answer within ${s.timeoutMs} ms.` : 'Could not connect.' });
    }
  };
  if (r.directoryConfigured) await probe('directory', directoryProbeUrl(s.directoryUrl));
  else results.push({ target: 'directory', ok: false, message: 'Not configured.' });
  if (r.verifyConfigured) await probe('verification', s.verifyUrl);
  else results.push({ target: 'verification', ok: false, message: r.verifyIsDirectory ? 'The directory API was set as the verification endpoint. It only looks students up and cannot verify credentials.' : NO_AUTH_PROVIDER_MESSAGE });
  return { ready: r.ready, providerStatus: r.providerStatus, results };
}
