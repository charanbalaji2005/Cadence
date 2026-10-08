import { isPlausible, pbKey } from './rank.js';

/** Turns a result's per-key stats into a $inc update on the user document. */
export const keyInc = keyStats => {
  const inc = {};
  for (const [k, v] of Object.entries(keyStats || {})) for (const f of ['n', 'e', 'ms', 'mc']) if (v[f]) inc[`keyStats.${k}.${f}`] = v[f];
  return inc;
};

/** Builds the user update for a saved result: key stats plus a new personal best when it beats the old one. */
export function userStatsUpdate(user, d) {
  const update = {};
  const inc = keyInc(d.keyStats);
  if (Object.keys(inc).length) update.$inc = inc;
  let pb = null;
  if ((d.mode === 'time' || d.mode === 'words') && d.acc >= 50 && isPlausible(d)) {
    const key = pbKey(d), prev = typeof user.personalBests?.get === 'function' ? user.personalBests.get(key) : user.personalBests?.[key];
    if (!prev || d.wpm > prev.wpm) {
      update.$set = { [`personalBests.${key}`]: { wpm: d.wpm, acc: d.acc, raw: d.raw, consistency: d.consistency, date: new Date() } };
      pb = { key, previous: prev ? prev.wpm : null };
    }
  }
  return { update, pb };
}
