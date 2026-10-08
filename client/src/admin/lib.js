import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/* ---------- API ---------- */

const qs = params => {
  const p = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
};
export const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
export const aget = (path, params, opts) => api(`/admin${path}${qs(params)}`, opts);
export const apost = (path, body) => api(`/admin${path}`, { method: 'POST', body: body ?? {} });
export const aput = (path, body) => api(`/admin${path}`, { method: 'PUT', body });
export const apatch = (path, body) => api(`/admin${path}`, { method: 'PATCH', body });
export const adelete = (path, body) => api(`/admin${path}`, { method: 'DELETE', body });

/**
 * Loads an admin endpoint. Keeps showing the previous data while refreshing (no flashing),
 * aborts superseded requests, and can poll. Returns { data, error, loading, reload }.
 */
export function useQuery(path, params = {}, { poll = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!enabled });
  const key = `${path}${qs(params)}`;
  const run = useCallback(async (signal, quiet) => {
    if (!quiet) setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(`/admin${key}`, { signal });
      setState({ data, error: null, loading: false });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState(s => ({ data: quiet ? s.data : null, error: err, loading: false }));
    }
  }, [key]);
  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    run(ctrl.signal, false);
    let timer;
    if (poll) timer = setInterval(() => { if (!document.hidden) run(undefined, true); }, poll);
    return () => { ctrl.abort(); clearInterval(timer); };
  }, [run, poll, enabled]);
  const reload = useCallback(() => run(undefined, false), [run]);
  const refresh = useCallback(() => run(undefined, true), [run]);
  return { ...state, reload, refresh };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** True when the active Cadence theme is dark (the theme engine sets color-scheme on <html>). */
export function useDarkTheme() {
  const read = () => getComputedStyle(document.documentElement).colorScheme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** Filters kept in the URL query string, so views are shareable and survive reloads. */
export function useUrlFilters(searchParams, setSearchParams, defaults = {}) {
  const get = k => searchParams.get(k) ?? defaults[k] ?? '';
  const set = patch => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) { if (v === '' || v == null || v === defaults[k]) next.delete(k); else next.set(k, v); }
    if (!('page' in patch)) next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const all = Object.fromEntries([...new Set([...Object.keys(defaults), ...searchParams.keys()])].map(k => [k, get(k)]));
  const clear = keep => setSearchParams(new URLSearchParams(keep ? Object.fromEntries(keep.map(k => [k, get(k)]).filter(([, v]) => v)) : {}), { replace: true });
  const active = [...searchParams.keys()].filter(k => k !== 'page' && k !== 'sort' && k !== 'dir').length;
  return { get, set, all, clear, active };
}

/* ---------- admin context ---------- */

export const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

/* ---------- formatting ---------- */

const nf = new Intl.NumberFormat();
export const num = n => (n == null || Number.isNaN(n) ? '—' : nf.format(Math.round(n)));
export const dec = (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(d));
export const pct = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(d)}%`);
export function compact(n) {
  if (n == null) return '—';
  const a = Math.abs(n);
  return a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : nf.format(Math.round(n));
}
export function bytes(n) {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export function duration(sec) {
  if (sec == null) return '—';
  sec = Math.round(sec);
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
export const dateTime = d => (d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const dateOnly = d => (d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const timeOnly = d => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
export function ago(d) {
  if (!d) return 'never';
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 30 * 86400) return `${Math.round(s / 86400)} d ago`;
  return dateOnly(d);
}
const COUNTRY = (() => { try { return new Intl.DisplayNames(undefined, { type: 'region' }); } catch { return null; } })();
export const countryName = c => (!c ? 'Unknown' : COUNTRY?.of(c) || c);
export const flag = c => (c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '');

/** A bucket key from the API ("2026-10-09", "2026-10-09T14") as a short axis label. */
export function bucketLabel(key, unit) {
  if (unit === 'minute') return key.slice(11, 16);
  if (unit === 'hour') return `${key.slice(11, 13)}:00`;
  const d = new Date(`${key.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const ROUTE_LABEL = {
  '/': 'Typing test', '/login': 'Log in', '/register': 'Sign up', '/leaderboard': 'Leaderboard', '/stats': 'Stats', '/settings': 'Settings',
  '/account': 'Account', '/about': 'About', '/friends': 'Friends', '/compete': 'Compete', '/compete/:code': 'Competition room', '/compete/join/:code': 'Join link', '/other': 'Other pages'
};
export const routeLabel = r => ROUTE_LABEL[r] || r;

export const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['1y', '1 year'], ['custom', 'Custom']];

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
/** Starts a file download from an admin GET endpoint (the session cookie authorises it). */
export function download(path) {
  const a = document.createElement('a');
  a.href = `${API_BASE}/api/admin${path}`; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
