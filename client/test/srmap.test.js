/**
 * Connect SRM AP browser helpers: branding is driven only by the server's verified flag.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasSrmapBranding, srmapBatch, checkIdentifier, batchLabel } from '../src/lib/srmap.js';

describe('branding', () => {
  test('only a server-verified connection shows SRM AP branding', () => {
    assert.equal(hasSrmapBranding({ connections: { srm_ap: { verified: true, batchYear: 2024 } } }), true);
    assert.equal(hasSrmapBranding({ connections: { srm_ap: null } }), false);
    assert.equal(hasSrmapBranding({ connections: { srm_ap: { verified: 'true' } } }), false);
    assert.equal(hasSrmapBranding({ connections: {} }), false);
    assert.equal(hasSrmapBranding(null), false, 'signed out');
    assert.equal(hasSrmapBranding(undefined), false);
  });

  test('an SRM AP-looking email or username is not enough', () => {
    assert.equal(hasSrmapBranding({ email: 'student@srmap.edu.in', username: 'ap24110010895', connections: { srm_ap: null } }), false);
  });

  test('batch is shown only when verified and known', () => {
    assert.equal(srmapBatch({ connections: { srm_ap: { verified: true, batchYear: 2025 } } }), 2025);
    assert.equal(srmapBatch({ connections: { srm_ap: { verified: true, batchYear: null } } }), null);
    assert.equal(srmapBatch({ connections: { srm_ap: null } }), null);
    assert.equal(batchLabel(2024), '2024 Batch');
    assert.equal(batchLabel(null), '');
  });
});

describe('identifier input', () => {
  test('register numbers are normalised', () => {
    assert.deepEqual(checkIdentifier(' ap24 110010895 '), { ok: true, kind: 'register_number', value: 'AP24110010895' });
  });
  test('institutional email only', () => {
    assert.equal(checkIdentifier('Me@SRMAP.edu.in').value, 'me@srmap.edu.in');
    assert.equal(checkIdentifier('me@gmail.com').ok, false);
  });
  test('junk is rejected', () => {
    for (const bad of ['', 'AP24', 'hello', '12345678901']) assert.equal(checkIdentifier(bad).ok, false, bad);
  });
});
