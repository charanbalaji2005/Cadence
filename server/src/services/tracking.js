import mongoose from 'mongoose';
import { PageView, VisitorSession } from '../models/Analytics.js';
import { requestFacts } from '../utils/privacy.js';

/**
 * First-party visitor analytics. No cookies, no fingerprinting: the browser makes a random
 * visitor id and a per-tab session id. Pages are stored as the app's route patterns only.
 */

const STATIC_ROUTES = new Set(['/', '/login', '/register', '/leaderboard', '/stats', '/settings', '/account', '/about', '/friends', '/compete']);
const LIVE_TTL_MS = 150 * 1000; // heartbeats arrive every 60 s while a tab is visible

/** Maps a pathname to the route pattern we count it under. Admin pages are never tracked. */
export function normalizeRoute(path) {
  const p = String(path || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (p.startsWith('/admin')) return null;
  if (STATIC_ROUTES.has(p)) return p;
  if (/^\/compete\/join\/[^/]+$/.test(p)) return '/compete/join/:code';
  if (/^\/compete\/[^/]+$/.test(p)) return '/compete/:code';
  return '/other';
}

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|brave|startpage|qwant)\./i;
const SOCIAL = /(^|\.)(t\.co|twitter|x|facebook|fb|instagram|linkedin|lnkd|reddit|youtube|discord|whatsapp|telegram|t\.me|pinterest|tiktok|threads|mastodon|news\.ycombinator)\./i;
const MAIL = /(^|\.)(mail\.google|outlook|mail\.yahoo|proton)\./i;

/** Direct, search, social, email, referral, from the referrer host and utm tags. */
export function classifySource(refHost, utm = {}, ownHost = '') {
  const medium = String(utm.medium || '').toLowerCase(), source = String(utm.source || '').toLowerCase();
  if (medium === 'email' || source === 'newsletter') return 'email';
  if (/social|sm/.test(medium)) return 'social';
  if (/cpc|ppc|search|organic/.test(medium)) return 'search';
  if (!refHost || refHost === ownHost) return source ? 'other' : 'direct';
  if (MAIL.test(`${refHost}.`)) return 'email';
  if (SEARCH.test(`${refHost}.`)) return 'search';
  if (SOCIAL.test(`${refHost}.`)) return 'social';
  return 'referral';
}

const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase().slice(0, 100); } catch { return ''; } };
const screenBucket = w => (!w ? '' : w < 480 ? '<480' : w < 768 ? '480-767' : w < 1024 ? '768-1023' : w < 1280 ? '1024-1279' : w < 1920 ? '1280-1919' : '1920+');

/* ---------- live presence ---------- */

const live = new Map(); // sid -> { vid, sid, userId, username, route, device, browser, os, country, startedAt, lastSeen }

export function liveVisitors() {
  const cutoff = Date.now() - LIVE_TTL_MS;
  for (const [sid, v] of live) if (v.lastSeen < cutoff) live.delete(sid);
  return [...live.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

const sweeper = setInterval(liveVisitors, 30000);
sweeper.unref();

/* ---------- ingestion ---------- */

/** Should this request be counted at all? Bots, opted-out browsers and disabled tracking are not. */
export function shouldTrack(req, settings, facts) {
  if (!settings.application.trackingEnabled || facts.bot) return false;
  if (settings.application.respectDoNotTrack && (req.get('dnt') === '1' || req.get('sec-gpc') === '1')) return false;
  return true;
}

/** A page view: stores it, updates (or starts) the visit, and marks the visitor live. Returns the view id. */
export async function recordPageView(req, body) {
  const route = normalizeRoute(body.path);
  if (!route || mongoose.connection.readyState !== 1) return null;
  const facts = requestFacts(req, body.lang);
  const now = new Date();
  const user = req.user?._id;

  // Time spent on the previous page arrives with the next one.
  if (body.prev?.id && mongoose.isValidObjectId(body.prev.id)) {
    PageView.updateOne({ _id: body.prev.id, sid: body.sid }, { $set: { durationMs: Math.min(30 * 60000, Math.max(0, body.prev.ms | 0)) } }).catch(() => {});
  }
  const pv = await PageView.create({ vid: body.vid, sid: body.sid, user, route, device: facts.device, browser: facts.browser, os: facts.os, country: facts.country });

  const update = await VisitorSession.updateOne(
    { sid: body.sid },
    { $set: { lastSeenAt: now, exitRoute: route, ...(user ? { user } : {}) }, $inc: { pages: 1 } }
  );
  if (!update.matchedCount) {
    const ownHost = String(req.get('host') || '').split(':')[0].replace(/^www\./, '');
    const refHost = hostOf(body.referrer);
    const returning = !!(await VisitorSession.exists({ vid: body.vid }));
    try {
      await VisitorSession.create({
        sid: body.sid, vid: body.vid, user, startedAt: now, lastSeenAt: now, pages: 1, entryRoute: route, exitRoute: route,
        source: classifySource(refHost, body.utm, ownHost), referrer: refHost === ownHost ? '' : refHost, returning,
        device: facts.device, browser: facts.browser, os: facts.os, country: facts.country, screen: screenBucket(body.screen)
      });
    } catch (err) {
      if (err.code !== 11000) throw err; // two first views raced; the other one created it
      await VisitorSession.updateOne({ sid: body.sid }, { $set: { lastSeenAt: now, exitRoute: route }, $inc: { pages: 1 } });
    }
  }

  const prev = live.get(body.sid);
  live.set(body.sid, {
    vid: body.vid, sid: body.sid, userId: user ? String(user) : null, username: req.user?.username || null, route,
    device: facts.device, browser: facts.browser, os: facts.os, country: facts.country,
    startedAt: prev?.startedAt || now.getTime(), lastSeen: now.getTime()
  });
  return pv._id;
}

/** Sent every minute while the tab is visible: keeps the visitor live and the page's time up to date. */
export async function recordHeartbeat(req, body) {
  const now = Date.now();
  const v = live.get(body.sid);
  const route = normalizeRoute(body.path);
  if (v) Object.assign(v, { lastSeen: now, ...(route ? { route } : {}), ...(req.user ? { userId: String(req.user._id), username: req.user.username } : {}) });
  if (mongoose.connection.readyState !== 1) return;
  await VisitorSession.updateOne({ sid: body.sid }, { $set: { lastSeenAt: new Date(now) } });
  if (body.pvId && mongoose.isValidObjectId(body.pvId)) {
    await PageView.updateOne({ _id: body.pvId, sid: body.sid }, { $set: { durationMs: Math.min(30 * 60000, Math.max(0, body.ms | 0)) } });
  }
}

/** The tab closed: drop it from live visitors and keep the time spent on its last page. */
export async function recordLeave(body) {
  live.delete(body.sid);
  if (body.pvId && mongoose.isValidObjectId(body.pvId) && mongoose.connection.readyState === 1) {
    await PageView.updateOne({ _id: body.pvId, sid: body.sid }, { $set: { durationMs: Math.min(30 * 60000, Math.max(0, body.ms | 0)) } });
  }
}
