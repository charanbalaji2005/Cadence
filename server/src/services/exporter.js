import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Result } from '../models/Result.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { SecurityEvent } from '../models/SecurityEvent.js';
import { ActivityEvent } from '../models/ActivityEvent.js';
import { AuditLog } from '../models/AuditLog.js';
import { PageView, VisitorSession } from '../models/Analytics.js';
import { CompetitionRoom } from '../models/CompetitionRoom.js';
import { ExportJob } from '../models/AdminData.js';
import { buildXlsx, csvCell } from '../utils/xlsx.js';
import { getSettings } from './settings.js';

export const EXPORT_DIR = path.join(os.tmpdir(), 'cadence-exports');
const BATCH = 500;
const XLSX_MAX_ROWS = 100000;
const iso = d => (d ? new Date(d).toISOString() : '');
const sessionStatus = s => (s.revokedAt ? 'revoked' : s.expiresAt < new Date() ? 'expired' : 'active');

/** Looks up usernames for a batch in one query (no per-row lookups). */
async function usernames(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  if (!list.length) return new Map();
  const users = await User.find({ _id: { $in: list } }).select('username').lean();
  return new Map(users.map(u => [String(u._id), u.username]));
}

const dateRange = (f, field) => (f.from || f.to ? { [field]: { ...(f.from ? { $gte: new Date(f.from) } : {}), ...(f.to ? { $lte: new Date(f.to) } : {}) } } : {});

/**
 * What each export contains. Secrets never appear: no password hashes, session tokens,
 * OAuth tokens or settings payloads. Emails appear only in the users export.
 */
export const KINDS = {
  users: {
    model: User, date: 'createdAt',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.status ? { status: f.status } : {}), ...(f.role ? { role: f.role } : {}), ...(f.provider ? { provider: f.provider } : {}) }),
    select: 'username email role status provider githubLogin signupCountry createdAt lastLoginAt lastActiveAt suspension deletedAt',
    columns: ['id', 'username', 'email', 'role', 'status', 'provider', 'githubLogin', 'country', 'createdAt', 'lastLoginAt', 'lastActiveAt', 'suspendedReason', 'deletedAt'],
    row: u => ({ id: String(u._id), username: u.username, email: u.email, role: u.role || 'USER', status: u.status || 'active', provider: u.provider, githubLogin: u.githubLogin || '', country: u.signupCountry || '', createdAt: iso(u.createdAt), lastLoginAt: iso(u.lastLoginAt), lastActiveAt: iso(u.lastActiveAt), suspendedReason: u.suspension?.reason || '', deletedAt: iso(u.deletedAt) })
  },
  logins: {
    model: LoginEvent, date: 'createdAt',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.type ? { type: f.type } : {}), ...(f.provider ? { provider: f.provider } : {}), ...(f.user ? { user: f.user } : {}) }),
    columns: ['time', 'type', 'success', 'username', 'identifier', 'provider', 'reason', 'risk', 'ip', 'device', 'browser', 'os', 'country', 'sessionId'],
    row: e => ({ time: iso(e.createdAt), type: e.type, success: e.success, username: e.username, identifier: e.identifier, provider: e.provider, reason: e.reason, risk: e.risk, ip: e.ip, device: e.device, browser: e.browser, os: e.os, country: e.country, sessionId: e.session ? String(e.session) : '' })
  },
  sessions: {
    model: Session, date: 'createdAt', users: 'user',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.user ? { user: f.user } : {}), ...(f.status === 'revoked' ? { revokedAt: { $exists: true } } : f.status === 'active' ? { revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } } : {}) }),
    select: '-tokenHash',
    columns: ['id', 'username', 'status', 'createdAt', 'lastActiveAt', 'expiresAt', 'revokedAt', 'revokedReason', 'provider', 'ip', 'device', 'browser', 'os', 'country'],
    row: (s, names) => ({ id: String(s._id), username: names.get(String(s.user)) || '', status: sessionStatus(s), createdAt: iso(s.createdAt), lastActiveAt: iso(s.lastActiveAt), expiresAt: iso(s.expiresAt), revokedAt: iso(s.revokedAt), revokedReason: s.revokedReason || '', provider: s.provider || '', ip: s.ip || '', device: s.device || '', browser: s.browser || '', os: s.os || '', country: s.country || '' })
  },
  visitors: {
    model: VisitorSession, date: 'startedAt', users: 'user',
    filter: f => ({ ...dateRange(f, 'startedAt'), ...(f.device ? { device: f.device } : {}) }),
    columns: ['visitorId', 'sessionId', 'username', 'startedAt', 'lastSeenAt', 'durationSeconds', 'pages', 'entry', 'exit', 'source', 'referrer', 'returning', 'device', 'browser', 'os', 'country', 'screen'],
    row: (v, names) => ({ visitorId: v.vid, sessionId: v.sid, username: v.user ? names.get(String(v.user)) || '' : '', startedAt: iso(v.startedAt), lastSeenAt: iso(v.lastSeenAt), durationSeconds: Math.round((v.lastSeenAt - v.startedAt) / 1000), pages: v.pages, entry: v.entryRoute, exit: v.exitRoute, source: v.source, referrer: v.referrer, returning: v.returning, device: v.device, browser: v.browser, os: v.os, country: v.country, screen: v.screen })
  },
  pageviews: {
    model: PageView, date: 'createdAt', users: 'user',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.route ? { route: f.route } : {}) }),
    columns: ['time', 'route', 'visitorId', 'sessionId', 'username', 'durationSeconds', 'device', 'browser', 'os', 'country'],
    row: (p, names) => ({ time: iso(p.createdAt), route: p.route, visitorId: p.vid, sessionId: p.sid, username: p.user ? names.get(String(p.user)) || '' : '', durationSeconds: Math.round((p.durationMs || 0) / 1000), device: p.device, browser: p.browser, os: p.os, country: p.country })
  },
  activity: {
    model: ActivityEvent, date: 'createdAt', users: 'actor',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.type ? { type: f.type } : {}), ...(f.user ? { user: f.user } : {}) }),
    columns: ['time', 'type', 'username', 'actor', 'target', 'result', 'metadata'],
    row: (a, names) => ({ time: iso(a.createdAt), type: a.type, username: a.username, actor: a.actor ? names.get(String(a.actor)) || String(a.actor) : '', target: a.target, result: a.result, metadata: JSON.stringify(a.metadata || {}) })
  },
  audit: {
    model: AuditLog, date: 'at', sort: { seq: 1 },
    filter: f => ({ ...dateRange(f, 'at'), ...(f.type ? { action: f.type } : {}) }),
    columns: ['seq', 'time', 'actor', 'action', 'targetType', 'targetId', 'target', 'reason', 'metadata', 'ip', 'hash', 'prevHash'],
    row: a => ({ seq: a.seq, time: iso(a.at), actor: a.actorLabel, action: a.action, targetType: a.targetType, targetId: a.targetId, target: a.targetLabel, reason: a.reason, metadata: JSON.stringify(a.metadata || {}), ip: a.ip, hash: a.hash, prevHash: a.prevHash })
  },
  security: {
    model: SecurityEvent, date: 'createdAt', users: 'user',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.severity ? { severity: f.severity } : {}), ...(f.type ? { type: f.type } : {}) }),
    columns: ['firstSeen', 'lastSeen', 'type', 'severity', 'title', 'count', 'username', 'identifier', 'ip', 'acknowledged', 'details'],
    row: (s, names) => ({ firstSeen: iso(s.createdAt), lastSeen: iso(s.lastSeenAt), type: s.type, severity: s.severity, title: s.title, count: s.count, username: s.user ? names.get(String(s.user)) || '' : '', identifier: s.identifier, ip: s.ip, acknowledged: !!s.acknowledgedAt, details: JSON.stringify(s.details || {}) })
  },
  competitions: {
    model: CompetitionRoom, date: 'createdAt', users: 'host',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.status ? { status: f.status } : {}) }),
    columns: ['code', 'status', 'host', 'mode', 'detail', 'players', 'createdAt', 'startedAt', 'finishedAt', 'disconnects', 'winner', 'winnerWpm', 'standings'],
    row: (c, names) => {
      const s = c.settings || {}, winner = (c.standings || []).find(x => x.rank === 1);
      return { code: c.roomCode, status: c.status, host: names.get(String(c.host)) || '', mode: s.mode, detail: s.mode === 'time' ? `${s.time}s` : s.mode === 'words' ? `${s.words} words` : s.quoteLen || '', players: (c.players || []).length, createdAt: iso(c.createdAt), startedAt: iso(c.startedAt), finishedAt: iso(c.finishedAt), disconnects: c.disconnects || 0, winner: winner?.username || '', winnerWpm: winner ? Math.round(winner.wpm) : '', standings: (c.standings || []).map(x => `${x.rank}. ${x.username} ${Math.round(x.wpm)}wpm ${x.status}`).join('; ') };
    }
  },
  results: {
    model: Result, date: 'createdAt', users: 'user',
    filter: f => ({ ...dateRange(f, 'createdAt'), ...(f.user ? { user: f.user } : {}), ...(f.type === 'race' ? { race: { $exists: true } } : f.type === 'test' ? { race: { $exists: false } } : {}) }),
    columns: ['time', 'username', 'wpm', 'raw', 'accuracy', 'consistency', 'mode', 'mode2', 'seconds', 'leaderboard', 'raceCode', 'raceRank', 'raceStatus'],
    row: (r, names) => ({ time: iso(r.createdAt), username: names.get(String(r.user)) || '', wpm: r.wpm, raw: r.raw, accuracy: r.acc, consistency: r.consistency, mode: r.mode, mode2: r.mode2, seconds: r.elapsed, leaderboard: !!r.lbEligible, raceCode: r.race?.code || '', raceRank: r.race?.rank ?? '', raceStatus: r.race?.status || '' })
  }
};

const queue = [];
let running = false;

export function enqueueExport(jobId) {
  queue.push(String(jobId));
  if (!running) drain();
}

async function drain() {
  running = true;
  while (queue.length) {
    const id = queue.shift();
    try { await runExport(id); } catch (err) {
      await ExportJob.updateOne({ _id: id }, { $set: { status: 'failed', error: String(err.message).slice(0, 300), finishedAt: new Date() } }).catch(() => {});
    }
  }
  running = false;
}

/** Streams rows in batches to a private temp file, reporting progress as it goes. */
async function runExport(id) {
  const job = await ExportJob.findById(id);
  if (!job || job.status !== 'queued') return;
  const def = KINDS[job.kind];
  const filter = def.filter(job.filters || {});
  const total = await def.model.countDocuments(filter);
  if (job.format === 'xlsx' && total > XLSX_MAX_ROWS) throw new Error(`XLSX exports are limited to ${XLSX_MAX_ROWS.toLocaleString()} rows. Use CSV for this export.`);
  await fs.promises.mkdir(EXPORT_DIR, { recursive: true });
  const file = path.join(EXPORT_DIR, `${job._id}.${job.format}`);
  await ExportJob.updateOne({ _id: id }, { $set: { status: 'running', total, file } });

  const out = job.format === 'xlsx' ? null : fs.createWriteStream(file, { encoding: 'utf8' });
  const write = s => new Promise((resolve, reject) => { if (out.write(s)) resolve(); else { out.once('drain', resolve); out.once('error', reject); } });
  const xlsxRows = [];
  if (job.format === 'csv') await write(`﻿${def.columns.join(',')}\n`); // BOM so Excel reads UTF-8
  if (job.format === 'json') await write('[\n');

  let rows = 0, batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const names = def.users ? await usernames(batch.map(d => d[def.users])) : new Map();
    for (const doc of batch) {
      const r = def.row(doc, names);
      if (job.format === 'csv') await write(`${def.columns.map(c => csvCell(r[c])).join(',')}\n`);
      else if (job.format === 'json') await write(`${rows ? ',\n' : ''}${JSON.stringify(r)}`);
      else xlsxRows.push(r);
      rows++;
    }
    batch = [];
    await ExportJob.updateOne({ _id: id }, { $set: { rows, progress: total ? Math.round((rows / total) * 100) : 100 } });
  };

  let q = def.model.find(filter).sort(def.sort || { [def.date]: -1 }).lean();
  if (def.select) q = q.select(def.select);
  for await (const doc of q.cursor({ batchSize: BATCH })) {
    batch.push(doc);
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  if (job.format === 'xlsx') await fs.promises.writeFile(file, buildXlsx(def.columns, xlsxRows, job.kind));
  else {
    if (job.format === 'json') await write('\n]\n');
    await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
  }
  const { size } = await fs.promises.stat(file);
  const hours = (await getSettings()).retention.exportHours;
  await ExportJob.updateOne({ _id: id }, { $set: { status: 'done', progress: 100, rows, bytes: size, finishedAt: new Date(), expiresAt: new Date(Date.now() + hours * 3600e3) } });
}

/** Deletes expired export files. On startup, jobs the previous process didn't finish are marked failed. */
export async function cleanupExports({ startup = false } = {}) {
  if (mongoose.connection.readyState !== 1) return;
  if (startup) await ExportJob.updateMany({ status: { $in: ['queued', 'running'] } }, { $set: { status: 'failed', error: 'The server restarted before this export finished. Start it again.' } });
  const expired = await ExportJob.find({ status: 'done', expiresAt: { $lt: new Date() } });
  for (const j of expired) {
    await fs.promises.rm(j.file, { force: true }).catch(() => {});
    j.status = 'expired'; await j.save();
  }
  // Files lost with a restart (Render's disk is not persistent).
  const done = await ExportJob.find({ status: 'done' }).select('file');
  for (const j of done) if (!fs.existsSync(j.file)) await ExportJob.updateOne({ _id: j._id }, { $set: { status: 'expired', error: 'The file is no longer available.' } });
}
