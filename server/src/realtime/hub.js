/**
 * Who is connected right now. A user can have several tabs open, so each user maps
 * to a set of sockets. Everything here is in memory: a restart simply empties it.
 */
const OPEN = 1;
// A client this far behind on reading is stalled; skip it rather than buffer without limit.
const MAX_BUFFERED = 512 * 1024;

export class Hub {
  constructor() { this.sockets = new Map(); }

  add(userId, ws) {
    let set = this.sockets.get(userId);
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(ws);
    return set.size;
  }

  /** Returns how many sockets the user still has open. */
  remove(userId, ws) {
    const set = this.sockets.get(userId);
    if (!set) return 0;
    set.delete(ws);
    if (!set.size) this.sockets.delete(userId);
    return set.size;
  }

  isOnline(userId) { return this.sockets.has(String(userId)); }

  get connectionCount() { let n = 0; for (const set of this.sockets.values()) n += set.size; return n; }

  send(userId, msg) {
    const set = this.sockets.get(String(userId));
    if (!set) return;
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of set) if (ws.readyState === OPEN && ws.bufferedAmount < MAX_BUFFERED) ws.send(data);
  }

  sendToSocket(ws, msg) {
    if (ws.readyState === OPEN) ws.send(JSON.stringify(msg));
  }

  forEachSocket(fn) { for (const set of this.sockets.values()) for (const ws of set) fn(ws); }
}

export const hub = new Hub();
