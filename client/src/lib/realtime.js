const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** ws:// on http, wss:// on https, always derived from where the API lives (never hardcoded). */
export function wsUrl() {
  return `${(API_BASE || window.location.origin).replace(/^http/, 'ws')}/api/ws`;
}

const HEARTBEAT_MS = 25000;
const MAX_ATTEMPTS = 8;      // after this, wait for the user (or the network coming back) instead of looping
const MAX_DELAY_MS = 30000;
const QUEUEABLE = new Set(['create_room', 'join_room', 'leave_room', 'ready', 'update_settings', 'start_room', 'cancel_room', 'rematch', 'invite', 'decline_invite', 'sync']);
const LATEST_WINS = new Set(['ready', 'update_settings', 'sync']);

/**
 * One WebSocket per signed-in tab, used only for competition and friend events.
 * Typing never goes through here: the client sends a small progress update a few
 * times a second and one final result.
 *
 * status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
 */
export class RealtimeClient {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.status = 'idle';
    this.ready = false;
    this.attempts = 0;
    this.queue = [];
    this.offset = 0;          // server clock minus this browser's clock, in ms
    this.bestRtt = Infinity;
    this.timers = {};
    this.stopped = true;
    this.onOnline = () => { if (this.status === 'disconnected' || this.status === 'reconnecting') this.reconnectNow(); };
    this.onVisible = () => { if (!document.hidden && this.status === 'disconnected') this.reconnectNow(); };
  }

  setStatus(s) { if (s !== this.status) { this.status = s; this.onStatus(s); } }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.open();
  }

  stop() {
    this.stopped = true;
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.clearTimers();
    this.queue = [];
    if (this.ws) { this.ws.onclose = null; this.ws.close(1000); this.ws = null; }
    this.ready = false;
    this.setStatus('idle');
  }

  reconnectNow() {
    if (this.stopped) return;
    clearTimeout(this.timers.retry);
    this.attempts = 0;
    if (!this.ws) this.open();
  }

  clearTimers() { Object.values(this.timers).forEach(t => { clearTimeout(t); clearInterval(t); }); this.timers = {}; }

  open() {
    this.setStatus(this.attempts ? 'reconnecting' : 'connecting');
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'heartbeat_ack') { this.clockSample(msg); return; }
      if (msg.type === 'hello') {
        this.ready = true;
        this.attempts = 0;
        if (this.bestRtt === Infinity) this.offset = msg.serverTime - Date.now();
        this.setStatus('connected');
        this.syncClock();
        this.timers.beat = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
        const queued = this.queue; this.queue = [];
        queued.forEach(m => ws.send(m));
      }
      this.onMessage(msg);
    };
    ws.onclose = e => {
      this.ws = null;
      this.ready = false;
      clearInterval(this.timers.beat);
      if (this.stopped) return;
      if (e.code === 4401) { this.setStatus('disconnected'); this.onMessage({ type: 'unauthorized' }); return; }
      this.scheduleRetry();
    };
  }

  /** Exponential backoff with jitter, so a restarting server isn't hammered by every tab at once. */
  scheduleRetry() {
    if (this.attempts >= MAX_ATTEMPTS) { this.setStatus('disconnected'); return; }
    const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** this.attempts) * (0.6 + Math.random() * 0.4);
    this.attempts++;
    this.setStatus('reconnecting');
    this.timers.retry = setTimeout(() => this.open(), delay);
  }

  send(type, data = {}) {
    const msg = JSON.stringify({ type, ...data });
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) { this.ws.send(msg); return true; }
    // Progress is only useful live; actions wait for the connection to come back.
    if (QUEUEABLE.has(type)) {
      const keep = LATEST_WINS.has(type) ? this.queue.filter(m => JSON.parse(m).type !== type) : this.queue;
      this.queue = [...keep, msg].slice(-20);
    }
    if (this.status === 'disconnected') this.reconnectNow();
    return false;
  }

  heartbeat() { if (this.ready) this.ws.send(JSON.stringify({ type: 'heartbeat', t: Date.now() })); }

  /** A few quick pings right after connecting give a good clock estimate before any race starts. */
  syncClock() {
    this.heartbeat();
    this.timers.sync1 = setTimeout(() => this.heartbeat(), 400);
    this.timers.sync2 = setTimeout(() => this.heartbeat(), 900);
  }

  clockSample({ t, serverTime }) {
    if (typeof t !== 'number') return;
    const now = Date.now(), rtt = now - t;
    // The sample with the shortest round trip has the least uncertainty, but drift is allowed to win slowly.
    if (rtt <= this.bestRtt * 1.5 || rtt < 60) {
      this.bestRtt = Math.min(this.bestRtt, rtt);
      this.offset = serverTime - (t + rtt / 2);
    }
  }

  serverNow() { return Date.now() + this.offset; }
}
