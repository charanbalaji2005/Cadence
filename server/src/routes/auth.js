import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { createSession, destroySession, clearSessionCookie } from '../utils/session.js';
import { parse, registerSchema, loginSchema, googleSchema } from '../utils/validate.js';
import { validateUsername, generateAvailableUsername } from '../utils/username.js';
import { recordAuth, raiseSecurity } from '../services/events.js';
import { applyBootstrapRole } from '../services/accounts.js';
import { getSettings } from '../services/settings.js';
import { approxCountry, clientIp } from '../utils/privacy.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    raiseSecurity({ type: 'auth_rate_limited', severity: 'suspicious', title: 'Sign-in rate limit reached', ip: clientIp(req), details: { path: req.path }, dedupeKey: `ratelimit:${clientIp(req)}` });
    res.status(options.statusCode).json(options.message);
  },
  message: { error: 'Too many attempts. Wait a few minutes and try again.' }
});

const BLOCKED = { suspended: 'This account is suspended. Contact support if you think this is a mistake.', deleted: 'This account has been deleted.' };
const isBlocked = user => user && user.status && user.status !== 'active';
const registrationsClosed = async () => !(await getSettings()).application.registrationsOpen;
const CLOSED_MSG = 'New sign-ups are paused right now. Try again later.';

/** After any successful sign-in: admin bootstrap and the login record. */
async function signedIn(req, res, user, type, provider) {
  await applyBootstrapRole(user);
  await recordAuth(req, { type, success: true, user, provider, session: res.locals.sessionId });
}

const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
// Compared against when an email isn't found, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('typeflow-timing-guard', 10);

const sessionInfo = req => (req.session ? { expiresAt: req.session.expiresAt.getTime(), remember: req.session.remember } : null);

router.get('/me', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const user = req.user ? req.user.toPublic() : null;
  const needsOnboarding = req.user ? req.user.profileCompleted === false : false;

  const appSettings = await getSettings().catch(() => ({}));
  const appCfg = appSettings.application || {};

  res.json({
    user,
    needsOnboarding,
    session: sessionInfo(req),
    settings: req.user ? req.user.settings : null,
    googleClientId: config.googleClientId || null,
    githubClientId: config.githubClientId || null,
    maintenance: {
      maintenanceMode: Boolean(appCfg.maintenanceMode),
      maintenanceStart: appCfg.maintenanceStart || '',
      maintenanceEnd: appCfg.maintenanceEnd || '',
      maintenanceMessage: appCfg.maintenanceMessage || 'Cadence is temporarily under scheduled system maintenance.'
    }
  });
});

/**
 * Username availability check
 */
router.get('/username-available', async (req, res) => {
  const raw = req.query.username;
  if (!raw) return res.json({ available: false, reason: 'Username is required.' });

  const { valid, error, normalized } = validateUsername(raw);
  if (!valid) return res.json({ available: false, reason: error });

  const currentUserId = req.user?._id;
  const query = {
    $or: [{ usernameNormalized: normalized }, { usernameLower: normalized }]
  };
  if (currentUserId) query._id = { $ne: currentUserId };

  const taken = await User.exists(query);
  res.json({ available: !taken, reason: taken ? 'Username already taken' : null, normalized });
});

/**
 * Register with Email + Password
 */
router.post('/register', authLimiter, async (req, res) => {
  const { email, password, username, remember = true } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (await registrationsClosed()) return res.status(403).json({ error: CLOSED_MSG });
  const cleanEmail = String(email).toLowerCase().trim();
  if (await User.exists({ email: cleanEmail })) {
    return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
  }

  let finalUsername = username;
  let profileCompleted = true;

  if (finalUsername) {
    const { valid, error, normalized } = validateUsername(finalUsername);
    if (!valid) return res.status(400).json({ error });
    if (await User.exists({ $or: [{ usernameNormalized: normalized }, { usernameLower: normalized }] })) {
      return res.status(409).json({ error: 'That username is taken. Try another one.' });
    }
    finalUsername = normalized;
  } else {
    // If username is not chosen upfront, generate a temporary suggested username
    // and mark profileCompleted: false so user completes username onboarding
    finalUsername = await generateAvailableUsername(cleanEmail.split('@')[0]);
    profileCompleted = false;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    username: finalUsername,
    usernameLower: finalUsername.toLowerCase(),
    usernameNormalized: finalUsername.toLowerCase(),
    email: cleanEmail,
    passwordHash,
    provider: 'email',
    profileCompleted,
    signupCountry: approxCountry(req)
  });

  const session = await createSession(req, res, user, remember, 'email');
  await signedIn(req, res, user, 'signup', 'email');
  res.status(201).json({
    user: user.toPublic(),
    session,
    settings: user.settings,
    needsOnboarding: !profileCompleted,
    suggestedUsername: finalUsername
  });
});

/**
 * Login with Email + Password
 */
router.post('/login', authLimiter, async (req, res) => {
  const d = parse(loginSchema, req.body, res);
  if (!d) return;

  const user = await User.findOne({ email: d.email }).select('+passwordHash');
  const ok = await bcrypt.compare(d.password, user?.passwordHash || DUMMY_HASH);

  if (!user || !ok) {
    if (user && !user.passwordHash) {
      await recordAuth(req, { type: 'failed', success: false, user, provider: 'email', identifier: d.email, reason: 'oauth_account' });
      const p = user.provider === 'github' ? 'GitHub' : 'Google';
      return res.status(401).json({ error: `This account uses ${p} sign-in. Choose "Continue with ${p}".` });
    }
    await recordAuth(req, { type: 'failed', success: false, user: user || undefined, provider: 'email', identifier: d.email, reason: user ? 'wrong_password' : 'unknown_email' });
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (isBlocked(user)) {
    await recordAuth(req, { type: 'blocked', success: false, user, provider: 'email', identifier: d.email, reason: `account_${user.status}` });
    return res.status(403).json({ error: BLOCKED[user.status] });
  }

  const session = await createSession(req, res, user, d.remember, 'email');
  await signedIn(req, res, user, 'login', 'email');
  const needsOnboarding = user.profileCompleted === false;

  res.json({
    user: user.toPublic(),
    session,
    settings: user.settings,
    needsOnboarding,
    suggestedUsername: user.username
  });
});

/**
 * Google OAuth
 */
router.post('/google', authLimiter, async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Google sign-in is not set up on this server yet.' });
  const d = parse(googleSchema, req.body, res);
  if (!d) return;

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: d.credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    await recordAuth(req, { type: 'failed', success: false, provider: 'google', reason: 'google_token_invalid' });
    return res.status(401).json({ error: 'Google sign-in could not be verified. Try again.' });
  }

  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Your Google account email is not verified.' });
  }

  const email = payload.email.toLowerCase();
  let user = (await User.findOne({ googleId: payload.sub })) || (await User.findOne({ email }));
  let isNewUser = false;
  let suggestedUsername = '';

  if (isBlocked(user)) {
    await recordAuth(req, { type: 'blocked', success: false, user, provider: 'google', identifier: email, reason: `account_${user.status}` });
    return res.status(403).json({ error: BLOCKED[user.status] });
  }
  if (user) {
    if (!user.googleId) { user.googleId = payload.sub; user.googleConnectedAt = new Date(); }
    if (!user.avatar && payload.picture) user.avatar = payload.picture;
    await user.save();
    suggestedUsername = user.username;
  } else {
    if (await registrationsClosed()) return res.status(403).json({ error: CLOSED_MSG });
    suggestedUsername = await generateAvailableUsername(payload.given_name || payload.name || email.split('@')[0]);
    user = await User.create({
      username: suggestedUsername,
      usernameLower: suggestedUsername.toLowerCase(),
      usernameNormalized: suggestedUsername.toLowerCase(),
      email,
      googleId: payload.sub,
      avatar: payload.picture || '',
      provider: 'google',
      googleConnectedAt: new Date(),
      signupCountry: approxCountry(req),
      profileCompleted: false // New user must go through username onboarding!
    });
    isNewUser = true;
  }

  const session = await createSession(req, res, user, d.remember, 'google');
  await signedIn(req, res, user, isNewUser ? 'signup' : 'login', 'google');
  const needsOnboarding = user.profileCompleted === false || isNewUser;

  res.status(isNewUser ? 201 : 200).json({
    user: user.toPublic(),
    session,
    settings: user.settings,
    needsOnboarding,
    suggestedUsername
  });
});

function getEffectiveOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return `${proto}://${host}`;
  }
  return config.clientOrigins[0] || 'http://localhost:5173';
}

function getGithubRedirectUri(req) {
  if (process.env.GITHUB_CALLBACK_URL) return process.env.GITHUB_CALLBACK_URL;
  const clientOrigin = getEffectiveOrigin(req);
  return `${clientOrigin}/login`;
}

export async function processGithubAuth({ code, state, cookieState, redirectUri, req, res }) {
  if (!code) throw new Error('Authorization code is missing.');
  if (cookieState && state && state !== cookieState) {
    throw new Error('GitHub authentication timed out or was invalid. Please try again.');
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('GitHub token exchange error:', tokenData.error || 'no access token');
    await recordAuth(req, { type: 'failed', success: false, provider: 'github', reason: 'github_token_exchange' });
    throw new Error(tokenData.error_description || 'Could not obtain access token from GitHub.');
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'Cadence-MERN'
    }
  });
  const ghUser = await userRes.json();

  let email = ghUser.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Cadence-MERN'
      }
    });
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) && (emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0]);
    if (primary) email = primary.email;
  }

  if (!email) {
    throw new Error('Could not retrieve a verified email from your GitHub account.');
  }
  email = email.toLowerCase().trim();

  const githubId = String(ghUser.id);
  let user = (await User.findOne({ githubId })) || (await User.findOne({ email }));
  let isNewUser = false;
  let suggestedUsername = '';

  if (isBlocked(user)) {
    await recordAuth(req, { type: 'blocked', success: false, user, provider: 'github', identifier: email, reason: `account_${user.status}` });
    throw new Error(BLOCKED[user.status]);
  }
  if (user) {
    if (!user.githubId) { user.githubId = githubId; user.githubConnectedAt = new Date(); }
    if (ghUser.login) user.githubLogin = String(ghUser.login).slice(0, 39);
    if (!user.avatar && ghUser.avatar_url) user.avatar = ghUser.avatar_url;
    await user.save();
    suggestedUsername = user.username;
  } else {
    if (await registrationsClosed()) throw new Error(CLOSED_MSG);
    const baseName = ghUser.login || ghUser.name || email.split('@')[0];
    suggestedUsername = await generateAvailableUsername(baseName);
    user = await User.create({
      username: suggestedUsername,
      usernameLower: suggestedUsername.toLowerCase(),
      usernameNormalized: suggestedUsername.toLowerCase(),
      email,
      githubId,
      avatar: ghUser.avatar_url || '',
      provider: 'github',
      githubLogin: String(ghUser.login || '').slice(0, 39),
      githubConnectedAt: new Date(),
      signupCountry: approxCountry(req),
      profileCompleted: false // New user must go through username onboarding!
    });
    isNewUser = true;
  }

  const session = await createSession(req, res, user, true, 'github');
  await signedIn(req, res, user, isNewUser ? 'signup' : 'login', 'github');

  return {
    user,
    session,
    isNewUser,
    suggestedUsername,
    needsOnboarding: isNewUser || user.profileCompleted === false
  };
}

export async function handleGithubRedirect(req, res) {
  const { code, state, error, error_description } = req.query;
  const cookieState = req.cookies?.gh_state;
  const clientOrigin = req.cookies?.gh_origin || getEffectiveOrigin(req);
  const redirectUri = req.cookies?.gh_redirect_uri || getGithubRedirectUri(req);
  res.clearCookie('gh_state');
  res.clearCookie('gh_origin');
  res.clearCookie('gh_redirect_uri');

  if (error) {
    return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent('GitHub authentication code was missing.')}`);
  }

  try {
    const result = await processGithubAuth({ code, state, cookieState, redirectUri, req, res });
    if (result.needsOnboarding) {
      return res.redirect(`${clientOrigin}/?onboard=true&suggested=${encodeURIComponent(result.suggestedUsername)}`);
    }
    return res.redirect(`${clientOrigin}/`);
  } catch (err) {
    console.error('GitHub OAuth error:', err.message);
    await recordAuth(req, { type: 'failed', success: false, provider: 'github', reason: 'github_error' });
    return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent(err.message || 'Something went wrong during GitHub sign-in.')}`);
  }
}

/**
 * GitHub OAuth
 */
router.get('/github', (req, res) => {
  if (!config.githubClientId) return res.status(503).json({ error: 'GitHub sign-in is not configured on this server.' });
  const state = crypto.randomBytes(16).toString('hex');
  const clientOrigin = getEffectiveOrigin(req);
  const redirectUri = getGithubRedirectUri(req);

  res.cookie('gh_state', state, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 10 * 60 * 1000 });
  res.cookie('gh_origin', clientOrigin, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 10 * 60 * 1000 });
  res.cookie('gh_redirect_uri', redirectUri, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 10 * 60 * 1000 });

  const url = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email&state=${state}`;
  res.redirect(url);
});

router.get('/github/callback', handleGithubRedirect);

router.post('/github/exchange', async (req, res) => {
  const { code, state } = req.body;
  const cookieState = req.cookies?.gh_state;
  const redirectUri = req.cookies?.gh_redirect_uri || getGithubRedirectUri(req);
  res.clearCookie('gh_state');
  res.clearCookie('gh_origin');
  res.clearCookie('gh_redirect_uri');

  try {
    const result = await processGithubAuth({ code, state, cookieState, redirectUri, req, res });
    res.json({
      ok: true,
      user: result.user.toPublic(),
      session: result.session,
      created: result.isNewUser,
      needsOnboarding: result.needsOnboarding,
      suggestedUsername: result.suggestedUsername
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'GitHub exchange failed.' });
  }
});

router.post('/logout', async (req, res) => {
  if (req.user) await recordAuth(req, { type: 'logout', success: true, user: req.user, provider: req.session?.provider || '', session: req.session?._id });
  await destroySession(req, res);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, async (req, res) => {
  await Session.updateMany({ user: req.user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokedReason: 'logout_all' } });
  await recordAuth(req, { type: 'logout', success: true, user: req.user, reason: 'all_devices' });
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
