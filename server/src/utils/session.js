import crypto from 'node:crypto';
import { Session } from '../models/Session.js';
import { config } from '../config.js';

export const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

const cookieBase = () => ({ httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });

/** Creates a server-side session and sets the session cookie. Remembered sessions last 7 days. */
export async function createSession(req, res, user, remember) {
  const token = crypto.randomBytes(32).toString('hex');
  const ms = remember ? config.sessionDays * 864e5 : config.shortSessionHours * 36e5;
  const expiresAt = new Date(Date.now() + ms);
  await Session.create({ tokenHash: hashToken(token), user: user._id, expiresAt, remember: !!remember, userAgent: String(req.get('user-agent') || '').slice(0, 200) });
  // Without "remember", the cookie has no Max-Age, so the browser drops it when it closes.
  res.cookie(config.cookieName, token, remember ? { ...cookieBase(), maxAge: ms } : cookieBase());
  return { expiresAt: expiresAt.getTime(), remember: !!remember };
}

export async function destroySession(req, res) {
  if (req.session) await Session.deleteOne({ _id: req.session._id });
  res.clearCookie(config.cookieName, cookieBase());
}

export function clearSessionCookie(res) { res.clearCookie(config.cookieName, cookieBase()); }
