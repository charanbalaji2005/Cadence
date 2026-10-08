import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, RotateCw, Inbox, AlertTriangle, Search, X, Loader2, ShieldAlert, ShieldCheck, Shield, Info, CircleCheck, CircleSlash, Trash2, Copy, Check } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { useOverlay } from '../context/UIContext.jsx';
import { num, RANGES, compact } from './lib.js';
import { Sparkline } from './charts.jsx';

/* ---------- states ---------- */

export function Skeleton({ w = '100%', h = '1rem', r = 8, style }) {
  return <span className="adm-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="adm-empty" role="status">
      <span className="adm-empty-icon" aria-hidden="true"><Icon size="1em" /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="adm-error" role="alert">
      <AlertTriangle size="1.1em" aria-hidden="true" />
      <div><strong>Couldn't load this.</strong><p>{error?.message || 'Something went wrong.'}</p></div>
      {onRetry && <button type="button" className="btn outline sm" onClick={onRetry}><RotateCw size="1em" />Retry</button>}
    </div>
  );
}

/** Wraps a data-driven block: skeleton while loading, error with retry, then the content. */
export function Loadable({ q, skeleton, children }) {
  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return skeleton || <div className="adm-skel-block"><Skeleton h="1.2rem" w="40%" /><Skeleton h="8rem" /></div>;
  return children(q.data);
}

/* ---------- layout pieces ---------- */

export function PageHead({ title, sub, actions, kicker }) {
  return (
    <div className="adm-head">
      <div>
        {kicker && <span className="adm-kicker">{kicker}</span>}
        <h1>{title}</h1>
        {sub && <p className="adm-sub">{sub}</p>}
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, aside, children, className = '', pad = true, id }) {
  return (
    <section className={`adm-card${pad ? '' : ' nopad'} ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || aside) && <header className="adm-card-head"><h2>{title}</h2>{aside && <div className="adm-card-aside">{aside}</div>}</header>}
      {children}
    </section>
  );
}

export function Tabs({ value, onChange, items, label }) {
  return (
    <div className="seg adm-tabs" role="tablist" aria-label={label}>
      {items.map(([v, l, count]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}{count != null && <span className="adm-count">{compact(count)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- badges ---------- */

const SEV = {
  critical: { cls: 'crit', icon: ShieldAlert, label: 'Critical' },
  suspicious: { cls: 'warn', icon: Shield, label: 'Suspicious' },
  normal: { cls: 'ok', icon: ShieldCheck, label: 'Normal' },
  high: { cls: 'crit', icon: AlertTriangle, label: 'High' },
  medium: { cls: 'warn', icon: AlertTriangle, label: 'Medium' },
  low: { cls: 'muted', icon: Info, label: 'Low' },
  warning: { cls: 'warn', icon: AlertTriangle, label: 'Warning' },
  info: { cls: 'muted', icon: Info, label: 'Info' }
};
/** Severity always pairs color with an icon and a word, never color alone. */
export function Severity({ value }) {
  const s = SEV[value] || SEV.info;
  const Icon = s.icon;
  return <span className={`adm-pill ${s.cls}`}><Icon size="1em" aria-hidden="true" />{s.label}</span>;
}

const STATUS = {
  active: ['ok', CircleCheck, 'Active'], suspended: ['warn', CircleSlash, 'Suspended'], deleted: ['crit', Trash2, 'Deleted'],
  revoked: ['muted', CircleSlash, 'Revoked'], expired: ['muted', CircleSlash, 'Expired'],
  open: ['warn', AlertTriangle, 'Open'], acknowledged: ['muted', Info, 'Acknowledged'], resolved: ['ok', CircleCheck, 'Resolved'],
  done: ['ok', CircleCheck, 'Ready'], running: ['muted', Loader2, 'Running'], queued: ['muted', Loader2, 'Queued'], failed: ['crit', AlertTriangle, 'Failed'],
  success: ['ok', CircleCheck, 'Success'], failure: ['crit', CircleSlash, 'Failed'],
  WAITING: ['muted', Info, 'Waiting'], COUNTDOWN: ['warn', Loader2, 'Starting'], RUNNING: ['ok', Loader2, 'Racing'], FINISHED: ['ok', CircleCheck, 'Finished'], CANCELLED: ['muted', CircleSlash, 'Cancelled'], EXPIRED: ['muted', CircleSlash, 'Expired']
};
export function Status({ value }) {
  const [cls, Icon, label] = STATUS[value] || ['muted', Info, value];
  return <span className={`adm-pill ${cls}`}><Icon size="1em" aria-hidden="true" className={value === 'running' || value === 'queued' ? 'adm-spin' : ''} />{label}</span>;
}

export function Role({ value }) {
  const v = value || 'USER';
  return <span className={`adm-role r-${v.toLowerCase()}`}>{v.replace('_', ' ')}</span>;
}

export function UserCell({ user, sub, to }) {
  if (!user) return <span className="muted">—</span>;
  const body = (<><Avatar name={user.username} url={user.avatar} size="sm" /><span className="adm-usercell-txt"><strong>{user.username}</strong>{sub && <small>{sub}</small>}</span></>);
  return to === false ? <span className="adm-usercell">{body}</span> : <Link className="adm-usercell" to={`/admin/users/${user.id}`}>{body}</Link>;
}

export function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="icon-btn adm-copy" aria-label={`${label}: ${value}`} title={label}
      onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ } }}>
      {done ? <Check size="1em" /> : <Copy size="1em" />}
    </button>
  );
}

/* ---------- KPI ---------- */

/** A stat tile: value, change vs the previous period with direction in words and arrow, and a small trend. */
export function Kpi({ label, k, format = num, goodWhenUp = true, loading }) {
  if (loading || !k) {
    return <div className="adm-kpi" aria-busy="true"><span className="adm-kpi-label">{label}</span><Skeleton h="2rem" w="55%" /><Skeleton h=".8rem" w="70%" /></div>;
  }
  const ch = k.change;
  const up = ch > 0, flat = ch === 0;
  const good = flat ? null : up === goodWhenUp;
  return (
    <div className="adm-kpi">
      <span className="adm-kpi-label">{label}{k.live && <span className="adm-live" aria-label="live"><span /></span>}</span>
      <strong className="adm-kpi-value">{format(k.value)}</strong>
      <span className="adm-kpi-foot">
        {ch == null
          ? (k.previous === 0 && k.value > 0 ? <span className="adm-delta up good">new</span> : null)
          : <span className={`adm-delta ${flat ? 'flat' : up ? 'up' : 'down'} ${good == null ? '' : good ? 'good' : 'bad'}`} aria-label={`${flat ? 'No change' : up ? 'Up' : 'Down'} ${Math.abs(ch)} percent`}>
              {flat ? '±' : up ? <ArrowUp size="1em" /> : <ArrowDown size="1em" />}{Math.abs(ch)}%
            </span>}
        <span className="adm-kpi-compare">{k.compare}</span>
      </span>
      {k.trend && k.trend.some(Boolean) && <Sparkline values={k.trend} label={`${label} trend`} />}
    </div>
  );
}

/* ---------- table ---------- */

/**
 * Server-driven table: the server sorts and paginates; this only renders.
 * columns: [{ key, label, render(row), sort: 'field', align, className, hideSm }]
 */
export function DataTable({ columns, q, rows, sort, dir, onSort, empty, rowKey = r => r.id, onRow, caption, dense }) {
  const items = rows ?? q?.data?.items;
  const loading = q && !q.data && !q.error;
  if (q?.error && !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  return (
    <div className={`adm-table-wrap${q?.loading && q?.data ? ' refreshing' : ''}`}>
      <table className={`adm-table${dense ? ' dense' : ''}`}>
        {caption && <caption className="sr">{caption}</caption>}
        <thead>
          <tr>
            {columns.map(c => {
              const active = c.sort && sort === c.sort;
              return (
                <th key={c.key} scope="col" className={`${c.align === 'right' ? 'r' : ''} ${c.hideSm ? 'hide-sm' : ''} ${c.hideMd ? 'hide-md' : ''}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sort && onSort
                    ? <button type="button" className="adm-sort" onClick={() => onSort(c.sort, active && dir === 'desc' ? 'asc' : 'desc')}>{c.label}{active ? (dir === 'asc' ? <ArrowUp size="1em" /> : <ArrowDown size="1em" />) : null}</button>
                    : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 6 }, (_, i) => (
            <tr key={`s${i}`} aria-hidden="true">{columns.map(c => <td key={c.key} className={`${c.hideSm ? 'hide-sm' : ''} ${c.hideMd ? 'hide-md' : ''}`}><Skeleton h=".9rem" w={`${50 + ((i * 7 + c.key.length * 13) % 40)}%`} /></td>)}</tr>
          ))}
          {!loading && items?.map(r => (
            <tr key={rowKey(r)} className={onRow ? 'clickable' : ''} onClick={onRow ? e => { if (!e.target.closest('button, a, input, select')) onRow(r); } : undefined}>
              {columns.map(c => <td key={c.key} className={`${c.align === 'right' ? 'r' : ''} ${c.className || ''} ${c.hideSm ? 'hide-sm' : ''} ${c.hideMd ? 'hide-md' : ''}`} data-label={c.label}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && items && !items.length && <Empty title={empty || 'Nothing here yet.'} />}
    </div>
  );
}

export function Pager({ data, onPage }) {
  if (!data || data.total <= data.limit) return data ? <p className="adm-pager-note">{num(data.total)} {data.total === 1 ? 'result' : 'results'}</p> : null;
  const from = (data.page - 1) * data.limit + 1, to = Math.min(data.total, data.page * data.limit);
  return (
    <nav className="adm-pager" aria-label="Pagination">
      <span>{num(from)}–{num(to)} of {num(data.total)}</span>
      <button type="button" className="icon-btn" aria-label="Previous page" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}><ChevronLeft size="1em" /></button>
      <span className="adm-pager-page">Page {data.page} of {num(data.pages)}</span>
      <button type="button" className="icon-btn" aria-label="Next page" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}><ChevronRight size="1em" /></button>
    </nav>
  );
}

/* ---------- filters ---------- */

export function FilterBar({ children, active, onClear }) {
  return (
    <div className="adm-filters" role="search">
      {children}
      {active > 0 && <button type="button" className="btn ghost sm" onClick={onClear}><X size="1em" />Clear filters</button>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search', label = 'Search', delay = 300 }) {
  const [v, setV] = useState(value || '');
  const first = useRef(true);
  useEffect(() => { setV(value || ''); }, [value]);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const t = setTimeout(() => { if (v !== (value || '')) onChange(v); }, delay);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="adm-search">
      <Search size="1em" aria-hidden="true" />
      <span className="sr">{label}</span>
      <input type="search" value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} />
    </label>
  );
}

export function Select({ label, value, onChange, options }) {
  const id = useId();
  return (
    <label className="adm-select" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o || 'Any'}</option>))}
      </select>
    </label>
  );
}

/** Preset ranges plus a custom from/to. Emits { range, from, to }. */
export function RangePicker({ range, from, to, onChange, presets = RANGES }) {
  return (
    <div className="adm-range">
      <div className="seg" role="group" aria-label="Date range">
        {presets.map(([v, l]) => <button key={v} type="button" aria-pressed={range === v} onClick={() => onChange({ range: v, from: v === 'custom' ? from : '', to: v === 'custom' ? to : '' })}>{l}</button>)}
      </div>
      {range === 'custom' && (
        <span className="adm-range-custom">
          <label><span className="sr">From</span><input type="date" value={from || ''} max={to || undefined} onChange={e => onChange({ range, from: e.target.value, to })} /></label>
          <span aria-hidden="true">–</span>
          <label><span className="sr">To</span><input type="date" value={to || ''} min={from || undefined} onChange={e => onChange({ range, from, to: e.target.value })} /></label>
        </span>
      )}
    </div>
  );
}

export function DateFilter({ from, to, onChange }) {
  return (
    <span className="adm-range-custom">
      <label><span className="sr">From date</span><input type="date" value={from || ''} max={to || undefined} onChange={e => onChange({ from: e.target.value, to })} aria-label="From date" /></label>
      <span aria-hidden="true">–</span>
      <label><span className="sr">To date</span><input type="date" value={to || ''} min={from || undefined} onChange={e => onChange({ from, to: e.target.value })} aria-label="To date" /></label>
    </span>
  );
}

/* ---------- dialogs ---------- */

/**
 * Confirmation for risky actions. `typeToConfirm` requires typing a word (e.g. DELETE);
 * `reasons` adds a required reason picker; `note` adds an optional note field.
 * onConfirm({ reason, note }) may throw; its message is shown inline.
 */
export function Confirm({ open, onClose, title, body, confirmLabel = 'Confirm', danger, typeToConfirm, reasons, note, onConfirm }) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const id = useId();
  useOverlay(`confirm-${id}`, open, () => !busy && onClose());
  useEffect(() => { if (open) { setTyped(''); setReason(''); setText(''); setError(null); setBusy(false); } }, [open]);
  const ready = (!typeToConfirm || typed === typeToConfirm) && (!reasons || reason) && !busy;
  const submit = async e => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError(null);
    try { await onConfirm({ reason, note: text }); onClose(); }
    catch (err) { setError(err.message || 'That did not work.'); setBusy(false); }
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="overlay fm adm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
          <motion.form className="dialog fm adm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} onSubmit={submit}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <h2 id={`${id}-t`}>{title}</h2>
            <div className="sub" id={`${id}-d`}>{body}</div>
            {reasons && (
              <div className="field"><label htmlFor={`${id}-r`}>Reason</label>
                <select id={`${id}-r`} className="adm-input" value={reason} onChange={e => setReason(e.target.value)} required autoFocus>
                  <option value="">Choose a reason</option>
                  {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
            {note && <div className="field"><label htmlFor={`${id}-n`}>{note}</label><textarea id={`${id}-n`} className="adm-input" rows={3} maxLength={500} value={text} onChange={e => setText(e.target.value)} /></div>}
            {typeToConfirm && (
              <div className="field"><label htmlFor={`${id}-c`}>Type <strong>{typeToConfirm}</strong> to confirm</label>
                <input id={`${id}-c`} className="adm-input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus={!reasons} spellCheck="false" />
              </div>
            )}
            {error && <p className="form-msg" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className={`btn ${danger ? 'danger solid' : 'primary'}`} disabled={!ready} autoFocus={!typeToConfirm && !reasons}>
                {busy && <Loader2 size="1em" className="adm-spin" />}{confirmLabel}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Label/value rows for detail panels. */
export function Facts({ items }) {
  return (
    <dl className="adm-facts">
      {items.filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}
    </dl>
  );
}
