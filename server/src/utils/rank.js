export const LB_LENGTHS = ['15', '60'];
export const LB_MIN_ACC = 75;

/** Basic anti-cheat: the numbers a client sends have to agree with each other. */
export function isPlausible(r) {
  // chars counts letters only; wpm also counts the space after each word, so allow for spaces.
  const letters = r.chars.correct + r.chars.incorrect + r.chars.extra;
  const maxWpmFromLetters = (letters * 1.6) / 5 / (r.elapsed / 60) + 5;
  if (r.wpm > 300 || r.raw > 350) return false;
  if (r.wpm > r.raw + 1) return false;
  if (r.wpm > maxWpmFromLetters) return false;
  if (r.chars.correct / 5 / (r.elapsed / 60) > r.wpm * 1.05 + 5) return false;
  if (r.mode === 'time' && Math.abs(r.elapsed - Number(r.mode2)) > 1.5) return false;
  return true;
}

/** Server-side rules for whether a result can appear on the leaderboard. */
export function leaderboardCheck(r) {
  if (r.mode !== 'time' || !LB_LENGTHS.includes(r.mode2) || r.punctuation || r.numbers) return { eligible: false, reason: null };
  if (!isPlausible(r)) return { eligible: false, reason: 'This result looked unusual, so it was not ranked.' };
  if (r.acc < LB_MIN_ACC) return { eligible: false, reason: `Leaderboard scores need at least ${LB_MIN_ACC}% accuracy.` };
  return { eligible: true, reason: null };
}

export function pbKey(r) {
  return [r.mode, r.mode2, r.punctuation ? 'punctuation' : '', r.numbers ? 'numbers' : ''].filter(Boolean).join(' ');
}

/** Start of "today" for a client-supplied UTC offset in minutes (Date.getTimezoneOffset()). */
export function startOfToday(tzOffsetMin = 0) {
  const off = Number.isFinite(tzOffsetMin) ? Math.max(-840, Math.min(840, tzOffsetMin)) : 0;
  const local = new Date(Date.now() - off * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + off * 60000);
}
