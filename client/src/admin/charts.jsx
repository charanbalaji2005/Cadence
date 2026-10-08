import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Table2, ChartLine } from 'lucide-react';
import { num, bucketLabel } from './lib.js';

/**
 * Small SVG charts for the admin panel. Series colors come from validated CSS tokens
 * (--s1..--s6, with dark-theme steps), single series use the Cadence accent, text always
 * uses ink tokens, and every multi-series chart has a legend plus a table view.
 */

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  return Math.max(step, Math.ceil(v / (step / 4)) * (step / 4));
}

export const seriesColor = i => `var(--s${(i % 6) + 1})`;

/** Multi-series line chart with crosshair tooltip (mouse, touch and arrow keys). */
export function LineChart({ keys, unit, series, height = 220, yFormat = num, area = false, label, percent = false }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const tipId = useId();
  const n = keys.length;
  const pl = 44, pr = 12, pt = 12, pb = 26, H = height;
  const vals = series.flatMap(s => s.values.filter(v => v != null));
  const top = percent ? 1 : niceMax(Math.max(0, ...vals));
  const x = i => pl + (n <= 1 ? (W - pl - pr) / 2 : (i / (n - 1)) * (W - pl - pr));
  const y = v => pt + (1 - v / top) * (H - pt - pb);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * top);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pl) / 74))));
  const empty = !vals.some(v => v > 0);

  const path = vs => { let d = '', pen = false; vs.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
  const pick = clientX => {
    const r = ref.current.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - pl) / (W - pl - pr)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const fmt = v => (v == null ? '—' : percent ? `${Math.round(v * 100)}%` : yFormat(v));

  return (
    <div className="adm-chart">
      {series.length > 1 && (
        <ul className="adm-legend" aria-label="Legend">
          {series.map((s, i) => <li key={s.name}><span className="sw" style={{ background: s.color || seriesColor(i) }} aria-hidden="true" />{s.name}{s.total != null && <strong>{num(s.total)}</strong>}</li>)}
        </ul>
      )}
      <div className="adm-plot" ref={ref} style={{ height: H }} tabIndex={0} role="img"
        aria-label={`${label || 'Chart'}. ${empty ? 'No data in this period.' : 'Use left and right arrow keys to read values.'}`} aria-describedby={hover != null ? tipId : undefined}
        onPointerMove={e => pick(e.clientX)} onPointerDown={e => pick(e.clientX)} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setHover(h => Math.max(0, Math.min(n - 1, (h ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1)))); } }}>
        {W > 0 && (
          <svg width={W} height={H} aria-hidden="true">
            {ticks.map(t => (
              <g key={t}>
                <line className="adm-grid" x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} />
                <text className="adm-axis" x={pl - 8} y={y(t) + 3.5} textAnchor="end">{percent ? `${Math.round(t * 100)}%` : yFormat(t)}</text>
              </g>
            ))}
            {keys.map((k, i) => (i % every === 0 || i === n - 1) && (n < 3 || i === n - 1 ? true : n - 1 - i >= every / 2) ? <text key={k} className="adm-axis" x={x(i)} y={H - 7} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{bucketLabel(k, unit)}</text> : null)}
            {series.map((s, si) => {
              const d = path(s.values);
              const color = s.color || (series.length === 1 ? 'var(--accent)' : seriesColor(si));
              return (
                <g key={s.name}>
                  {area && series.length === 1 && d && <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={color} opacity=".12" />}
                  <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {n === 1 && s.values[0] != null && <circle cx={x(0)} cy={y(s.values[0])} r="4" fill={color} />}
                </g>
              );
            })}
            {hover != null && (
              <g>
                <line className="adm-cross" x1={x(hover)} x2={x(hover)} y1={pt} y2={H - pb} />
                {series.map((s, si) => s.values[hover] != null && <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color || (series.length === 1 ? 'var(--accent)' : seriesColor(si))} stroke="var(--bg)" strokeWidth="2" />)}
              </g>
            )}
          </svg>
        )}
        {empty && <p className="adm-chart-empty">No data in this period.</p>}
        {hover != null && W > 0 && (
          <div className="adm-tip" id={tipId} role="status" style={{ left: Math.min(Math.max(x(hover), 90), W - 90) }}>
            <b>{bucketLabel(keys[hover], unit)}{unit === 'week' ? ' (week)' : ''}</b>
            {series.map((s, si) => <span key={s.name}><i style={{ background: s.color || (series.length === 1 ? 'var(--accent)' : seriesColor(si)) }} />{s.name}<strong>{fmt(s.values[hover])}</strong></span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** A trend line without axes, for KPI tiles. */
export function Sparkline({ values, label }) {
  const [ref, W] = useWidth();
  const H = 32, max = Math.max(1, ...values), n = values.length;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, n - 1)) * (W - 4) + 2).toFixed(1)},${(H - 3 - (v / max) * (H - 6)).toFixed(1)}`).join('');
  return (
    <div className="adm-spark" ref={ref} role="img" aria-label={`${label}: ${values.join(', ')}`}>
      {W > 0 && <svg width={W} height={H} aria-hidden="true"><path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>}
    </div>
  );
}

/** Ranked horizontal bars for categories (pages, browsers, countries). Value and share are printed. */
export function BarList({ rows, valueLabel = 'sessions', format = num, empty = 'No data in this period.', max: cap = 10 }) {
  const list = rows.slice(0, cap);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = Math.max(1, ...list.map(r => r.value));
  if (!list.length || !total) return <p className="adm-chart-empty static">{empty}</p>;
  return (
    <ul className="adm-bars" aria-label={`Ranked by ${valueLabel}`}>
      {list.map(r => (
        <li key={r.key ?? r.label} title={`${r.label}: ${format(r.value)} ${valueLabel} (${Math.round((r.value / total) * 100)}%)`}>
          <span className="adm-bar-label">{r.icon}{r.label}{r.sub && <small>{r.sub}</small>}</span>
          <span className="adm-bar-track" aria-hidden="true"><span style={{ width: `${(r.value / top) * 100}%` }} /></span>
          <span className="adm-bar-val">{format(r.value)}<small>{Math.round((r.value / total) * 100)}%</small></span>
        </li>
      ))}
      {rows.length > cap && <li className="adm-bars-more">+ {rows.length - cap} more</li>}
    </ul>
  );
}

/** Card wrapper that can swap a chart for an accessible table of the same numbers. */
export function ChartCard({ title, aside, table, children, className = '' }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`adm-card ${className}`} aria-label={title}>
      <header className="adm-card-head">
        <h2>{title}</h2>
        <div className="adm-card-aside">
          {aside}
          {table && (
            <button type="button" className="icon-btn adm-viewtoggle" aria-pressed={asTable} title={asTable ? 'Show chart' : 'Show as table'} aria-label={asTable ? 'Show chart' : 'Show as table'} onClick={() => setAsTable(v => !v)}>
              {asTable ? <ChartLine size="1em" /> : <Table2 size="1em" />}
            </button>
          )}
        </div>
      </header>
      {asTable && table ? <SeriesTable {...table} /> : children}
    </section>
  );
}

/** Table view for time series: one row per bucket, one column per series. */
export function SeriesTable({ keys, unit, series, percent }) {
  const rows = useMemo(() => keys.map((k, i) => ({ k, vals: series.map(s => s.values[i]) })).reverse(), [keys, series]);
  return (
    <div className="adm-table-wrap scroll">
      <table className="adm-table dense">
        <thead><tr><th scope="col">{unit === 'minute' ? 'Minute' : unit === 'hour' ? 'Hour' : unit === 'week' ? 'Week of' : 'Day'}</th>{series.map(s => <th key={s.name} scope="col" className="r">{s.name}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.k}><td>{unit === 'hour' ? `${r.k.slice(0, 10)} ${bucketLabel(r.k, unit)}` : bucketLabel(r.k, unit)}</td>{r.vals.map((v, i) => <td key={i} className="r num">{v == null ? '—' : percent ? `${Math.round(v * 100)}%` : num(v)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Retention cohorts: one-hue sequential shading with the number printed in every cell. */
export function CohortTable({ cohorts }) {
  const cell = m => {
    if (!m.eligible) return <td className="adm-cohort na" title="Not enough time has passed to measure this yet">—</td>;
    const v = m.retained / m.eligible;
    return <td className="adm-cohort" style={{ '--v': v }} data-dark={v > 0.45 ? '' : undefined} title={`${m.retained} of ${m.eligible} users`}>{Math.round(v * 100)}%</td>;
  };
  return (
    <div className="adm-table-wrap scroll">
      <table className="adm-table dense adm-cohorts">
        <thead><tr><th scope="col">Signed up (week of)</th><th scope="col" className="r">Users</th><th scope="col">Day 1</th><th scope="col">Day 7</th><th scope="col">Day 30</th></tr></thead>
        <tbody>
          {cohorts.map(c => (
            <tr key={c.week}>
              <td>{new Date(`${c.week}T12:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</td>
              <td className="r num">{num(c.users)}</td>
              {cell(c.d1)}{cell(c.d7)}{cell(c.d30)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
