/**
 * First-party, privacy-conscious page analytics.
 * - No cookies and no fingerprinting: a random visitor id in localStorage and a per-tab
 *   session id that rotates after 30 minutes without activity.
 * - Browsers that send Do Not Track or Global Privacy Control are never tracked.
 * - Only the pathname is sent (the server stores it as a route pattern), never query data.
 */
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const SESSION_IDLE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

const optedOut = () => navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

function store(area, key, make) {
  try { let v = area.getItem(key); if (!v) { v = make(); area.setItem(key, v); } return v; } catch { return make(); }
}

let current = null;   // { id, path, at }
let sid = null;
let lastActivity = 0;
let beat = null;
let started = false;

function sessionId() {
  const now = Date.now();
  try {
    const saved = JSON.parse(sessionStorage.getItem('cadence:sid') || 'null');
    if (saved && now - saved.at < SESSION_IDLE_MS) { sid = saved.id; }
    else sid = rid();
    sessionStorage.setItem('cadence:sid', JSON.stringify({ id: sid, at: now }));
  } catch { sid = sid && now - lastActivity < SESSION_IDLE_MS ? sid : rid(); }
  lastActivity = now;
  return sid;
}

function send(path, body, keepalive = false) {
  return fetch(`${API}/api/t/${path}`, {
    method: 'POST', credentials: 'include', keepalive,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TypeFlow' },
    body: JSON.stringify(body)
  }).then(r => (r.status === 200 ? r.json() : null)).catch(() => null);
}

const vid = () => store(localStorage, 'cadence:vid', rid);

function heartbeat() {
  if (document.hidden || !current) return;
  send('hb', { vid: vid(), sid: sessionId(), path: current.path, pvId: current.id || undefined, ms: Date.now() - current.at });
}

/** Records a page view. Call on every client-side route change. Admin pages are skipped. */
export async function trackPage(pathname) {
  if (optedOut() || pathname.startsWith('/admin')) return;
  const prev = current;
  const first = !started;
  started = true;
  const params = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(['source', 'medium', 'campaign'].map(k => [k, params.get(`utm_${k}`) || undefined]).filter(([, v]) => v));
  current = { id: null, path: pathname, at: Date.now() };
  const mine = current;
  const res = await send('pv', {
    vid: vid(), sid: sessionId(), path: pathname,
    referrer: first ? document.referrer.slice(0, 500) : '',
    utm, screen: Math.round(window.screen?.width || window.innerWidth), lang: navigator.language,
    ...(prev?.id ? { prev: { id: prev.id, ms: Date.now() - prev.at } } : {})
  });
  if (res?.id && current === mine) current.id = res.id;
  if (!beat) {
    beat = setInterval(heartbeat, HEARTBEAT_MS);
    // Leaving or hiding the tab: close out the current page's time and drop out of "live".
    const leave = () => { if (current) send('leave', { vid: vid(), sid: sid || sessionId(), pvId: current.id || undefined, ms: Date.now() - current.at }, true); };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) heartbeat(); else if (current) { sessionId(); heartbeat(); } });
  }
}

/** Sends uncaught browser errors to the admin error log (at most a few per page load, no duplicates). */
export function trackErrors() {
  const seen = new Set();
  let sent = 0;
  const report = (message, name, stack) => {
    const key = `${name}:${message}`;
    if (!message || seen.has(key) || sent >= 5) return;
    seen.add(key); sent++;
    send('error', { message: String(message).slice(0, 500), name: String(name || 'Error').slice(0, 60), stack: String(stack || '').slice(0, 4000), route: window.location.pathname });
  };
  window.addEventListener('error', e => { if (e.error || e.message) report(e.message, e.error?.name, e.error?.stack); });
  window.addEventListener('unhandledrejection', e => { const r = e.reason; report(r?.message || String(r), r?.name || 'UnhandledRejection', r?.stack); });
}
