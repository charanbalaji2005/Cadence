/**
 * Connect SRM AP: register numbers, batch detection, response sanitising, secrets and username ideas.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseIdentifier, parseRegisterNumber, batchFromRegisterNumber, resolveBatch, parseBatchYears, maskRegisterNumber, normalizeProviderBatch } from '../src/services/srmap/regno.js';
import { parseVerifyResponse, parseDirectoryRecord, stripSensitive, matchesIdentifier } from '../src/services/srmap/profile.js';
import { seal, open, canSeal, hint } from '../src/utils/secretBox.js';
import { readiness, isDirectoryEndpoint } from '../src/services/srmap/settings.js';
import { usernameCandidates, validateUsername } from '../src/utils/username.js';

const OPTS = { regnoPattern: '^AP(\\d{2})\\d{9}$', batchYears: '2017-2026', emailDomains: ['srmap.edu.in'] };

describe('register numbers', () => {
  test('normalises case and whitespace', () => {
    const p = parseRegisterNumber('  ap24 1100 10895 ', OPTS);
    assert.equal(p.ok, true);
    assert.equal(p.registerNumber, 'AP24110010895');
    assert.equal(p.yearCode, '24');
  });

  test('rejects malformed numbers instead of guessing', () => {
    for (const bad of ['AP2411001089', 'AP241100108955', 'AB24110010895', 'AP2411001089X', 'AP24', '24110010895']) {
      assert.equal(parseRegisterNumber(bad, OPTS).ok, false, bad);
    }
  });

  test('a prefix alone is not a valid number', () => {
    assert.equal(parseIdentifier('AP24', OPTS).ok, false);
  });

  test('batch comes from the year code only when that year is configured', () => {
    assert.equal(batchFromRegisterNumber('AP24110010895', OPTS), 2024);
    assert.equal(batchFromRegisterNumber('AP26110010895', OPTS), 2026);
    assert.equal(batchFromRegisterNumber('AP27110010895', OPTS), null);
    assert.equal(batchFromRegisterNumber('AP24110010895', { ...OPTS, batchYears: '2025,2026' }), null);
  });

  test('the provider batch wins over the register number', () => {
    assert.deepEqual(resolveBatch({ providerBatch: '2023', registerNumber: 'AP24110010895' }, OPTS), { year: 2023, source: 'provider' });
    assert.deepEqual(resolveBatch({ providerBatch: null, registerNumber: 'AP24110010895' }, OPTS), { year: 2024, source: 'register_number' });
    assert.deepEqual(resolveBatch({ providerBatch: 'garbage', registerNumber: 'AP27110010895' }, OPTS), { year: null, source: null });
    assert.equal(normalizeProviderBatch('2024-2028'), 2024);
    assert.equal(normalizeProviderBatch(24), 2024);
  });

  test('batch year specs', () => {
    assert.deepEqual([...parseBatchYears('2023-2025, 2019')].sort(), [2019, 2023, 2024, 2025]);
    assert.equal(parseBatchYears('nonsense').size, 0);
  });

  test('masking keeps the number unusable and formats as Apxxxxxxxxxxx', () => {
    assert.equal(maskRegisterNumber('Ap24110010895'), 'Apxxxxxxxxxxx');
    assert.equal(maskRegisterNumber('AP24110010895'), 'Apxxxxxxxxxxx');
  });
});

describe('identifiers', () => {
  test('institutional emails only', () => {
    assert.equal(parseIdentifier('Student_X@SRMAP.edu.in', OPTS).kind, 'email');
    assert.equal(parseIdentifier('Student_X@SRMAP.edu.in', OPTS).value, 'student_x@srmap.edu.in');
    assert.equal(parseIdentifier('someone@gmail.com', OPTS).ok, false);
    assert.equal(parseIdentifier('', OPTS).ok, false);
  });
});

describe('verification responses', () => {
  const good = {
    status: true, verified: true,
    student: { student_id: 'STU-1', register_number: 'ap24110010895', name: '  Charan   Balaji ', email: 'C@srmap.edu.in', password: 'plain', password_hash: '$2y$', api_key: 'k', phone: '999', photo: 'http://insecure.example/x.png' }
  };

  test('keeps only allow-listed fields and drops credentials', () => {
    const r = parseVerifyResponse(good, OPTS);
    assert.equal(r.ok, true);
    const json = JSON.stringify(r.profile);
    for (const leak of ['plain', '$2y$', '"k"', '999']) assert.ok(!json.includes(leak), `leaked ${leak}`);
    assert.equal(r.profile.externalStudentId, 'STU-1');
    assert.equal(r.profile.registerNumber, 'AP24110010895');
    assert.equal(r.profile.email, 'c@srmap.edu.in');
    assert.equal(r.profile.displayName, 'Charan Balaji');
    assert.equal(r.profile.batchYear, 2024);
    assert.equal(r.profile.batchSource, 'register_number');
    assert.equal(r.profile.profilePhoto, '', 'non-https photos are dropped');
  });

  test('strips nested sensitive keys', () => {
    assert.deepEqual(stripSensitive({ a: { Password: 1, ok: 2 }, list: [{ token: 1, b: 2 }] }), { a: { ok: 2 }, list: [{ b: 2 }] });
  });

  test('requires an explicit verified=true and a stable id', () => {
    assert.equal(parseVerifyResponse({ status: true, student: good.student }, OPTS).ok, false);
    assert.equal(parseVerifyResponse({ status: true, verified: true, student: { ...good.student, student_id: '' } }, OPTS).ok, false);
    assert.equal(parseVerifyResponse({ status: true, verified: 'yes', student: good.student }, OPTS).ok, false);
    assert.equal(parseVerifyResponse(null, OPTS).ok, false);
  });

  test('refuses a malformed register number from the provider', () => {
    assert.equal(parseVerifyResponse({ ...good, student: { ...good.student, register_number: 'XX1' } }, OPTS).ok, false);
  });

  test('the verified record must match what was typed', () => {
    const { profile } = parseVerifyResponse(good, OPTS);
    assert.equal(matchesIdentifier(profile, parseIdentifier('AP24110010895', OPTS)), true);
    assert.equal(matchesIdentifier(profile, parseIdentifier('AP24110010896', OPTS)), false);
    assert.equal(matchesIdentifier(profile, parseIdentifier('c@srmap.edu.in', OPTS)), true);
    assert.equal(matchesIdentifier(profile, parseIdentifier('d@srmap.edu.in', OPTS)), false);
  });
});

describe('secret box', () => {
  const KEY = 'unit-test-encryption-key';
  test('round trip, tamper and wrong key', () => {
    const sealed = seal('super-secret-api-key', KEY);
    assert.ok(!sealed.includes('super-secret'));
    assert.equal(open(sealed, KEY), 'super-secret-api-key');
    assert.equal(open(sealed, 'another-encryption-key'), '');
    const parts = sealed.split(':'); parts[3] = Buffer.from('tampered').toString('base64');
    assert.equal(open(parts.join(':'), KEY), '');
  });
  test('refuses to seal without a key', () => {
    assert.equal(canSeal(''), false);
    assert.throws(() => seal('x', ''));
  });
  test('hints never reveal short secrets', () => {
    assert.equal(hint('abc'), '••••');
    assert.equal(hint('0123456789abcdef'), '••••cdef');
  });
});

describe('username suggestions', () => {
  test('built from the name, valid, no register number or email', () => {
    const list = usernameCandidates('Neelampalli Charan Balaji', { batchYear: 2024 });
    assert.ok(list.includes('charanbalaji'));
    assert.ok(list.includes('charan_balaji'));
    assert.ok(list.includes('charanbalaji24'));
    for (const u of list) {
      assert.equal(validateUsername(u).valid, true, u);
      assert.ok(!/110010895|srmap|@/.test(u), u);
    }
  });
  test('works without a usable name', () => {
    const list = usernameCandidates('', {});
    assert.ok(list.length >= 2);
    assert.ok(list.every(u => validateUsername(u).valid));
  });
  test('reserved names are refused', () => {
    for (const u of ['admin', 'cadence', 'srmap', 'support']) assert.equal(validateUsername(u).valid, false, u);
  });
});

describe('batch is never guessed', () => {
  test('class names and year of study do not produce a batch', () => {
    assert.deepEqual(resolveBatch({ providerBatch: null, registerNumber: null, className: 'BTech-3-Year-(CSE)' }, OPTS), { year: null, source: null });
    assert.deepEqual(resolveBatch({ providerBatch: null, registerNumber: null, className: 'Alumni' }, OPTS), { year: null, source: null });
  });
});

describe('directory API is not an identity provider', () => {
  const DIR = 'https://oursrmap.purlyedit.in/api/typingmaster_connectsrmap_api.php';
  const base = { enabled: true, apiKey: 'k', directoryUrl: DIR };

  test('the directory script is recognised in any form', () => {
    assert.equal(isDirectoryEndpoint(DIR, ''), true);
    assert.equal(isDirectoryEndpoint(`${DIR}?action=get_student`, ''), true);
    assert.equal(isDirectoryEndpoint('https://example.org/x/TYPINGMASTER_CONNECTSRMAP_API.PHP', ''), true);
    assert.equal(isDirectoryEndpoint('https://dir.example/lookup', 'https://dir.example/lookup?a=1'), true, 'same endpoint as the directory');
    assert.equal(isDirectoryEndpoint('https://sso.srmap.edu.in/verify', DIR), false);
  });

  test("the script's own verify action (password checked in PHP) is a verifier; its lookups are not", () => {
    assert.equal(isDirectoryEndpoint(`${DIR}?action=verify`, DIR), false);
    assert.equal(readiness({ ...base, verifyUrl: `${DIR}?action=verify` }).ready, true);
    for (const a of ['get_student', 'list_students', 'VERIFY', '']) assert.equal(isDirectoryEndpoint(`${DIR}?action=${a}`, DIR), true, a);
  });

  test('readiness reports a directory-only setup and keeps sign-in off', () => {
    for (const verifyUrl of ['', DIR]) {
      const r = readiness({ ...base, verifyUrl });
      assert.equal(r.ready, false);
      assert.equal(r.providerStatus.code, 'directory_only');
      assert.equal(r.providerStatus.message, 'Directory API available; student authentication provider not configured');
    }
    assert.equal(readiness({ ...base, verifyUrl: 'https://sso.srmap.edu.in/verify' }).ready, true);
  });

  test('a directory record (with a password hash) is not a verification response', () => {
    const directory = { status: true, student: { name: 'A B', email: 'a@srmap.edu.in', password: '$2y$10$abcdefghijklmnopqrstuv', class: 'X', section: 'A', gender: 'Male' } };
    assert.equal(parseVerifyResponse(directory, OPTS).ok, false);
    assert.equal(parseVerifyResponse({ ...directory, verified: true }, OPTS).ok, false, 'no stable student id');
  });

  test('gender is not kept from a verification response', () => {
    const r = parseVerifyResponse({ status: true, verified: true, student: { student_id: 'S1', name: 'A', email: 'a@srmap.edu.in', gender: 'Female' } }, OPTS);
    assert.equal(r.ok, true);
    assert.ok(!JSON.stringify(r.profile).includes('Female'));
  });
});

describe('individual directory records (profile sync)', () => {
  const DIR = 'https://oursrmap.purlyedit.in/api/typingmaster_connectsrmap_api.php';
  const HASH = '$2y$10$abcdefghijklmnopqrstuv';
  const rec = { status: true, student: { name: 'Neelampalli  Charan Balaji', email: 'Charan_N@srmap.edu.in', class: 'BTech-3-Year-(CSE)', section: 'A', gender: 'Male', profile_photo: 'http://oursrmap.purlyedit.in/uploads/p/AP1.jpg', password: HASH, phone: '9999999999' } };

  test('keeps only the approved attributes and drops the password hash', () => {
    const r = parseDirectoryRecord(rec, { directoryUrl: DIR });
    assert.equal(r.ok, true);
    assert.deepEqual(r.attributes, { email: 'charan_n@srmap.edu.in', displayName: 'Neelampalli Charan Balaji', className: 'BTech-3-Year-(CSE)', section: 'A', gender: 'Male', profilePhoto: 'https://oursrmap.purlyedit.in/uploads/p/AP1.jpg' });
    const out = JSON.stringify(r);
    assert.ok(!out.includes(HASH) && !out.includes('9999999999'));
  });

  test('photos: https kept, http upgraded only on the directory host, others dropped', () => {
    const photo = p => parseDirectoryRecord({ status: true, student: { profile_photo: p } }, { directoryUrl: DIR }).attributes.profilePhoto;
    assert.equal(photo('https://cdn.example/x.jpg'), 'https://cdn.example/x.jpg');
    assert.equal(photo('http://evil.example/x.jpg'), '');
    assert.equal(photo('javascript:alert(1)'), '');
    assert.equal(photo(''), '');
  });

  test('not-found and malformed answers are refused', () => {
    assert.equal(parseDirectoryRecord({ status: false, message: 'Student not found.' }).ok, false);
    assert.equal(parseDirectoryRecord({ status: true }).ok, false);
    assert.equal(parseDirectoryRecord(null).ok, false);
  });
});

describe('no SRM AP sign-in outside the verified flow', () => {
  test('email, Google and GitHub sign-in never call SRM AP code', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/routes/auth.js', import.meta.url), 'utf8');
    for (const banned of ['services/srmap', 'verifyCredentials', 'lookupAndBindSrmap', 'list_students']) {
      assert.ok(!src.includes(banned), `routes/auth.js must not reference ${banned}`);
    }
  });

  test('no server code lists the student directory', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const files = walk(fileURLToPath(new URL('../src/', import.meta.url))).filter(f => f.endsWith('.js'));
    assert.ok(files.length > 20);
    for (const f of files) {
      // Comments may mention it (to say it's never used); code may not.
      const code = fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
      assert.ok(!code.includes('list_students'), `${f} must not call list_students`);
    }
  });
});
