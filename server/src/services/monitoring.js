import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { SystemError, ErrorEvent } from '../models/SystemError.js';
import { notifyAdmins } from './events.js';
import { scrub } from '../utils/privacy.js';

/* ---------- errors ---------- */

const normalize = msg => String(msg || '').replace(/[a-f0-9]{24}/gi, ':id').replace(/\d+/g, '#').slice(0, 200);

/**
 * Stores an error grouped with its repeats. Message and stack are scrubbed of tokens,
 * cookies and emails first. ctx: { source, route, method, requestId, severity }
 */
export async function captureError(err, ctx = {}) {
  // Failures inside are caught and logged, never re-captured, so this can't recurse.
  if (mongoose.connection.readyState !== 1) return;
  try {
    const source = ctx.source || 'server';
    const type = String(err?.name || err?.constructor?.name || 'Error').slice(0, 60);
    const isDb = /Mongo|Mongoose/.test(type) || /ECONNREFUSED|topology|server selection/i.test(err?.message || '');
    const severity = ctx.severity || (isDb ? 'critical' : source === 'server' ? 'high' : 'medium');
    const route = String(ctx.route || '').split('?')[0].replace(/[a-f0-9]{24}/gi, ':id').slice(0, 120);
    const message = scrub(err?.message || String(err), 500);
    const fingerprint = crypto.createHash('sha1').update(`${source}|${type}|${normalize(message)}|${route}`).digest('hex');
    const now = new Date();
    const doc = await SystemError.findOneAndUpdate(
      { fingerprint },
      {
        $inc: { count: 1 },
        $set: { lastSeen: now, lastRequestId: ctx.requestId || '' },
        $setOnInsert: { fingerprint, source, type, message, route, severity, stack: scrub(err?.stack || '', 4000), firstSeen: now }
      },
      { upsert: true, new: true }
    );
    // A resolved error that comes back is open again.
    if (doc.status === 'resolved') await SystemError.updateOne({ _id: doc._id }, { $set: { status: 'open' } });
    await ErrorEvent.create({ fingerprint, at: now });
    if (doc.count === 1 && (severity === 'critical' || severity === 'high')) {
      notifyAdmins({ type: isDb ? 'database' : 'error', severity: severity === 'critical' ? 'critical' : 'warning', title: isDb ? 'Database error' : `New ${source} error: ${type}`, body: message.slice(0, 160), link: '/admin/system/errors', dedupeKey: `err:${fingerprint}` });
    }
  } catch (e) {
    console.error('Could not record error:', e.message);
  }
}

/* ---------- request metrics (in memory, last hour) ---------- */

const MINUTES = 60;
const buckets = new Map(); // minute timestamp -> { n, errors, ms }
const recent = [];         // latest durations for percentiles
const startedAt = Date.now();

export function metricsMiddleware(req, res, next) {
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/t/')) return next();
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const minute = Math.floor(Date.now() / 60000) * 60000;
    const b = buckets.get(minute) || { n: 0, errors: 0, ms: 0 };
    b.n++; b.ms += ms; if (res.statusCode >= 500) b.errors++;
    buckets.set(minute, b);
    recent.push(ms); if (recent.length > 1000) recent.shift();
    if (buckets.size > MINUTES + 5) for (const k of buckets.keys()) if (k < minute - MINUTES * 60000) buckets.delete(k);
  });
  next();
}

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function apiMetrics() {
  const now = Math.floor(Date.now() / 60000) * 60000;
  const series = [];
  let n5 = 0, e5 = 0, n60 = 0, e60 = 0, ms60 = 0;
  for (let i = MINUTES - 1; i >= 0; i--) {
    const t = now - i * 60000, b = buckets.get(t) || { n: 0, errors: 0, ms: 0 };
    series.push({ t, requests: b.n, errors: b.errors, avgMs: b.n ? Math.round(b.ms / b.n) : 0 });
    n60 += b.n; e60 += b.errors; ms60 += b.ms;
    if (i < 5) { n5 += b.n; e5 += b.errors; }
  }
  return {
    requestsLastHour: n60, errorsLastHour: e60, requestsLast5Min: n5,
    errorRate5Min: n5 ? e5 / n5 : 0, errorRateHour: n60 ? e60 / n60 : 0,
    avgMs: n60 ? Math.round(ms60 / n60) : 0, p50Ms: Math.round(pct(recent, 0.5)), p95Ms: Math.round(pct(recent, 0.95)),
    series
  };
}

/* ---------- process / host ---------- */

let lastCpu = process.cpuUsage(), lastCpuAt = process.hrtime.bigint(), cpuPercent = 0;
const sampler = setInterval(() => {
  const now = process.hrtime.bigint(), usage = process.cpuUsage(lastCpu);
  const elapsedUs = Number(now - lastCpuAt) / 1000;
  cpuPercent = elapsedUs ? Math.min(100, ((usage.user + usage.system) / elapsedUs / os.cpus().length) * 100) : 0;
  lastCpu = process.cpuUsage(); lastCpuAt = now;
}, 5000);
sampler.unref();

export async function hostMetrics() {
  const mem = process.memoryUsage();
  let disk = null;
  try {
    const st = await fs.promises.statfs(process.cwd());
    disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch { /* statfs not available on this platform */ }
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    cpus: os.cpus().length,
    loadAvg: os.loadavg(),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, systemTotal: os.totalmem(), systemFree: os.freemem() },
    disk,
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`
  };
}

export async function databaseHealth() {
  const state = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  if (mongoose.connection.readyState !== 1) return { status: 'down', state, pingMs: null };
  const t0 = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    const pingMs = Date.now() - t0;
    const stats = await mongoose.connection.db.stats();
    return {
      status: pingMs > 500 ? 'degraded' : 'ok', state, pingMs,
      name: mongoose.connection.name, collections: stats.collections, objects: stats.objects,
      dataSize: stats.dataSize, storageSize: stats.storageSize, indexSize: stats.indexSize
    };
  } catch (err) {
    return { status: 'down', state, pingMs: null, error: scrub(err.message, 200) };
  }
}

export async function errorCounts() {
  const now = Date.now();
  const [hour, day, week] = await Promise.all([1, 24, 168].map(h => ErrorEvent.countDocuments({ at: { $gte: new Date(now - h * 3600e3) } })));
  return { hour, day, week };
}
