import { Session } from '../models/Session.js';
import { config } from '../config.js';
import { hashToken } from '../utils/session.js';

/** Attaches req.user and req.session when a valid session cookie is present. */
export async function loadSession(req, _res, next) {
  const token = req.cookies?.[config.cookieName];
  if (!token || typeof token !== 'string' || token.length > 128) return next();
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).populate('user');
  if (session && session.user) { req.session = session; req.user = session.user; }
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
