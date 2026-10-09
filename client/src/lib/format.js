export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, rng = Math.random) => a[Math.floor(rng() * a.length)];
/** Deterministic random numbers (mulberry32): the same seed gives every racer the same text. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
export const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export function fmtTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
export const fmtDate = (t, withTime) => {
  if (!t) return '—';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString([], withTime ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' });
};
export function nameColor(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 52%)`; }
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
};
// The word list joins the key only when it isn't the standard one, so existing personal bests keep their keys.
export function pbKey(r) { return [r.mode, r.mode2, r.language && r.language !== 'english' ? r.language : '', r.punctuation ? 'punctuation' : '', r.numbers ? 'numbers' : ''].filter(Boolean).join(' '); }
export function testTypeParts(r) {
  const parts = [r.mode + (r.mode2 ? ' ' + r.mode2 : '')];
  if (r.mode !== 'zen' && r.mode !== 'custom') parts.push(r.language || 'english');
  if (r.punctuation) parts.push('punctuation');
  if (r.numbers) parts.push('numbers');
  return parts;
}
