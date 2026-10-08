import mongoose from 'mongoose';
import { ActivityEvent } from '../models/ActivityEvent.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { SecurityEvent } from '../models/SecurityEvent.js';
import { AdminNotification } from '../models/AdminData.js';
import { User } from '../models/User.js';
import { getSettings } from './settings.js';
import { requestFacts, maskEmail, hashIdentifier } from '../utils/privacy.js';

const dbReady = () => mongoose.connection.readyState === 1;
const quiet = label => err => console.error(`${label}:`, err.message);
const SEVERITY_RANK = { normal: 0, suspicious: 1, critical: 2 };

/* ---------- activity ---------- */

/** Records something a user did. Never throws: activity logging must not break the action itself. */
export function track(type, { user, actor, target = '', metadata = {}, result = 'success' } = {}) {
  if (!dbReady()) return Promise.resolve();
  return ActivityEvent.create({
    type, result, target: String(target || ''), metadata,
    user: user?._id || user || undefined,
    username: user?.username || '',
    actor: actor?._id || actor || undefined
  }).catch(quiet('Activity not recorded'));
}

/* ---------- admin notifications ---------- */

/** Creates an admin alert unless the same one (dedupeKey) was raised within the window. */
export async function notifyAdmins({ type, severity = 'info', title, body = '', link = '', dedupeKey = '', windowMinutes = 60 }) {
  if (!dbReady()) return null;
  try {
    if (dedupeKey && await AdminNotification.exists({ dedupeKey, createdAt: { $gte: new Date(Date.now() - windowMinutes * 60000) } })) return null;
    return await AdminNotification.create({ type, severity, title, body, link, dedupeKey });
  } catch (err) { quiet('Admin notification not created')(err); return null; }
}

/* ---------- security events ---------- */

/** Raises (or escalates) a security event. Repeats within an hour update the same record. */
export async function raiseSecurity({ type, severity = 'normal', title, user, ip = '', identifier = '', details = {}, dedupeKey }) {
  if (!dbReady()) return null;
  try {
    const since = new Date(Date.now() - 60 * 60000);
    const existing = await SecurityEvent.findOne({ dedupeKey, lastSeenAt: { $gte: since } });
    let ev;
    let escalated = false;
    if (existing) {
      escalated = SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity];
      existing.count += 1;
      existing.lastSeenAt = new Date();
      existing.details = { ...existing.details, ...details };
      if (escalated) { existing.severity = severity; existing.title = title; existing.acknowledgedAt = undefined; }
      ev = await existing.save();
    } else {
      ev = await SecurityEvent.create({ type, severity, title, user: user?._id || user, ip, identifier, details, dedupeKey });
    }
    if ((!existing || escalated) && severity !== 'normal') {
      notifyAdmins({ type: 'security', severity: severity === 'critical' ? 'critical' : 'warning', title, body: ip ? `From ${ip}` : '', link: '/admin/security', dedupeKey: `sec:${dedupeKey}:${severity}` });
      if (user) track('SECURITY_EVENT', { user, metadata: { type, severity } });
    }
    return ev;
  } catch (err) { quiet('Security event not recorded')(err); return null; }
}

/** Looks for patterns after a failed sign-in and returns how risky this attempt looks. */
async function detectAfterFailure(ev) {
  const s = (await getSettings()).security;
  const since = new Date(Date.now() - s.windowMinutes * 60000);
  const [byIdentifier, byIp, accounts] = await Promise.all([
    ev.identifierHash ? LoginEvent.countDocuments({ type: 'failed', identifierHash: ev.identifierHash, createdAt: { $gte: since } }) : 0,
    ev.ip ? LoginEvent.countDocuments({ type: 'failed', ip: ev.ip, createdAt: { $gte: since } }) : 0,
    ev.ip ? LoginEvent.distinct('identifierHash', { type: 'failed', ip: ev.ip, createdAt: { $gte: since } }) : []
  ]);
  let risk = 'normal';
  const bump = r => { if (SEVERITY_RANK[r] > SEVERITY_RANK[risk]) risk = r; };
  if (byIdentifier >= s.failedLoginWarn) {
    const sev = byIdentifier >= s.failedLoginCritical ? 'critical' : 'suspicious';
    bump(sev);
    await raiseSecurity({ type: 'failed_login_burst', severity: sev, title: `${byIdentifier} failed sign-ins for ${ev.identifier || 'one account'} in ${s.windowMinutes} minutes`, user: ev.user, ip: ev.ip, identifier: ev.identifier, details: { attempts: byIdentifier, windowMinutes: s.windowMinutes }, dedupeKey: `fail:${ev.identifierHash}` });
  }
  if (accounts.length >= s.multiAccountIp) {
    const sev = accounts.length >= s.multiAccountIp * 2 ? 'critical' : 'suspicious';
    bump(sev);
    await raiseSecurity({ type: 'ip_many_accounts', severity: sev, title: `One IP tried ${accounts.length} different accounts`, ip: ev.ip, details: { accounts: accounts.length, windowMinutes: s.windowMinutes }, dedupeKey: `ipacct:${ev.ip}` });
  }
  if (byIp >= s.failedLoginCritical) {
    bump('critical');
    await raiseSecurity({ type: 'ip_failed_burst', severity: 'critical', title: `${byIp} failed sign-ins from one IP in ${s.windowMinutes} minutes`, ip: ev.ip, details: { attempts: byIp }, dedupeKey: `ipfail:${ev.ip}` });
  }
  return risk;
}

/** After a successful sign-in: the same account from several countries or many IPs within an hour is unusual. */
async function detectAfterLogin(user, facts) {
  const since = new Date(Date.now() - 60 * 60000);
  const recent = await LoginEvent.find({ user: user._id, success: true, type: { $in: ['login', 'signup'] }, createdAt: { $gte: since } }).select('ip country').lean();
  const countries = new Set(recent.map(r => r.country).filter(Boolean));
  const ips = new Set(recent.map(r => r.ip).filter(Boolean));
  if (countries.size > 1) {
    await raiseSecurity({ type: 'login_multiple_countries', severity: 'suspicious', title: `${user.username} signed in from ${countries.size} countries within an hour`, user, ip: facts.ip, details: { countries: [...countries] }, dedupeKey: `geo:${user._id}` });
    return 'suspicious';
  }
  if (ips.size >= 4) {
    await raiseSecurity({ type: 'rapid_logins', severity: 'suspicious', title: `${user.username} signed in from ${ips.size} addresses within an hour`, user, ip: facts.ip, details: { addresses: ips.size }, dedupeKey: `rapid:${user._id}` });
    return 'suspicious';
  }
  return 'normal';
}

/* ---------- authentication events ---------- */

/**
 * Records a sign-up, sign-in, failure, sign-out or revocation, then runs detection.
 * opts: { type, success, user, provider, reason, identifier (raw email; stored masked + hashed), session }
 */
export async function recordAuth(req, { type, success, user, provider = '', reason = '', identifier = '', session } = {}) {
  if (!dbReady()) return null;
  try {
    const facts = requestFacts(req);
    const ev = await LoginEvent.create({
      type, success, provider, reason,
      user: user?._id, username: user?.username || '',
      identifier: identifier ? maskEmail(identifier) : (user?.email ? maskEmail(user.email) : ''),
      identifierHash: identifier ? hashIdentifier(identifier) : (user?.email ? hashIdentifier(user.email) : ''),
      session: session?._id || session || undefined,
      ip: facts.ip, device: facts.device, browser: facts.browser, os: facts.os, country: facts.country
    });
    let risk = 'normal';
    if (type === 'failed') risk = await detectAfterFailure(ev);
    else if (success && (type === 'login' || type === 'signup') && user) {
      await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastActiveAt: new Date(), lastAuthProvider: provider } });
      risk = await detectAfterLogin(user, facts);
      track(type === 'signup' ? 'USER_SIGNUP' : 'USER_LOGIN', { user, metadata: { provider } });
    } else if (type === 'logout' && user) track('USER_LOGOUT', { user });
    if (risk !== 'normal') await LoginEvent.updateOne({ _id: ev._id }, { $set: { risk } });
    return ev;
  } catch (err) { quiet('Login event not recorded')(err); return null; }
}
