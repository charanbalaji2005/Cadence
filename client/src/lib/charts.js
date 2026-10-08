import { clamp, esc } from './format.js';

function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

/** Draws an interactive SVG line chart into `box`. `tip(i)` returns trusted HTML built from numbers and escaped text. */
export function drawChart(box, o) {
  if (!box) return;
  const W = box.clientWidth || 600, H = box.clientHeight || 210, pl = 38, pr = 10, pt = 10, pb = 24, n = o.n;
  if (n < 2) { box.innerHTML = `<p class="graph-empty">${esc(o.empty || 'Not enough data yet.')}</p>`; return; }
  const vals = o.series.flatMap(s => s.values.filter(v => v != null));
  let top = o.max != null ? o.max : Math.max(10, ...vals);
  let bot = o.min != null ? o.min : 0;
  const step = niceStep((top - bot) / 4 || 1);
  top = Math.ceil(top / step) * step; bot = Math.floor(bot / step) * step;
  const x = i => pl + (i / (n - 1)) * (W - pl - pr);
  const y = v => pt + (1 - (clamp(v, bot, top) - bot) / (top - bot || 1)) * (H - pt - pb);
  let g = '';
  for (let v = bot; v <= top + 1e-9; v += step) g += `<line class="g-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="g-label" x="${pl - 8}" y="${y(v) + 3}" text-anchor="end">${o.yFmt ? o.yFmt(v) : Math.round(v)}</text>`;
  const xs = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 70))));
  for (let i = 0; i < n; i += xs) g += `<text class="g-label" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel ? o.xLabel(i) : i + 1)}</text>`;
  const path = vs => { let d = '', pen = false; vs.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
  let body = '';
  o.series.forEach(s => {
    const d = path(s.values);
    if (s.area) body += `<path class="g-area" d="${d}L${x(n - 1).toFixed(1)},${y(bot)}L${x(0).toFixed(1)},${y(bot)}Z"/>`;
    body += `<path class="${s.cls}" d="${d}"/>`;
    if (s.dots && n <= 60) s.values.forEach((v, i) => { if (v != null) body += `<circle class="g-dot" cx="${x(i)}" cy="${y(v)}" r="2.6"/>`; });
  });
  (o.marks || []).forEach(m => { const cx = x(m.i), cy = y(m.v), d = 3.5; body += `<path class="g-err" d="M${cx - d},${cy - d}L${cx + d},${cy + d}M${cx + d},${cy - d}L${cx - d},${cy + d}"/>`; });
  box.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(o.label || 'Chart')}">${g}${body}<line class="g-cursor" y1="${pt}" y2="${H - pb}" x1="-10" x2="-10"/><rect class="hit" x="${pl}" y="0" width="${W - pl - pr}" height="${H}" fill="transparent"/></svg><div class="chart-tip" hidden></div>`;
  if (!o.tip) return;
  const hit = box.querySelector('.hit'), tip = box.querySelector('.chart-tip'), cur = box.querySelector('.g-cursor');
  const move = e => {
    const rect = hit.getBoundingClientRect();
    const i = clamp(Math.round(((e.clientX - rect.left) / rect.width) * (n - 1)), 0, n - 1);
    cur.setAttribute('x1', x(i)); cur.setAttribute('x2', x(i));
    tip.hidden = false; tip.style.left = clamp(x(i), 80, W - 80) + 'px'; tip.innerHTML = o.tip(i);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cur.setAttribute('x1', -10); cur.setAttribute('x2', -10); });
}

export function drawBars(box, bins, opts = {}) {
  if (!box) return;
  const W = box.clientWidth || 500, H = box.clientHeight || 200, pl = 30, pr = 6, pt = 10, pb = 24;
  const n = bins.length;
  if (!n) { box.innerHTML = '<p class="graph-empty">Not enough data yet.</p>'; return; }
  const max = Math.max(1, ...bins.map(b => b.v)), bw = Math.min(64, (W - pl - pr) / n);
  const y = v => pt + (1 - v / max) * (H - pt - pb);
  let s = '';
  [...new Set([0, Math.ceil(max / 2), max])].forEach(v => { s += `<line class="g-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="g-label" x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`; });
  bins.forEach((b, i) => {
    const bx = pl + i * bw + 2, h = (H - pt - pb) - (y(b.v) - pt);
    s += `<rect class="g-bar${b.hl ? ' hl' : ''}" x="${bx}" y="${y(b.v)}" width="${Math.max(2, bw - 4)}" height="${Math.max(0, h)}" rx="3"><title>${esc(b.title)}</title></rect>`;
    if (n <= 14 || i % Math.ceil(n / 10) === 0) s += `<text class="g-label" x="${bx + (bw - 4) / 2}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  box.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(opts.label || 'Bar chart')}">${s}</svg>`;
}
