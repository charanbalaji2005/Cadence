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
import { parse, registerSchema, loginSchema, googleSchema, usernameSchema } from '../utils/validate.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' }
});
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
// Compared against when an email isn't found, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('typeflow-timing-guard', 10);

const sessionInfo = req => (req.session ? { expiresAt: req.session.expiresAt.getTime(), remember: req.session.remember } : null);

async function uniqueUsername(base) {
  let clean = String(base || '').normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '').slice(0, 12);
  if (clean.length < 3) clean = 'typist';
  if (!(await User.exists({ usernameLower: clean.toLowerCase() }))) return clean;
  for (let i = 0; i < 20; i++) {
    const candidate = `${clean}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await User.exists({ usernameLower: candidate.toLowerCase() }))) return candidate;
  }
  return `typist${Date.now().toString(36).slice(-6)}`;
}

router.get('/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    user: req.user ? req.user.toPublic() : null,
    session: sessionInfo(req),
    settings: req.user ? req.user.settings : null,
    googleClientId: config.googleClientId || null,
    githubClientId: config.githubClientId || null
  });
});

router.get('/username-available', async (req, res) => {
  const r = usernameSchema.safeParse(req.query.username);
  if (!r.success) return res.json({ available: false, reason: r.error.issues[0].message });
  const taken = await User.exists({ usernameLower: r.data.toLowerCase() });
  res.json({ available: !taken, reason: taken ? 'That username is taken.' : null });
});

router.post('/register', authLimiter, async (req, res) => {
  const d = parse(registerSchema, req.body, res); if (!d) return;
  if (await User.exists({ email: d.email })) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
  if (await User.exists({ usernameLower: d.username.toLowerCase() })) return res.status(409).json({ error: 'That username is taken. Try another one.' });
  const passwordHash = await bcrypt.hash(d.password, 12);
  const user = await User.create({ username: d.username, usernameLower: d.username.toLowerCase(), email: d.email, passwordHash, provider: 'email' });
  const session = await createSession(req, res, user, d.remember);
  res.status(201).json({ user: user.toPublic(), session, settings: user.settings });
});

router.post('/login', authLimiter, async (req, res) => {
  const d = parse(loginSchema, req.body, res); if (!d) return;
  const user = await User.findOne({ email: d.email }).select('+passwordHash');
  const ok = await bcrypt.compare(d.password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) {
    if (user && !user.passwordHash) {
      const p = user.provider === 'github' ? 'GitHub' : 'Google';
      return res.status(401).json({ error: `This account uses ${p} sign-in. Choose "Continue with ${p}".` });
    }
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const session = await createSession(req, res, user, d.remember);
  res.json({ user: user.toPublic(), session, settings: user.settings });
});

router.post('/google', authLimiter, async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Google sign-in is not set up on this server yet.' });
  const d = parse(googleSchema, req.body, res); if (!d) return;
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: d.credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google sign-in could not be verified. Try again.' });
  }
  if (!payload?.email || !payload.email_verified) return res.status(401).json({ error: 'Your Google account email is not verified.' });
  const email = payload.email.toLowerCase();
  let user = (await User.findOne({ googleId: payload.sub })) || (await User.findOne({ email }));
  let created = false;
  if (user) {
    if (!user.googleId) user.googleId = payload.sub;
    if (!user.avatar && payload.picture) user.avatar = payload.picture;
    await user.save();
  } else {
    const username = await uniqueUsername(payload.given_name || payload.name || email.split('@')[0]);
    user = await User.create({ username, usernameLower: username.toLowerCase(), email, googleId: payload.sub, avatar: payload.picture || '', provider: 'google' });
    created = true;
  }
  const session = await createSession(req, res, user, d.remember);
  res.status(created ? 201 : 200).json({ user: user.toPublic(), session, settings: user.settings, created });
});

router.get('/github', (req, res) => {
  if (!config.githubClientId) return res.status(503).json({ error: 'GitHub sign-in is not configured on this server.' });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('gh_state', state, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 10 * 60 * 1000 });
  const clientOrigin = config.clientOrigins[0] || 'http://localhost:5173';
  const redirectUri = `${clientOrigin}/api/auth/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email&state=${state}`;
  res.redirect(url);
});

router.get('/github/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const cookieState = req.cookies?.gh_state;
  res.clearCookie('gh_state');

  const clientOrigin = config.clientOrigins[0] || 'http://localhost:5173';
  if (error) {
    return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code || !state || state !== cookieState) {
    return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent('GitHub authentication timed out or was invalid. Please try again.')}`);
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('GitHub token exchange error:', tokenData);
      return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent(tokenData.error_description || 'Could not obtain access token from GitHub.')}`);
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'TypeFlow-MERN'
      }
    });
    const ghUser = await userRes.json();

    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'User-Agent': 'TypeFlow-MERN'
        }
      });
      const emails = await emailsRes.json();
      const primary = Array.isArray(emails) && (emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0]);
      if (primary) email = primary.email;
    }

    if (!email) {
      return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent('Could not retrieve a verified email from your GitHub account.')}`);
    }
    email = email.toLowerCase().trim();

    const githubId = String(ghUser.id);
    let user = (await User.findOne({ githubId })) || (await User.findOne({ email }));
    if (user) {
      if (!user.githubId) user.githubId = githubId;
      if (!user.avatar && ghUser.avatar_url) user.avatar = ghUser.avatar_url;
      await user.save();
    } else {
      const baseName = ghUser.login || ghUser.name || email.split('@')[0];
      const username = await uniqueUsername(baseName.replace(/[^a-zA-Z0-9_]/g, ''));
      user = await User.create({
        username,
        usernameLower: username.toLowerCase(),
        email,
        githubId,
        avatar: ghUser.avatar_url || '',
        provider: 'github'
      });
    }

    await createSession(req, res, user, true);
    return res.redirect(`${clientOrigin}/`);
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    return res.redirect(`${clientOrigin}/login?error=${encodeURIComponent('Something went wrong during GitHub sign-in.')}`);
  }
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, async (req, res) => {
  await Session.deleteMany({ user: req.user._id });
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
