import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { IdentityBinding } from '../../models/IdentityBinding.js';
import { User } from '../../models/User.js';
import { AuditLog } from '../../models/AuditLog.js';
import { requirePermission, can, canActOn } from '../../middleware/admin.js';
import { audit } from '../../services/audit.js';
import { getSrmapSettings, readiness, adminView, updateSrmapSettings, saveLastTest } from '../../services/srmap/settings.js';
import { testConnection } from '../../services/srmap/provider.js';
import { unbind, hasOtherSignIn, syncProfile, syncSummary } from '../../services/srmap/bindings.js';
import { normalizeRegisterNumber, parseRegisterNumber } from '../../services/srmap/regno.js';
import { hashIdentifier, maskMiddle } from '../../utils/privacy.js';
import { paging, paged, escapeRe, isId, bad, body, userRef } from './helpers.js';

/** /api/admin/srmap: Connect SRM AP settings and student bindings. */
const router = Router();
router.use(requirePermission('srmap.view'));

const SYNC_STATES = ['synced', 'pending', 'failed', 'not_found'];
const testLimiter = rateLimit({ windowMs: 60 * 1000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.user._id), message: { error: 'Wait a minute before testing the connection again.' } });

/* ---------- overview and settings ---------- */

router.get('/overview', async (req, res) => {
  const s = await getSrmapSettings();
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [active, unbound, lastWeek, byBatch, bySync] = await Promise.all([
    IdentityBinding.countDocuments({ provider: 'srm_ap', active: true }),
    IdentityBinding.countDocuments({ provider: 'srm_ap', active: false }),
    IdentityBinding.countDocuments({ provider: 'srm_ap', active: true, boundAt: { $gte: weekAgo } }),
    IdentityBinding.aggregate([{ $match: { provider: 'srm_ap', active: true } }, { $group: { _id: '$batchYear', n: { $sum: 1 } } }, { $sort: { _id: -1 } }]),
    IdentityBinding.aggregate([{ $match: { provider: 'srm_ap', active: true } }, { $group: { _id: { $ifNull: ['$profileSync.status', 'pending'] }, n: { $sum: 1 } } }])
  ]);
  const sync = Object.fromEntries(SYNC_STATES.map(k => [k, bySync.find(x => x._id === k)?.n || 0]));
  const ready = readiness(s);
  res.json({
    settings: adminView(s),
    readiness: ready,
    // e.g. "Directory API available; student authentication provider not configured"
    providerStatus: ready.providerStatus,
    canConfigure: can(req.user, 'srmap.configure'),
    canUnbind: can(req.user, 'srmap.unbind'),
    stats: { active, unbound, lastWeek, sync, byBatch: byBatch.map(b => ({ batchYear: b._id ?? null, n: b.n })) },
    // Individual get_student lookups for already-verified students only. The directory is never listed or imported.
    directorySync: { mode: 'individual', note: "After SRM AP verifies a student, Cadence fetches only that student's record (get_student) and saves the approved fields. It never lists or imports the directory, and never creates or links accounts from directory data." }
  });
});

const httpsUrl = z.string().trim().max(500).refine(v => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Use an https:// address.');
const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  directoryUrl: httpsUrl.optional(),
  verifyUrl: httpsUrl.optional(),
  apiKey: z.string().max(512).refine(v => !/\s/.test(v), 'The API key cannot contain spaces.').optional()
}).strict();

router.put('/settings', requirePermission('srmap.configure'), async (req, res) => {
  const d = body(settingsSchema, req, res); if (!d) return;
  const before = await getSrmapSettings();
  const changed = await updateSrmapSettings(d, req.user);
  const after = await getSrmapSettings();
  // The audit record names what changed, never a secret.
  const metadata = Object.fromEntries(changed.map(k => [k, k === 'apiKey' ? (d.apiKey ? 'replaced' : 'removed') : { from: before[k], to: after[k] }]));
  await audit({ actor: req.user, action: 'SRMAP_SETTINGS_CHANGED', targetType: 'integration', targetId: 'srm_ap', targetLabel: 'Connect SRM AP', metadata, req });
  res.json({ settings: adminView(after), readiness: readiness(after) });
});

router.post('/test', requirePermission('srmap.configure'), testLimiter, async (req, res) => {
  const r = await testConnection();
  const summary = { ok: r.results.every(x => x.ok), target: r.results.map(x => x.target).join(','), httpStatus: r.results[0]?.httpStatus, latencyMs: r.results[0]?.latencyMs, message: r.results.map(x => `${x.target}: ${x.message}`).join(' ') };
  await saveLastTest(summary);
  await audit({ actor: req.user, action: 'SRMAP_CONNECTION_TESTED', targetType: 'integration', targetId: 'srm_ap', targetLabel: 'Connect SRM AP', metadata: { ok: summary.ok }, req });
  res.json(r);
});

/* ---------- bindings ---------- */

const row = (b, u) => ({
  id: String(b._id),
  user: u ? { ...userRef(u), status: u.status } : null,
  displayName: b.displayName,
  registerNumberMasked: b.registerNumberMasked || '',
  verifiedEmail: b.verifiedEmail,
  batchYear: b.batchYear ?? null,
  batchSource: b.batchSource,
  active: b.active,
  boundAt: b.boundAt,
  lastAuthenticatedAt: b.lastAuthenticatedAt || null,
  unboundAt: b.unboundAt || null,
  profileSync: syncSummary(b)
});

router.get('/bindings', async (req, res) => {
  const q = req.query;
  const p = paging(q);
  const f = { provider: 'srm_ap', active: q.status === 'unbound' ? false : q.status === 'all' ? { $in: [true, false] } : true };
  if (SYNC_STATES.includes(q.sync)) f['profileSync.status'] = q.sync;
  if (/^\d{4}$/.test(q.batch || '')) f.batchYear = Number(q.batch);
  else if (q.batch === 'unknown') f.batchYear = { $exists: false };
  const term = String(q.q || '').trim().slice(0, 100);
  if (term) {
    const reg = parseRegisterNumber(term);
    const re = new RegExp(escapeRe(term.replace(/^@/, '')), 'i');
    const users = await User.find({ usernameNormalized: re }).select('_id').limit(200).lean();
    f.$or = [{ displayName: re }, { verifiedEmail: re }, { user: { $in: users.map(u => u._id) } }];
    // A full register number is matched by hash; the number itself isn't stored.
    if (reg.ok) f.$or.push({ registerNumberHash: hashIdentifier(normalizeRegisterNumber(term)) });
  }
  const sort = q.sort === 'lastAuthenticatedAt' ? { lastAuthenticatedAt: -1, _id: -1 } : { boundAt: q.dir === 'asc' ? 1 : -1, _id: -1 };
  const [rows, total] = await Promise.all([IdentityBinding.find(f).sort(sort).skip(p.skip).limit(p.limit).select('-history').lean(), IdentityBinding.countDocuments(f)]);
  const users = await User.find({ _id: { $in: rows.map(r => r.user) } }).select('username avatar status').lean();
  const byId = new Map(users.map(u => [String(u._id), u]));
  res.json(paged(rows.map(b => row(b, byId.get(String(b.user)))), total, p));
});

router.get('/bindings/:id', async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Binding not found.', 404);
  const b = await IdentityBinding.findById(req.params.id).lean();
  if (!b) return bad(res, 'Binding not found.', 404);
  const [u, auditRows, otherSignIn] = await Promise.all([
    User.findById(b.user).select('username avatar status email role provider').lean(),
    can(req.user, 'audit.view') ? AuditLog.find({ targetType: 'srmap_binding', targetId: String(b._id) }).sort({ seq: -1 }).limit(50).lean() : [],
    hasOtherSignIn(b.user)
  ]);
  const actors = await User.find({ _id: { $in: (b.history || []).map(h => h.by).filter(Boolean) } }).select('username avatar').lean();
  const actorById = new Map(actors.map(a => [String(a._id), a]));
  res.json({
    binding: { ...row(b, u), className: b.className, section: b.section, gender: b.gender || '', profilePhoto: b.profilePhoto || '', identityVerified: b.identityVerified, consentAt: b.consentAt || null, unboundReason: b.unboundReason || '', externalStudentId: maskMiddle(String(b.externalStudentId), 3) },
    user: u ? { ...userRef(u), status: u.status, email: u.email, role: u.role, provider: u.provider } : null,
    soleSignInMethod: b.active && !otherSignIn,
    history: (b.history || []).slice().reverse().map(h => ({ type: h.type, at: h.at, by: h.by ? userRef(actorById.get(String(h.by))) : null, note: h.note })),
    audit: auditRows.map(a => ({ id: String(a._id), seq: a.seq, action: a.action, actor: a.actorLabel, reason: a.reason, at: a.at }))
  });
});

/** Re-fetch one student's directory record (by their verified email). Never lists the directory. */
router.post('/bindings/:id/sync', requirePermission('srmap.configure'), testLimiter, async (req, res) => {
  if (!isId(req.params.id)) return bad(res, 'Binding not found.', 404);
  const b = await IdentityBinding.findById(req.params.id);
  if (!b || !b.active) return bad(res, 'This binding is not active.', 404);
  const r = await syncProfile(b, { by: req.user });
  await audit({ actor: req.user, action: 'SRMAP_PROFILE_SYNC', targetType: 'srmap_binding', targetId: b._id, targetLabel: b.registerNumberMasked || 'SRM AP', metadata: { ok: r.ok, code: r.code }, req });
  res.json({ ok: r.ok, code: r.code, profileSync: syncSummary(r.binding) });
});

const unbindSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason (3+ characters).').max(300), confirmLockout: z.boolean().optional() });

router.post('/bindings/:id/unbind', requirePermission('srmap.unbind'), async (req, res) => {
  const d = body(unbindSchema, req, res); if (!d) return;
  if (!isId(req.params.id)) return bad(res, 'Binding not found.', 404);
  const b = await IdentityBinding.findById(req.params.id);
  if (!b || !b.active) return bad(res, 'This binding is not active.', 404);
  const target = await User.findById(b.user);
  if (target) {
    const ok = canActOn(req.user, target);
    if (!ok.ok) return bad(res, ok.error, 403);
  }
  if (target && !(await hasOtherSignIn(b.user)) && !d.confirmLockout) {
    return bad(res, 'SRM AP is the only sign-in method on this account. Confirm that the student will be locked out.', 409);
  }
  await unbind(b, { by: req.user, reason: d.reason });
  await audit({ actor: req.user, action: 'SRMAP_UNBIND', targetType: 'srmap_binding', targetId: b._id, targetLabel: `${target?.username || 'deleted account'} · ${b.registerNumberMasked || 'SRM AP'}`, reason: d.reason, metadata: { user: String(b.user), lockout: !!d.confirmLockout }, req });
  res.json({ ok: true });
});

export default router;
