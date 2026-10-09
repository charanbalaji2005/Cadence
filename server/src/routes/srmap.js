import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { PendingSignup } from '../models/IdentityBinding.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { createSession, hashToken } from '../utils/session.js';
import { validateUsername, suggestUsernames } from '../utils/username.js';
import { approxCountry, clientIp, hashIdentifier, maskEmail } from '../utils/privacy.js';
import { recordAuth, raiseSecurity, track } from '../services/events.js';
import { applyBootstrapRole } from '../services/accounts.js';
import { getSettings } from '../services/settings.js';
import { getSrmapSettings, readiness, publicConfig } from '../services/srmap/settings.js';
import { verifyCredentials } from '../services/srmap/provider.js';
import { parseIdentifier } from '../services/srmap/regno.js';
import { findActiveByIdentity, findActiveForUser, createBinding, touchBinding, unbind, hasOtherSignIn, bindingSummary, storedFields, trySyncProfile, needsProfileSync, syncSummary } from '../services/srmap/bindings.js';

/**
 * Connect SRM AP: /api/auth/srmap.
 * Verify first (with the SRM AP verification service), then sign in, link, or start sign-up.
 * No Cadence account, binding or session exists until SRM AP has verified the student, and for a
 * new student, until they have also confirmed a username and consented to what Cadence keeps.
 * Accounts are never matched or merged by email address.
 */
const router = Router();
const PROVIDER = 'srm_ap';
const TICKET_COOKIE = 'tf_srmap_ticket';
const TICKET_MS = 15 * 60 * 1000;
const ticketCookie = () => ({ httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/api/auth/srmap' });

const limiter = (limit, windowMs, keyGenerator) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  ...(keyGenerator ? { keyGenerator } : {}),
  handler: (req, res, _next, options) => {
    raiseSecurity({ type: 'auth_rate_limited', severity: 'suspicious', title: 'Connect SRM AP rate limit reached', ip: clientIp(req), details: { path: req.path }, dedupeKey: `ratelimit:srmap:${clientIp(req)}` });
    res.status(options.statusCode).json({ error: 'Too many attempts. Wait a few minutes and try again.', code: 'rate_limited' });
  }
});
// Per browser/IP, and per student identifier so one student can't be guessed at from many addresses.
const verifyLimiter = limiter(10, 15 * 60 * 1000);
const identifierKey = req => {
  const id = parseIdentifier(req.body?.identifier);
  return `srmap-id:${id.ok ? hashIdentifier(id.value) : 'invalid'}`;
};
const identifierLimiter = limiter(8, 15 * 60 * 1000, identifierKey);
const onboardingLimiter = limiter(60, 15 * 60 * 1000);
const syncLimiter = limiter(5, 15 * 60 * 1000, req => `srmap-sync:${req.user?._id || clientIp(req)}`);

export const INVALID_CREDENTIALS = 'Invalid SRM AP details entered. Please check your details and try again.';
const FAIL = {
  not_configured: [503, 'Connect SRM AP sign-in is not available yet. Use another sign-in method for now.'],
  invalid_credentials: [401, INVALID_CREDENTIALS],
  unavailable: [503, "SRM AP verification isn't responding right now. Try again in a few minutes."],
  bad_response: [502, "SRM AP sent a response Cadence couldn't verify, so you weren't signed in. Try again later."],
  mismatch: [502, "SRM AP sent a response Cadence couldn't verify, so you weren't signed in. Try again later."]
};
const BLOCKED = { suspended: 'This account is suspended. Contact support if you think this is a mistake.', deleted: 'This account has been deleted.' };
const LINK_REQUIRED = 'A Cadence account already uses your institutional email. Log in to that account, then connect SRM AP from Account settings.';
const IDENTITY_TAKEN = 'This SRM AP identity is already connected to another Cadence account. If that account is yours, sign in to it; otherwise contact support to review the connection.';

/** Ends whatever session this browser had (possibly another user's) before starting a new one. */
async function rotateSession(req) {
  if (req.session) await Session.updateOne({ _id: req.session._id }, { $set: { revokedAt: new Date(), revokedReason: 'rotated' } });
}

async function signIn(req, res, user, remember, type) {
  await rotateSession(req);
  const session = await createSession(req, res, user, remember, PROVIDER);
  await User.updateOne({ _id: user._id }, { $set: { lastAuthProvider: PROVIDER } });
  await applyBootstrapRole(user);
  await recordAuth(req, { type, success: true, user, provider: PROVIDER, session: res.locals.sessionId });
  return session;
}

async function requireReady(res) {
  const s = await getSrmapSettings();
  if (!s.enabled) { res.status(503).json({ error: 'Connect SRM AP is turned off right now.', code: 'disabled' }); return false; }
  if (!readiness(s).ready) { res.status(503).json({ error: FAIL.not_configured[1], code: 'not_configured' }); return false; }
  return true;
}

async function loadTicket(req) {
  const token = req.cookies?.[TICKET_COOKIE];
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  return PendingSignup.findOne({ tokenHash: hashToken(token), provider: PROVIDER, expiresAt: { $gt: new Date() } });
}

/** What the username screen shows: the verified name and batch, with the email and register number masked. */
const onboardingView = p => ({
  displayName: p.displayName,
  batchYear: p.batchYear ?? null,
  batchSource: p.batchSource,
  registerNumberMasked: p.registerNumberMasked || '',
  email: p.verifiedEmail ? maskEmail(p.verifiedEmail) : '',
  className: p.className || '',
  section: p.section || '',
  profilePhoto: p.profilePhoto || ''
});

const isTransactionUnsupported = err => err?.code === 20 || err?.codeName === 'IllegalOperation' || /Transaction numbers are only allowed|replica set|transactions are not supported/i.test(String(err?.message));

/**
 * Creates the account and its binding together. Uses a transaction where MongoDB supports one
 * (Atlas replica sets); on a standalone server it falls back to removing the new account if the binding fails.
 */
async function createAccountWithBinding(data, profile, consentAt) {
  let session = null;
  try { session = await mongoose.startSession(); } catch { session = null; }
  if (session) {
    try {
      let user, binding;
      await session.withTransaction(async () => {
        [user] = await User.create([data], { session });
        binding = await createBinding(user, profile, { session, consentAt });
      });
      return { user, binding };
    } catch (err) {
      if (!isTransactionUnsupported(err)) throw err;
    } finally {
      await session.endSession();
    }
  }
  const user = await User.create(data);
  try {
    return { user, binding: await createBinding(user, profile, { consentAt }) };
  } catch (err) {
    await User.deleteOne({ _id: user._id }).catch(e => console.error('SRM AP sign-up rollback failed:', e.message));
    throw err;
  }
}

/* ---------- public configuration ---------- */

router.get('/config', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await publicConfig());
});

/* ---------- verify: sign in, link, or start sign-up ---------- */

const verifySchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your SRM AP register number or institutional email.').max(254),
  password: z.string().min(1, 'Enter your SRM AP password.').max(256),
  remember: z.boolean().optional().default(true),
  intent: z.enum(['login', 'link']).optional().default('login'),
  consent: z.boolean().optional()
});

router.post('/verify', verifyLimiter, identifierLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!(await requireReady(res))) return;
    const parsed = verifySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request.' });
    const { identifier, remember, intent } = parsed.data;
    const id = parseIdentifier(identifier);
    if (!id.ok) return res.status(400).json({ error: id.error, field: 'identifier' });
    if (intent === 'link' && !req.user) return res.status(401).json({ error: 'Log in to connect SRM AP to your account.' });
    if (intent === 'link' && parsed.data.consent !== true) return res.status(400).json({ error: 'Confirm that Cadence may store your verified SRM AP details.', field: 'consent' });

    const result = await verifyCredentials(id, parsed.data.password);
    if (!result.ok) {
      const [status, error] = FAIL[result.code] || FAIL.bad_response;
      if (result.code === 'invalid_credentials') await recordAuth(req, { type: 'failed', success: false, provider: PROVIDER, identifier: id.value, reason: 'srmap_invalid_credentials' });
      else if (result.code === 'mismatch') raiseSecurity({ type: 'srmap_identity_mismatch', severity: 'suspicious', title: 'SRM AP verification answered for a different student', ip: clientIp(req), details: {}, dedupeKey: `srmap:mismatch:${clientIp(req)}` });
      return res.status(status).json({ error, code: result.code });
    }
    const profile = result.profile;
    // Matched by SRM AP's stable student ID only. An email match is never treated as the same identity.
    const existing = await findActiveByIdentity(profile.externalStudentId);

    /* Link to the signed-in account. Proof of both: the Cadence session and the SRM AP verification. */
    if (intent === 'link') {
      if (existing && String(existing.user) !== String(req.user._id)) {
        raiseSecurity({ type: 'srmap_duplicate_binding', severity: 'normal', title: 'Attempt to connect an SRM AP identity that is linked to another account', ip: clientIp(req), details: { user: String(req.user._id) }, dedupeKey: `srmap:dup:${req.user._id}` });
        return res.status(409).json({ error: IDENTITY_TAKEN, code: 'identity_taken' });
      }
      if (existing) {
        let b = await touchBinding(existing, profile);
        if (needsProfileSync(b)) b = (await trySyncProfile(b, { registerNumber: profile.registerNumber })).binding;
        return res.json({ linked: true, user: (await User.findById(req.user._id)).toPublic(), connection: bindingSummary(b) });
      }
      if (await findActiveForUser(req.user._id)) return res.status(409).json({ error: 'Your account is already connected to a different SRM AP identity. Disconnect it first.', code: 'account_taken' });
      let binding;
      try {
        binding = await createBinding(req.user, profile, { consentAt: new Date() });
      } catch (err) {
        if (err?.code === 11000) return res.status(409).json({ error: IDENTITY_TAKEN, code: 'identity_taken' });
        throw err;
      }
      binding = (await trySyncProfile(binding, { registerNumber: profile.registerNumber })).binding;
      return res.json({ linked: true, user: (await User.findById(req.user._id)).toPublic(), connection: bindingSummary(binding) });
    }

    /* Returning student: sign in to the account this identity is bound to. No username step, no new account. */
    if (existing) {
      const user = await User.findById(existing.user);
      if (user) {
        if (user.status && user.status !== 'active') {
          await recordAuth(req, { type: 'blocked', success: false, user, provider: PROVIDER, reason: `account_${user.status}` });
          return res.status(403).json({ error: BLOCKED[user.status] || BLOCKED.suspended });
        }
        const b = await touchBinding(existing, profile);
        // Fetch only this student's record, and only when it was never saved, failed last time, or is a day old.
        if (needsProfileSync(b)) await trySyncProfile(b, { registerNumber: profile.registerNumber });
        const fresh = await User.findById(user._id);
        res.clearCookie(TICKET_COOKIE, ticketCookie());
        const session = await signIn(req, res, fresh, remember, 'login');
        return res.json({ user: fresh.toPublic(), session, settings: fresh.settings, needsOnboarding: false });
      }
      // The account is gone (purged outside the normal flow): retire the dangling link and treat as new.
      await unbind(existing, { reason: 'account no longer exists' });
    }

    /* New student. Never merged into an existing account by email: that needs a sign-in to that account. */
    if (!(await getSettings()).application.registrationsOpen) return res.status(403).json({ error: 'New sign-ups are paused right now. Try again later.' });
    if (!profile.email) return res.status(422).json({ error: "SRM AP didn't share an institutional email for this student, so a Cadence account can't be created yet.", code: 'email_missing' });
    if (await User.exists({ email: profile.email })) return res.status(409).json({ error: LINK_REQUIRED, code: 'link_required' });

    const token = crypto.randomBytes(32).toString('hex');
    await PendingSignup.create({ tokenHash: hashToken(token), provider: PROVIDER, profile: storedFields(profile), remember, expiresAt: new Date(Date.now() + TICKET_MS) });
    res.cookie(TICKET_COOKIE, token, { ...ticketCookie(), maxAge: TICKET_MS });
    const suggestions = await suggestUsernames(profile.displayName, { batchYear: profile.batchYear });
    res.status(202).json({ pending: true, profile: onboardingView(storedFields(profile)), suggestions, expiresInSeconds: TICKET_MS / 1000 });
  } catch (err) {
    console.error('SRM AP verification error:', err);
    res.status(500).json({ error: 'Verification encountered an issue. Please try again.', code: 'server_error' });
  }
});

/* ---------- first-time username setup ---------- */

router.get('/onboarding', onboardingLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const t = await loadTicket(req);
  if (!t) return res.status(410).json({ error: 'Your SRM AP verification expired. Verify again to continue.', code: 'expired' });
  const round = Math.min(50, Math.max(0, parseInt(req.query.round, 10) || 0));
  res.json({ profile: onboardingView(t.profile), suggestions: await suggestUsernames(t.profile.displayName, { batchYear: t.profile.batchYear, round }), expiresAt: t.expiresAt });
});

const completeSchema = z.object({ username: z.string().max(40), consent: z.literal(true, { errorMap: () => ({ message: 'Confirm that Cadence may store your verified SRM AP details.' }) }) });

/**
 * Creates the account: user + binding (one transaction, or create-then-rollback), then fetches this
 * student's own directory record. A failed fetch never undoes the account; it is retried on the next
 * sign-in or from Account settings.
 */
router.post('/complete', onboardingLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const parsed = completeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request.' });
  const v = validateUsername(parsed.data.username);
  if (!v.valid) return res.status(400).json({ error: v.error, field: 'username' });
  if (!(await requireReady(res))) return;
  const t = await loadTicket(req);
  if (!t) return res.status(410).json({ error: 'Your SRM AP verification expired. Verify again to continue.', code: 'expired' });
  if (!(await getSettings()).application.registrationsOpen) return res.status(403).json({ error: 'New sign-ups are paused right now. Try again later.' });

  const p = t.profile;
  // Bound meanwhile (another tab finished first, or an existing account linked it): don't create a second account.
  if (await findActiveByIdentity(p.externalStudentId)) {
    await PendingSignup.deleteOne({ _id: t._id });
    res.clearCookie(TICKET_COOKIE, ticketCookie());
    return res.status(409).json({ error: 'This SRM AP identity is already connected to a Cadence account. Continue with Connect SRM AP to sign in to it.', code: 'identity_taken' });
  }
  if (p.verifiedEmail && await User.exists({ email: p.verifiedEmail })) return res.status(409).json({ error: LINK_REQUIRED, code: 'link_required' });
  if (await User.exists({ $or: [{ usernameNormalized: v.normalized }, { usernameLower: v.normalized }] })) return res.status(409).json({ error: 'That username was just taken. Pick another one.', field: 'username' });

  let user, binding;
  try {
    ({ user, binding } = await createAccountWithBinding({
      username: v.normalized, usernameLower: v.normalized, usernameNormalized: v.normalized,
      email: p.verifiedEmail, provider: PROVIDER, profileCompleted: true, signupCountry: approxCountry(req)
    }, p, new Date()));
  } catch (err) {
    if (err?.code === 11000) {
      const key = err.keyPattern || {};
      if (key.email) return res.status(409).json({ error: LINK_REQUIRED, code: 'link_required' });
      if (key.externalStudentId || key.user) return res.status(409).json({ error: 'This SRM AP identity was just connected to another account. Continue with Connect SRM AP to sign in.', code: 'identity_taken' });
      return res.status(409).json({ error: 'That username was just taken. Pick another one.', field: 'username' });
    }
    console.error('SRM AP sign-up failed:', err?.name || 'error');
    return res.status(500).json({ error: "Your account couldn't be created. Nothing was saved. Try again." });
  }
  track('ACCOUNT_LINKED', { user, metadata: { provider: PROVIDER } });
  // The account exists from here on: the ticket is spent whatever the profile fetch does.
  await PendingSignup.deleteOne({ _id: t._id });
  res.clearCookie(TICKET_COOKIE, ticketCookie());

  const sync = await trySyncProfile(binding);
  const fresh = await User.findById(user._id);
  const session = await signIn(req, res, fresh, t.remember, 'signup');
  res.status(201).json({ user: fresh.toPublic(), session, settings: fresh.settings, needsOnboarding: false, created: true, profileSync: syncSummary(sync.binding) });
});

router.post('/cancel', async (req, res) => {
  const t = await loadTicket(req);
  if (t) await PendingSignup.deleteOne({ _id: t._id });
  res.clearCookie(TICKET_COOKIE, ticketCookie());
  res.json({ ok: true });
});

/* ---------- the signed-in student's connection ---------- */

router.get('/connection', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const b = await findActiveForUser(req.user._id);
  res.json({ ...bindingSummary(b), canUnlink: b ? await hasOtherSignIn(req.user._id) : false });
});

/** The student retries fetching their own directory record (after a failed or missing sync). */
router.post('/connection/sync', requireAuth, syncLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const b = await findActiveForUser(req.user._id);
  if (!b) return res.status(404).json({ error: 'Your account is not connected to SRM AP.' });
  const r = await trySyncProfile(b, { by: req.user });
  const msg = { not_found: "SRM AP's directory has no record for your verified email.", not_configured: 'Fetching SRM AP details is not set up right now.' }[r.code] || "SRM AP's directory isn't responding right now. Try again later.";
  res.status(r.ok ? 200 : 502).json({ ok: r.ok, ...(r.ok ? {} : { error: msg, code: r.code }), connection: bindingSummary(r.binding), user: (await User.findById(req.user._id)).toPublic() });
});

router.delete('/connection', requireAuth, async (req, res) => {
  const b = await findActiveForUser(req.user._id);
  if (!b) return res.status(404).json({ error: 'Your account is not connected to SRM AP.' });
  if (!(await hasOtherSignIn(req.user._id))) {
    return res.status(409).json({ error: 'Connect SRM AP is the only way you sign in. Add Google, GitHub or a password before disconnecting it.', code: 'only_sign_in' });
  }
  await unbind(b, { by: req.user, reason: 'disconnected by the student' });
  res.json({ ok: true, user: (await User.findById(req.user._id)).toPublic() });
});

export default router;
