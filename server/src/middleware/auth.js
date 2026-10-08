import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { config } from '../config.js';
import { hashToken } from '../utils/session.js';

const TOUCH_MS = 5 * 60 * 1000;

/** The session for a cookie token, if it is unexpired, not revoked, and its account is active. */
export async function findActiveSession(token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() }, revokedAt: { $exists: false } }).populate('user');
  // Suspended and deleted accounts are signed out everywhere, whatever cookie they hold.
  if (!session?.user || (session.user.status && session.user.status !== 'active')) return null;
  return session;
}

/** Attaches req.user and req.session when a valid session cookie is present. */
export async function loadSession(req, _res, next) {
  const session = await findActiveSession(req.cookies?.[config.cookieName]);
  if (session) {
    req.session = session; req.user = session.user;
    // "Last active" is refreshed at most every 5 minutes, so it costs almost nothing.
    const now = Date.now();
    if (!session.lastActiveAt || now - session.lastActiveAt > TOUCH_MS) {
      const at = new Date(now);
      Session.updateOne({ _id: session._id }, { $set: { lastActiveAt: at } }).catch(() => {});
      User.updateOne({ _id: session.user._id }, { $set: { lastActiveAt: at } }).catch(() => {});
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Log in to do that.' });
  next();
}

/**
 * CSRF protection: state-changing requests must carry a custom header.
 * Browsers won't send a custom header cross-site without a CORS preflight,
 * and CORS only admits the configured client origins.
 */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'TypeFlow') return res.status(403).json({ error: 'This request was blocked. Reload the page and try again.' });
  next();
}
