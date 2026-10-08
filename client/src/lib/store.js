import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { local, pbKey } from './format.js';

/**
 * Results, key stats and personal bests for whoever is using the app.
 * Signed-in users: MongoDB through the API. Guests: this browser's localStorage.
 */
const G = { results: 'tf:guest:results', keys: 'tf:guest:keys', bests: 'tf:guest:bests' };
const pendingKey = id => `tf:pending:${id}`;
const listeners = new Set();
let state = { owner: null, results: [], keyStats: {}, bests: {}, loading: true, error: null };

const emit = () => listeners.forEach(f => f());
const set = patch => { state = { ...state, ...patch }; emit(); };
export const getData = () => state;
export const useData = () => useSyncExternalStore(fn => (listeners.add(fn), () => listeners.delete(fn)), getData);

const slim = r => ({ wpm: r.wpm, raw: r.raw, acc: r.acc, consistency: r.consistency, mode: r.mode, mode2: r.mode2, punctuation: r.punctuation, numbers: r.numbers, elapsed: r.elapsed, chars: r.chars, date: r.date, ...(r.language && r.language !== 'english' ? { language: r.language } : {}) });
const forServer = r => ({ ...slim(r), keyStats: r.keyStats || {}, ...(r.clientId ? { clientId: r.clientId } : {}) });
function mergeKeys(into, ks) {
  const out = { ...into };
  for (const k in ks) { const a = { ...(out[k] || { n: 0, e: 0, ms: 0, mc: 0 }) }; a.n += ks[k].n; a.e += ks[k].e; a.ms += ks[k].ms; a.mc += ks[k].mc; out[k] = a; }
  return out;
}
function localPb(bests, r) {
  if ((r.mode !== 'time' && r.mode !== 'words') || r.acc < 50) return { bests, pb: null };
  const key = pbKey(r), prev = bests[key];
  if (prev && prev.wpm >= r.wpm) return { bests, pb: null };
  return { bests: { ...bests, [key]: { wpm: r.wpm, acc: r.acc, raw: r.raw, consistency: r.consistency, date: r.date } }, pb: { key, previous: prev ? prev.wpm : null } };
}

export async function loadFor(user) {
  if (!user) {
    set({ owner: 'guest', results: local.get(G.results, []), keyStats: local.get(G.keys, {}), bests: local.get(G.bests, {}), loading: false, error: null });
    return;
  }
  set({ owner: user.id, results: [], keyStats: {}, bests: {}, loading: true, error: null });
  await flushPending(user);
  try {
    const [r, k] = await Promise.all([api('/results?limit=2000'), api('/me/keys')]);
    if (state.owner !== user.id) return;
    set({ results: r.results, keyStats: k.keyStats, bests: k.personalBests, loading: false });
  } catch (err) {
    if (state.owner === user.id) set({ loading: false, error: err.message });
  }
}

async function flushPending(user) {
  const pending = local.get(pendingKey(user.id), []);
  if (!pending.length) return;
  const left = [];
  for (const r of pending) { try { await api('/results', { method: 'POST', body: forServer(r) }); } catch { left.push(r); } }
  if (left.length) local.set(pendingKey(user.id), left); else local.del(pendingKey(user.id));
}

/** Saves a finished test. Returns { pb, leaderboard, offline }. */
export async function saveResult(user, r) {
  if (!r.clientId && window.crypto?.randomUUID) r = { ...r, clientId: window.crypto.randomUUID() };
  const { bests, pb } = localPb(state.bests, r);
  set({ results: [...state.results, slim(r)], keyStats: mergeKeys(state.keyStats, r.keyStats), bests });
  if (!user) {
    local.set(G.results, state.results.slice(-1000)); local.set(G.keys, state.keyStats); local.set(G.bests, state.bests);
    return { pb, leaderboard: null };
  }
  try {
    const res = await api('/results', { method: 'POST', body: forServer(r) });
    return { pb: res.pb || pb, leaderboard: res.leaderboard };
  } catch (err) {
    if (err.status === 401) return { pb, leaderboard: null, error: 'Your session ended. Log in again to save results.' };
    local.set(pendingKey(user.id), [...local.get(pendingKey(user.id), []), forServer(r)].slice(-200));
    return { pb, leaderboard: null, offline: true };
  }
}

/** Adds a result the server already saved (a competition race) so stats and achievements update without a reload. */
export function recordSavedResult(r) {
  const { bests, pb } = localPb(state.bests, r);
  set({ results: [...state.results, { ...slim(r), ...(r.race ? { race: r.race } : {}) }], keyStats: mergeKeys(state.keyStats, r.keyStats || {}), bests });
  return pb;
}

/** Moves guest results into a newly signed-in account. Returns how many were moved. */
export async function importGuest() {
  const results = local.get(G.results, []);
  if (!results.length) return 0;
  const keys = local.get(G.keys, {});
  const payload = results.slice(-500).map((r, i) => ({ ...forServer(r), keyStats: i === 0 ? clampKeys(keys) : {} }));
  await api('/results/import', { method: 'POST', body: { results: payload } });
  [G.results, G.keys, G.bests].forEach(local.del);
  return payload.length;
}
function clampKeys(ks) {
  const out = {};
  for (const k in ks) if (/^[a-z0-9]$/.test(k)) out[k] = { n: Math.min(ks[k].n, 100000), e: Math.min(ks[k].e, 100000), ms: Math.min(ks[k].ms, 1e8), mc: Math.min(ks[k].mc, 100000) };
  return out;
}

export async function clearAll(user) {
  if (user) await api('/results', { method: 'DELETE' });
  else [G.results, G.keys, G.bests].forEach(local.del);
  set({ results: [], keyStats: {}, bests: {} });
}
