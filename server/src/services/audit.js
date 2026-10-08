import crypto from 'node:crypto';
import { AuditLog } from '../models/AuditLog.js';
import { clientIp, scrub } from '../utils/privacy.js';

const GENESIS = 'GENESIS';

/** Sorted-key JSON, so the same record always hashes the same way. */
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

/** Metadata is stored as plain JSON (no Dates or ObjectIds) so it hashes identically after a round trip. */
function plain(meta) {
  return JSON.parse(JSON.stringify(meta || {}, (_k, v) => (typeof v === 'string' ? scrub(v, 500) : v)));
}

export function hashRecord(r) {
  const body = stable([r.seq, r.actor ? String(r.actor) : '', r.actorLabel, r.action, r.targetType || '', String(r.targetId || ''), r.targetLabel || '', r.reason || '', r.metadata || {}, r.ip || '', new Date(r.at).toISOString(), r.prevHash]);
  return crypto.createHash('sha256').update(body).digest('hex');
}

// One writer at a time, so each record links to the one before it.
let queue = Promise.resolve();

async function append(entry, attempt = 0) {
  const last = await AuditLog.findOne().sort({ seq: -1 }).select('seq hash').lean();
  const doc = {
    seq: (last?.seq || 0) + 1,
    actor: entry.actor?._id,
    actorLabel: entry.actor ? `${entry.actor.username} (${entry.actor.role || 'USER'})` : 'system',
    action: entry.action,
    targetType: entry.targetType || '',
    targetId: String(entry.targetId || ''),
    targetLabel: entry.targetLabel || '',
    reason: entry.reason ? scrub(entry.reason, 500) : '',
    metadata: plain(entry.metadata),
    ip: entry.req ? clientIp(entry.req) : (entry.ip || ''),
    at: new Date(),
    prevHash: last?.hash || GENESIS
  };
  doc.hash = hashRecord(doc);
  try {
    return await AuditLog.create(doc);
  } catch (err) {
    // Another process took this sequence number: retry on top of it.
    if (err?.code === 11000 && attempt < 3) return append(entry, attempt + 1);
    throw err;
  }
}

/**
 * Records an administrative action. Resolves once written; callers that must not fail
 * because of auditing can still await it, since an unaudited admin action is worse.
 * entry: { actor, action, targetType, targetId, targetLabel, reason, metadata, req }
 */
export function audit(entry) {
  const run = queue.then(() => append(entry));
  queue = run.catch(() => {});
  return run;
}

/** Walks the whole chain and reports the first record whose hash or link doesn't match. */
export async function verifyAuditChain() {
  let prev = GENESIS, expectedSeq = 1, checked = 0;
  for await (const r of AuditLog.find().sort({ seq: 1 }).lean().cursor()) {
    if (r.seq !== expectedSeq) return { ok: false, checked, brokenAt: r.seq, problem: `Record ${expectedSeq} is missing.` };
    if (r.prevHash !== prev) return { ok: false, checked, brokenAt: r.seq, problem: 'Link to the previous record does not match.' };
    if (hashRecord(r) !== r.hash) return { ok: false, checked, brokenAt: r.seq, problem: 'Record contents were changed after it was written.' };
    prev = r.hash; expectedSeq++; checked++;
  }
  return { ok: true, checked, brokenAt: null, problem: null };
}
