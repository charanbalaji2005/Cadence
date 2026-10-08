import crypto from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { findActiveSession } from '../middleware/auth.js';
import { hub as defaultHub } from './hub.js';
import { RoomManager } from './rooms.js';
import { mongoStore } from './store.js';
import { clientMessages, RoomError, ERRORS } from './protocol.js';
import { registry } from './registry.js';

export const WS_PATH = '/api/ws';
// Changes on every restart, so a client can tell its room was lost with the old process.
const BOOT_ID = crypto.randomBytes(6).toString('hex');

const PING_MS = 30000;
const BUCKET = { size: 40, perSecond: 20 }; // per socket; progress is ~3 msgs/s, so this only stops floods
const LIMITS = {                            // per user, per minute
  create_room: 8, rematch: 8, join_room: 30, invite: 30, decline_invite: 30, update_settings: 60
};

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/** Same session cookie as the REST API, so identity always comes from the server, never the client. */
export async function userFromUpgrade(req) {
  const session = await findActiveSession(readCookie(req.headers.cookie, config.cookieName));
  if (!session) return null;
  // Remembered on the socket so revoking one session closes only that session's sockets.
  session.user.$locals.sessionId = session._id.toString();
  return session.user;
}

/** Blocks other sites from opening a socket with a visitor's cookie. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser, so no visitor's cookie to ride on
  if (config.clientOrigins.includes(origin)) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function reject(socket, status) {
  socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

class WindowLimiter {
  constructor() { this.hits = new Map(); }
  allow(key, max, windowMs = 60000) {
    const now = Date.now();
    let h = this.hits.get(key);
    if (!h || now - h.start > windowMs) this.hits.set(key, (h = { start: now, n: 0 }));
    return ++h.n <= max;
  }
  prune(windowMs = 60000) { const now = Date.now(); for (const [k, h] of this.hits) if (now - h.start > windowMs) this.hits.delete(k); }
}

function takeToken(ws) {
  const now = Date.now();
  ws.tokens = Math.min(BUCKET.size, ws.tokens + ((now - ws.refilledAt) / 1000) * BUCKET.perSecond);
  ws.refilledAt = now;
  if (ws.tokens < 1) return false;
  ws.tokens -= 1;
  return true;
}

/**
 * Attaches the competition WebSocket endpoint to the existing HTTP server.
 * No separate service: one Render instance serves the API, the client and the sockets.
 */
export function attachRealtime(server, { store = mongoStore, hub = defaultHub, authenticate = userFromUpgrade, timing, log = console, track } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });
  const rooms = new RoomManager({ send: (id, msg) => hub.send(id, msg), isOnline: id => hub.isOnline(id), store, timing, log, track });
  registry.rooms = rooms;
  const limiter = new WindowLimiter();
  const send = (ws, msg) => hub.sendToSocket(ws, msg);
  const sendError = (ws, code, ref, message) => send(ws, { type: 'error', code, ref, message: message || ERRORS[code] || ERRORS.SERVER });

  server.on('upgrade', async (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { /* malformed url */ }
    if (pathname !== WS_PATH) { socket.destroy(); return; }
    socket.on('error', () => {});
    if (!originAllowed(req)) { reject(socket, 403); return; }
    let user = null;
    try { user = await authenticate(req); } catch (err) { log.error('Socket auth failed:', err.message); reject(socket, 500); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      // Accept, then explain and close, so the browser can tell "signed out" from "network down".
      if (!user) { send(ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Log in to compete.' }); ws.close(4401, 'Unauthorized'); return; }
      onConnection(ws, user);
    });
  });

  async function onConnection(ws, user) {
    const me = { id: user._id.toString(), username: user.username, avatar: user.avatar || '' };
    ws.sessionId = user.$locals?.sessionId || '';
    ws.isAlive = true;
    ws.tokens = BUCKET.size;
    ws.refilledAt = Date.now();
    ws.warnedAt = 0;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
    ws.on('close', () => { if (!hub.remove(me.id, ws)) rooms.onDisconnect(me.id); });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      if (!takeToken(ws)) {
        if (Date.now() - ws.warnedAt > 2000) { ws.warnedAt = Date.now(); sendError(ws, 'RATE_LIMITED'); }
        return;
      }
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { sendError(ws, 'BAD_REQUEST'); return; }
      handle(ws, me, msg);
    });

    hub.add(me.id, ws);
    const info = rooms.onConnect(me);
    let friendRequests = 0;
    try { friendRequests = await store.pendingRequests(me.id); } catch { /* the friends page will load it */ }
    send(ws, { type: 'hello', bootId: BOOT_ID, serverTime: Date.now(), user: { id: me.id, username: me.username }, room: info.room, invites: info.invites, friendRequests });
  }

  async function handle(ws, me, msg) {
    const type = msg && typeof msg.type === 'string' ? msg.type : '';
    const schema = clientMessages[type];
    if (!schema) { sendError(ws, 'BAD_REQUEST', type); return; }
    const parsed = schema.safeParse(msg);
    if (!parsed.success) { sendError(ws, 'BAD_REQUEST', type, parsed.error.issues[0]?.message); return; }
    if (LIMITS[type] && !limiter.allow(`${me.id}:${type}`, LIMITS[type])) { sendError(ws, 'RATE_LIMITED', type); return; }
    const d = parsed.data;
    try {
      switch (type) {
        case 'heartbeat': send(ws, { type: 'heartbeat_ack', t: d.t, serverTime: Date.now() }); break;
        case 'sync': {
          const room = rooms.roomFor(me.id);
          send(ws, { type: 'room_state', room: room ? rooms.snapshot(room) : null });
          send(ws, { type: 'invites', invites: rooms.invitesFor(me.id) });
          break;
        }
        case 'create_room': await rooms.create(me, d.settings, d.invite); break;
        case 'join_room': await rooms.join(me, d.code); break;
        case 'leave_room': rooms.leave(me.id); hub.send(me.id, { type: 'room_left' }); break;
        case 'ready': rooms.setReady(me.id, d.ready); break;
        case 'update_settings': rooms.updateSettings(me.id, d.settings); break;
        case 'start_room': rooms.start(me.id); break;
        case 'cancel_room': rooms.cancel(me.id); break;
        case 'rematch': await rooms.rematch(me); break;
        case 'invite': await rooms.invite(me, d.userId); break;
        case 'decline_invite': rooms.declineInvite(me, d.code); break;
        case 'progress': rooms.progress(me.id, d); break;
        case 'finish': rooms.finish(me.id, d); break;
        default: sendError(ws, 'BAD_REQUEST', type);
      }
    } catch (err) {
      if (err instanceof RoomError) sendError(ws, err.code, type, err.message);
      else { log.error('Realtime error:', err); sendError(ws, 'SERVER', type); }
    }
  }

  // Drop sockets that stopped answering (closed laptop, lost network) so they don't linger.
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
    limiter.prune();
  }, PING_MS);
  pinger.unref?.();

  return {
    wss, rooms, hub, bootId: BOOT_ID,
    /** Warns players their room is ending, then closes every socket. Used on deploys and restarts. */
    shutdown() {
      clearInterval(pinger);
      rooms.shutdown();
      for (const ws of wss.clients) ws.close(1012, 'Server restarting');
    }
  };
}
