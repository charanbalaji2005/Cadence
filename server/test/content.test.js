import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardCheck, pbKey } from '../src/utils/rank.js';
import { resultSchema } from '../src/utils/validate.js';

const base = { wpm: 80, raw: 84, acc: 97, consistency: 80, mode: 'time', mode2: '60', punctuation: false, numbers: false, elapsed: 60, chars: { correct: 330, incorrect: 6, extra: 0, missed: 0 } };

test('only the standard english list ranks on the leaderboard', () => {
  assert.equal(leaderboardCheck({ ...base, language: 'english' }).eligible, true);
  assert.equal(leaderboardCheck(base).eligible, true, 'older clients send no language');
  const adv = leaderboardCheck({ ...base, language: 'english advanced' });
  assert.equal(adv.eligible, false);
  assert.match(adv.reason, /standard english word list/);
});

test('personal bests are kept per word list without changing existing keys', () => {
  assert.equal(pbKey({ ...base }), 'time 60');
  assert.equal(pbKey({ ...base, language: 'english' }), 'time 60');
  assert.equal(pbKey({ ...base, language: 'english 1k' }), 'time 60 english 1k');
  assert.equal(pbKey({ ...base, language: 'english advanced', punctuation: true }), 'time 60 english advanced punctuation');
});

test('results accept known word lists only', () => {
  assert.equal(resultSchema.parse(base).language, 'english');
  assert.equal(resultSchema.parse({ ...base, language: 'english 1k' }).language, 'english 1k');
  assert.equal(resultSchema.safeParse({ ...base, language: 'klingon' }).success, false);
});
