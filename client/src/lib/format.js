export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = a => a[Math.floor(Math.random() * a.length)];
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
export const fmtDate = (t, withTime) => new Date(t).toLocaleString([], withTime ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' });
export function nameColor(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 52%)`; }
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
};
export function pbKey(r) { return [r.mode, r.mode2, r.punctuation ? 'punctuation' : '', r.numbers ? 'numbers' : ''].filter(Boolean).join(' '); }
export function testTypeParts(r) {
  const parts = [r.mode + (r.mode2 ? ' ' + r.mode2 : '')];
  if (r.mode !== 'zen' && r.mode !== 'custom') parts.push('english');
  if (r.punctuation) parts.push('punctuation');
  if (r.numbers) parts.push('numbers');
  return parts;
}
