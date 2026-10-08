import { dayKey } from './format.js';

export const RARITY = { common: '#8A94A6', uncommon: '#22A867', rare: '#3B82F6', epic: '#A855F7', legendary: '#F59E0B' };
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First steps', desc: 'Finish your first test', rarity: 'common', icon: 'Flag', test: a => a.tests >= 1 },
  { id: 'w50', name: 'Warmed up', desc: 'Reach 50 wpm', rarity: 'common', icon: 'Zap', test: a => a.best >= 50 },
  { id: 'w75', name: 'Quick hands', desc: 'Reach 75 wpm', rarity: 'uncommon', icon: 'Gauge', test: a => a.best >= 75 },
  { id: 'w100', name: 'Triple digits', desc: 'Reach 100 wpm', rarity: 'rare', icon: 'Rocket', test: a => a.best >= 100 },
  { id: 'w125', name: 'Blur', desc: 'Reach 125 wpm', rarity: 'epic', icon: 'Wind', test: a => a.best >= 125 },
  { id: 'w150', name: 'Lightning', desc: 'Reach 150 wpm', rarity: 'legendary', icon: 'Crown', test: a => a.best >= 150 },
  { id: 'perfect', name: 'Spotless', desc: '100% accuracy on a test of 30 seconds or more', rarity: 'rare', icon: 'Target', test: a => a.perfect },
  { id: 'steady', name: 'Metronome', desc: '85% consistency on a test of 30 seconds or more', rarity: 'epic', icon: 'Activity', test: a => a.bestCons >= 85 },
  { id: 't10', name: 'Regular', desc: 'Finish 10 tests', rarity: 'common', icon: 'Repeat', test: a => a.tests >= 10 },
  { id: 't100', name: 'Centurion', desc: 'Finish 100 tests', rarity: 'rare', icon: 'Medal', test: a => a.tests >= 100 },
  { id: 's3', name: 'On a roll', desc: 'Type on 3 days in a row', rarity: 'uncommon', icon: 'Flame', test: a => a.longest >= 3 },
  { id: 's7', name: 'Week strong', desc: 'Type on 7 days in a row', rarity: 'epic', icon: 'CalendarCheck', test: a => a.longest >= 7 },
  { id: 'hour', name: 'Hour of practice', desc: 'Spend an hour typing in total', rarity: 'rare', icon: 'Timer', test: a => a.time >= 3600 },
  { id: 'owl', name: 'Night owl', desc: 'Finish a test between midnight and 4 am', rarity: 'uncommon', icon: 'Moon', test: a => a.owl }
];

export function streaks(hist) {
  const days = new Set(hist.map(h => dayKey(h.date)));
  let longest = 0, run = 0, prev = null;
  [...days].sort().forEach(d => { const t = Date.parse(d + 'T12:00:00'); run = prev && t - prev < 1.5 * 864e5 ? run + 1 : 1; longest = Math.max(longest, run); prev = t; });
  let current = 0; const c = new Date(); c.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(c))) c.setDate(c.getDate() - 1);
  while (days.has(dayKey(c))) { current++; c.setDate(c.getDate() - 1); }
  return { longest, current };
}

export function aggregate(hist) {
  const st = streaks(hist);
  return {
    tests: hist.length, best: hist.reduce((m, h) => Math.max(m, h.wpm), 0),
    perfect: hist.some(h => h.acc >= 99.999 && h.elapsed >= 30),
    bestCons: hist.filter(h => h.elapsed >= 30).reduce((m, h) => Math.max(m, h.consistency), 0),
    time: hist.reduce((a, h) => a + h.elapsed, 0), owl: hist.some(h => new Date(h.date).getHours() < 4),
    longest: st.longest, current: st.current
  };
}
export const unlockedIds = hist => { const a = aggregate(hist); return ACHIEVEMENTS.filter(x => x.test(a)).map(x => x.id); };

export function weakKeys(keyStats, n = 4) {
  return Object.entries(keyStats || {}).filter(([k, v]) => /[a-z]/.test(k) && v.n >= 8)
    .map(([k, v]) => ({ k, acc: 1 - v.e / v.n, ms: v.mc ? v.ms / v.mc : 0, score: (v.e / v.n) * 100 + (v.mc ? v.ms / v.mc : 0) / 25 }))
    .sort((a, b) => b.score - a.score).slice(0, n);
}
