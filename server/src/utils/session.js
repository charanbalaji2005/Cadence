import crypto from 'node:crypto';
import { Session } from '../models/Session.js';
import { config } from '../config.js';
import { requestFacts } from './privacy.js';

export const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

const cookieBase = () => ({ httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });

/**
 * Creates a server-side session and sets the session cookie. Remembered sessions last 7 days.
 * The new session's id is left in res.locals.sessionId for login records (it is not sent to the browser).
 */
export async function createSession(req, res, user, remember, provider = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const ms = remember ? config.sessionDays * 864e5 : config.shortSessionHours * 36e5;
  const expiresAt = new Date(Date.now() + ms);
  const f = requestFacts(req);
  const doc = await Session.create({
    tokenHash: hashToken(token), user: user._id, expiresAt, remember: !!remember, userAgent: f.userAgent.slice(0, 200),
    ip: f.ip, device: f.device, browser: f.browser, os: f.os, country: f.country, provider, lastActiveAt: new Date()
  });
  res.locals.sessionId = doc._id;
  // Without "remember", the cookie has no Max-Age, so the browser drops it when it closes.
  res.cookie(config.cookieName, token, remember ? { ...cookieBase(), maxAge: ms } : cookieBase());
  return { expiresAt: expiresAt.getTime(), remember: !!remember };
}

/** Signs out this browser. The session is marked revoked (kept for history until it would have expired). */
export async function destroySession(req, res) {
  if (req.session) await Session.updateOne({ _id: req.session._id }, { $set: { revokedAt: new Date(), revokedReason: 'logout' } });
  res.clearCookie(config.cookieName, cookieBase());
}

export function clearSessionCookie(res) { res.clearCookie(config.cookieName, cookieBase()); }
