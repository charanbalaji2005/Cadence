import { User } from '../models/User.js';
import { Result } from '../models/Result.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { PageView, VisitorSession } from '../models/Analytics.js';
import { ErrorEvent } from '../models/SystemError.js';
import { CompetitionRoom } from '../models/CompetitionRoom.js';
import { hub } from '../realtime/hub.js';
import { liveVisitors } from './tracking.js';

/**
 * Every number here is computed from stored events. Nothing is estimated or invented:
 * a metric with no underlying data comes back as 0 or an empty series.
 */

const DAY = 864e5;
const RANGES = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

const validTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

function tzParts(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24 };
}
const pad = n => String(n).padStart(2, '0');

/** Midnight of the given instant's calendar day in a time zone, as an instant. */
export function startOfDay(date, tz) {
  const { y, m, d } = tzParts(date, tz);
  const guess = Date.UTC(y, m - 1, d);
  const p = tzParts(new Date(guess), tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h) - guess;
  return new Date(guess - offset);
}

/** Reads ?range=today|7d|30d|90d|1y|custom&from&to&tz into a period plus the equally long period before it. */
export function parseRange(q = {}) {
  const tz = q.tz && validTz(q.tz) ? q.tz : 'UTC';
  const now = new Date();
  const range = q.range === 'custom' || q.range === 'today' || RANGES[q.range] ? q.range : '30d';
  let from, to = now;
  if (range === 'today') from = startOfDay(now, tz);
  else if (range === 'custom') {
    from = new Date(q.from); to = q.to ? new Date(q.to) : now;
    if (Number.isNaN(+from) || Number.isNaN(+to) || from >= to) throw Object.assign(new Error('Choose a valid date range.'), { status: 400 });
    if (to - from > 400 * DAY) throw Object.assign(new Error('Custom ranges can be at most 400 days.'), { status: 400 });
  } else from = new Date(now - RANGES[range] * DAY);
  const span = to - from;
  return { range, from, to, prevFrom: new Date(from - span), prevTo: from, tz, unit: span <= 2 * DAY ? 'hour' : span <= 120 * DAY ? 'day' : 'week' };
}

/** Bucket label for an instant, matching what bucketExpr produces in MongoDB. */
function keyFor(date, unit, tz) {
  const { y, m, d, h } = tzParts(date, tz);
  if (unit === 'hour') return `${y}-${pad(m)}-${pad(d)}T${pad(h)}`;
  if (unit === 'day') return `${y}-${pad(m)}-${pad(d)}`;
  const t = Date.UTC(y, m - 1, d), monday = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

function bucketExpr(field, unit, tz) {
  return {
    $dateToString: {
      date: { $dateTrunc: { date: field, unit, timezone: tz, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) } },
      format: unit === 'hour' ? '%Y-%m-%dT%H' : '%Y-%m-%d', timezone: tz
    }
  };
}

/** Every bucket in the period, so charts show zero days instead of skipping them. */
export function bucketKeys(r) {
  const keys = [], seen = new Set();
  for (let t = +r.from; t <= +r.to; t += 3600e3) {
    const k = keyFor(new Date(t), r.unit, r.tz);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  return keys;
}

const fill = (keys, rows) => { const m = new Map(rows.map(x => [x._id, x.n])); return keys.map(k => m.get(k) || 0); };
export const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur ? null : 0);
const between = (from, to) => ({ $gte: from, $lt: to });

/** Count per bucket (or distinct `distinctField` values per bucket). */
async function series(Model, match, field, r, distinctField) {
  const pipe = [{ $match: { ...match, [field]: between(r.from, r.to) } }];
  if (distinctField) pipe.push({ $group: { _id: { k: bucketExpr(`$${field}`, r.unit, r.tz), d: `$${distinctField}` } } }, { $group: { _id: '$_id.k', n: { $sum: 1 } } });
  else pipe.push({ $group: { _id: bucketExpr(`$${field}`, r.unit, r.tz), n: { $sum: 1 } } });
  return Model.aggregate(pipe);
}

async function distinctCount(Model, match, field, from, to, distinctField) {
  const rows = await Model.aggregate([{ $match: { ...match, [field]: between(from, to) } }, { $group: { _id: `$${distinctField}` } }, { $count: 'n' }]);
  return rows[0]?.n || 0;
}

/** Users who did anything in the window: a visit while signed in, a typing test or a sign-in. */
function activeUsersPipeline(from, to, groupStages) {
  return VisitorSession.aggregate([
    { $match: { user: { $ne: null }, startedAt: between(from, to) } },
    { $project: { user: 1, at: '$startedAt' } },
    { $unionWith: { coll: Result.collection.name, pipeline: [{ $match: { createdAt: between(from, to), 'race.status': { $nin: ['suspicious', 'flagged'] } } }, { $project: { user: 1, at: '$createdAt' } }] } },
    { $unionWith: { coll: LoginEvent.collection.name, pipeline: [{ $match: { success: true, user: { $ne: null }, createdAt: between(from, to) } }, { $project: { user: 1, at: '$createdAt' } }] } },
    ...groupStages
  ]);
}
export async function activeUserCount(from, to) {
  const rows = await activeUsersPipeline(from, to, [{ $group: { _id: '$user' } }, { $count: 'n' }]);
  return rows[0]?.n || 0;
}
function activeUserSeries(r) {
  return activeUsersPipeline(r.from, r.to, [{ $group: { _id: { k: bucketExpr('$at', r.unit, r.tz), u: '$user' } } }, { $group: { _id: '$_id.k', n: { $sum: 1 } } }]);
}

/** Signed-in users connected right now (sockets or live page heartbeats), plus anonymous live visitors. */
export function onlineNow() {
  const users = new Set(hub.sockets.keys());
  let anonymous = 0;
  for (const v of liveVisitors()) { if (v.userId) users.add(v.userId); else anonymous++; }
  return { users: users.size, anonymous, visitors: users.size + anonymous };
}

const notDeleted = { status: { $ne: 'deleted' } };

/** The dashboard: KPI cards with previous-period comparison and a daily trend each. */
export async function overview(r) {
  const today = startOfDay(new Date(), r.tz), yesterday = new Date(+today - DAY), now = new Date();
  const weekAgo = new Date(+now - 7 * DAY), twoWeeks = new Date(+now - 14 * DAY), monthAgo = new Date(+now - 30 * DAY), twoMonths = new Date(+now - 60 * DAY);
  const keys = bucketKeys(r);
  const c = (Model, match, field, from, to) => Model.countDocuments({ ...match, [field]: between(from, to) });
  const [
    totalUsers, usersAtStart, activeCur, activePrev,
    newToday, newYesterday, newWeek, newPrevWeek, newMonth, newPrevMonth,
    visitorsCur, visitorsPrev, visitorsToday, visitorsYesterday,
    pvCur, pvPrev, failedCur, failedPrev, suspended, suspendedBefore, errorsCur, errorsPrev,
    sSignups, sActive, sVisitors, sPv, sFailed, sErrors
  ] = await Promise.all([
    User.countDocuments(notDeleted), User.countDocuments({ ...notDeleted, createdAt: { $lt: r.from } }),
    activeUserCount(r.from, r.to), activeUserCount(r.prevFrom, r.prevTo),
    c(User, {}, 'createdAt', today, now), c(User, {}, 'createdAt', yesterday, today),
    c(User, {}, 'createdAt', weekAgo, now), c(User, {}, 'createdAt', twoWeeks, weekAgo),
    c(User, {}, 'createdAt', monthAgo, now), c(User, {}, 'createdAt', twoMonths, monthAgo),
    distinctCount(VisitorSession, {}, 'startedAt', r.from, r.to, 'vid'), distinctCount(VisitorSession, {}, 'startedAt', r.prevFrom, r.prevTo, 'vid'),
    distinctCount(VisitorSession, {}, 'startedAt', today, now, 'vid'), distinctCount(VisitorSession, {}, 'startedAt', yesterday, today, 'vid'),
    c(PageView, {}, 'createdAt', r.from, r.to), c(PageView, {}, 'createdAt', r.prevFrom, r.prevTo),
    c(LoginEvent, { type: 'failed' }, 'createdAt', r.from, r.to), c(LoginEvent, { type: 'failed' }, 'createdAt', r.prevFrom, r.prevTo),
    User.countDocuments({ status: 'suspended' }), User.countDocuments({ status: 'suspended', 'suspension.at': { $lt: r.from } }),
    c(ErrorEvent, {}, 'at', r.from, r.to), c(ErrorEvent, {}, 'at', r.prevFrom, r.prevTo),
    series(User, {}, 'createdAt', r), activeUserSeries(r), series(VisitorSession, {}, 'startedAt', r, 'vid'),
    series(PageView, {}, 'createdAt', r), series(LoginEvent, { type: 'failed' }, 'createdAt', r), series(ErrorEvent, {}, 'at', r)
  ]);
  const online = onlineNow();
  const kpi = (value, previous, trend, compare) => ({ value, previous, change: previous == null ? null : pctChange(value, previous), compare, trend: trend ? fill(keys, trend) : null });
  const period = r.range === 'today' ? 'yesterday' : r.range === 'custom' ? 'previous period' : `previous ${r.range === '1y' ? 'year' : r.range.replace('d', ' days')}`;
  return {
    range: { ...r, keys },
    kpis: {
      totalUsers: kpi(totalUsers, usersAtStart, sSignups, `vs start of period`),
      activeUsers: kpi(activeCur, activePrev, sActive, period),
      newToday: kpi(newToday, newYesterday, null, 'vs yesterday'),
      newWeek: kpi(newWeek, newPrevWeek, null, 'vs previous 7 days'),
      newMonth: kpi(newMonth, newPrevMonth, null, 'vs previous 30 days'),
      online: { value: online.users, previous: null, change: null, compare: `${online.anonymous} anonymous visitor${online.anonymous === 1 ? '' : 's'} online`, trend: null, live: true },
      visitors: kpi(visitorsCur, visitorsPrev, sVisitors, period),
      visitorsToday: kpi(visitorsToday, visitorsYesterday, null, 'vs yesterday'),
      pageViews: kpi(pvCur, pvPrev, sPv, period),
      failedLogins: kpi(failedCur, failedPrev, sFailed, period),
      suspended: kpi(suspended, suspendedBefore, null, 'vs start of period'),
      errors: kpi(errorsCur, errorsPrev, sErrors, period)
    }
  };
}

/** New users per bucket and the running total. */
export async function userGrowth(r) {
  const keys = bucketKeys(r);
  const [rows, before] = await Promise.all([series(User, {}, 'createdAt', r), User.countDocuments({ createdAt: { $lt: r.from } })]);
  const signups = fill(keys, rows);
  let total = before;
  return { keys, unit: r.unit, signups, total: signups.map(n => (total += n)) };
}

async function visitStats(from, to) {
  const rows = await VisitorSession.aggregate([
    { $match: { startedAt: between(from, to) } },
    { $group: { _id: null, sessions: { $sum: 1 }, visitors: { $addToSet: '$vid' }, pages: { $sum: '$pages' }, bounces: { $sum: { $cond: [{ $lte: ['$pages', 1] }, 1, 0] } }, returning: { $sum: { $cond: ['$returning', 1, 0] } }, durationMs: { $sum: { $subtract: ['$lastSeenAt', '$startedAt'] } } } },
    { $project: { _id: 0, sessions: 1, visitors: { $size: '$visitors' }, pages: 1, bounces: 1, returning: 1, durationMs: 1 } }
  ]);
  const s = rows[0] || { sessions: 0, visitors: 0, pages: 0, bounces: 0, returning: 0, durationMs: 0 };
  return {
    sessions: s.sessions, visitors: s.visitors, pageViews: s.pages,
    bounceRate: s.sessions ? s.bounces / s.sessions : 0,
    pagesPerSession: s.sessions ? s.pages / s.sessions : 0,
    avgSessionSeconds: s.sessions ? Math.round(s.durationMs / s.sessions / 1000) : 0,
    returningSessions: s.returning, newSessions: s.sessions - s.returning
  };
}

export async function visitorAnalytics(r) {
  const keys = bucketKeys(r);
  const [cur, prev, unique, sessions, returning, views] = await Promise.all([
    visitStats(r.from, r.to), visitStats(r.prevFrom, r.prevTo),
    series(VisitorSession, {}, 'startedAt', r, 'vid'), series(VisitorSession, {}, 'startedAt', r),
    series(VisitorSession, { returning: true }, 'startedAt', r), series(PageView, {}, 'createdAt', r)
  ]);
  const sessionsSeries = fill(keys, sessions), returningSeries = fill(keys, returning);
  return {
    keys, unit: r.unit, current: cur, previous: prev,
    series: { visitors: fill(keys, unique), sessions: sessionsSeries, pageViews: fill(keys, views), returning: returningSeries, new: sessionsSeries.map((n, i) => n - returningSeries[i]) }
  };
}

export async function activityAnalytics(r) {
  const keys = bucketKeys(r);
  const [logins, signups, failed, views, tests, sessions, races] = await Promise.all([
    series(LoginEvent, { type: 'login', success: true }, 'createdAt', r), series(User, {}, 'createdAt', r),
    series(LoginEvent, { type: 'failed' }, 'createdAt', r), series(PageView, {}, 'createdAt', r),
    series(Result, { race: { $exists: false } }, 'createdAt', r), series(VisitorSession, {}, 'startedAt', r),
    series(CompetitionRoom, { status: 'FINISHED' }, 'finishedAt', r)
  ]);
  const login = fill(keys, logins), fail = fill(keys, failed);
  return {
    keys, unit: r.unit,
    series: { logins: login, signups: fill(keys, signups), failedLogins: fail, pageViews: fill(keys, views), tests: fill(keys, tests), sessions: fill(keys, sessions), races: fill(keys, races) },
    successRate: login.map((n, i) => (n + fail[i] ? n / (n + fail[i]) : null))
  };
}

/**
 * Weekly signup cohorts and how many came back. Day 1 = active the calendar day after signing up,
 * Day 7 = active on days 7 to 13, Day 30 = active on days 30 to 59. A cohort only counts toward a
 * metric once enough time has passed to measure it.
 */
export async function retention({ weeks = 8 } = {}) {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisMonday = todayUtc - ((new Date(todayUtc).getUTCDay() + 6) % 7) * DAY;
  const since = new Date(thisMonday - (weeks - 1) * 7 * DAY);
  const users = await User.find({ createdAt: { $gte: since } }).select('_id createdAt').limit(20000).lean();
  if (!users.length) return { cohorts: [], overall: { d1: null, d7: null, d30: null }, definitions: DEFINITIONS };
  const ids = users.map(u => u._id);
  const dayOf = d => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY);
  const rows = await VisitorSession.aggregate([
    { $match: { user: { $in: ids }, startedAt: { $gte: since } } }, { $project: { user: 1, at: '$startedAt' } },
    { $unionWith: { coll: Result.collection.name, pipeline: [{ $match: { user: { $in: ids }, createdAt: { $gte: since } } }, { $project: { user: 1, at: '$createdAt' } }] } },
    { $unionWith: { coll: LoginEvent.collection.name, pipeline: [{ $match: { user: { $in: ids }, success: true, createdAt: { $gte: since } } }, { $project: { user: 1, at: '$createdAt' } }] } },
    { $group: { _id: { u: '$user', d: { $dateToString: { date: '$at', format: '%Y-%m-%d' } } } } }
  ]);
  const days = new Map();
  for (const r of rows) { const k = String(r._id.u); if (!days.has(k)) days.set(k, new Set()); days.get(k).add(Math.floor(Date.parse(`${r._id.d}T00:00:00Z`) / DAY)); }
  const nowDay = dayOf(now);
  const cohorts = new Map();
  const blank = () => ({ eligible: 0, retained: 0 });
  for (const u of users) {
    const sd = dayOf(u.createdAt);
    const week = new Date((sd - ((new Date(sd * DAY).getUTCDay() + 6) % 7)) * DAY).toISOString().slice(0, 10);
    if (!cohorts.has(week)) cohorts.set(week, { week, users: 0, d1: blank(), d7: blank(), d30: blank() });
    const c = cohorts.get(week); c.users++;
    const active = days.get(String(u._id)) || new Set();
    const any = (a, b) => { for (let d = sd + a; d <= sd + b; d++) if (active.has(d)) return true; return false; };
    for (const [key, a, b] of [['d1', 1, 1], ['d7', 7, 13], ['d30', 30, 59]]) {
      if (nowDay - sd < b) continue; // the window hasn't finished yet
      c[key].eligible++; if (any(a, b)) c[key].retained++;
    }
  }
  const list = [...cohorts.values()].sort((a, b) => a.week.localeCompare(b.week));
  const total = key => { const e = list.reduce((s, c) => s + c[key].eligible, 0), r = list.reduce((s, c) => s + c[key].retained, 0); return e ? r / e : null; };
  return { cohorts: list, overall: { d1: total('d1'), d7: total('d7'), d30: total('d30') }, definitions: DEFINITIONS };
}
const DEFINITIONS = { d1: 'Came back the day after signing up', d7: 'Active on days 7 to 13 after signing up', d30: 'Active on days 30 to 59 after signing up' };

export async function traffic(r) {
  const keys = bucketKeys(r);
  const [bySource, prevBySource, referrers, perSource] = await Promise.all([
    VisitorSession.aggregate([{ $match: { startedAt: between(r.from, r.to) } }, { $group: { _id: '$source', sessions: { $sum: 1 }, visitors: { $addToSet: '$vid' } } }, { $project: { sessions: 1, visitors: { $size: '$visitors' } } }]),
    VisitorSession.aggregate([{ $match: { startedAt: between(r.prevFrom, r.prevTo) } }, { $group: { _id: '$source', sessions: { $sum: 1 } } }]),
    VisitorSession.aggregate([{ $match: { startedAt: between(r.from, r.to), referrer: { $nin: ['', null] } } }, { $group: { _id: '$referrer', sessions: { $sum: 1 } } }, { $sort: { sessions: -1 } }, { $limit: 15 }]),
    VisitorSession.aggregate([{ $match: { startedAt: between(r.from, r.to) } }, { $group: { _id: { k: bucketExpr('$startedAt', r.unit, r.tz), s: '$source' }, n: { $sum: 1 } } }])
  ]);
  const prev = new Map(prevBySource.map(x => [x._id, x.sessions]));
  const sources = ['direct', 'search', 'social', 'referral', 'email', 'other'].map(s => {
    const row = bySource.find(x => x._id === s);
    const sessions = row?.sessions || 0;
    return { source: s, sessions, visitors: row?.visitors || 0, previous: prev.get(s) || 0, change: pctChange(sessions, prev.get(s) || 0) };
  });
  const seriesBySource = Object.fromEntries(sources.map(s => [s.source, fill(keys, perSource.filter(x => x._id.s === s.source).map(x => ({ _id: x._id.k, n: x.n })))]));
  return { keys, unit: r.unit, sources, referrers: referrers.map(x => ({ host: x._id, sessions: x.sessions })), series: seriesBySource };
}

export async function pages(r) {
  const perRoute = (from, to) => PageView.aggregate([
    { $match: { createdAt: between(from, to) } },
    { $group: { _id: '$route', views: { $sum: 1 }, visitors: { $addToSet: '$vid' }, timed: { $sum: { $cond: [{ $gt: ['$durationMs', 0] }, 1, 0] } }, durationMs: { $sum: '$durationMs' } } },
    { $project: { views: 1, visitors: { $size: '$visitors' }, avgSeconds: { $cond: ['$timed', { $divide: ['$durationMs', { $multiply: ['$timed', 1000] }] }, 0] } } }
  ]);
  const visits = field => VisitorSession.aggregate([{ $match: { startedAt: between(r.from, r.to) } }, { $group: { _id: `$${field}`, n: { $sum: 1 }, bounces: { $sum: { $cond: [{ $lte: ['$pages', 1] }, 1, 0] } } } }]);
  const [cur, prev, entries, exits] = await Promise.all([perRoute(r.from, r.to), perRoute(r.prevFrom, r.prevTo), visits('entryRoute'), visits('exitRoute')]);
  const prevViews = new Map(prev.map(x => [x._id, x.views]));
  const entryMap = new Map(entries.map(x => [x._id, x])), exitMap = new Map(exits.map(x => [x._id, x.n]));
  return {
    pages: cur.map(p => {
      const e = entryMap.get(p._id);
      return {
        route: p._id, views: p.views, visitors: p.visitors, avgSeconds: Math.round(p.avgSeconds),
        entries: e?.n || 0, bounceRate: e?.n ? e.bounces / e.n : null, exits: exitMap.get(p._id) || 0, exitRate: p.views ? (exitMap.get(p._id) || 0) / p.views : 0,
        previousViews: prevViews.get(p._id) || 0, change: pctChange(p.views, prevViews.get(p._id) || 0)
      };
    }).sort((a, b) => b.views - a.views)
  };
}

export async function devices(r) {
  const by = field => VisitorSession.aggregate([{ $match: { startedAt: between(r.from, r.to) } }, { $group: { _id: { $ifNull: [`$${field}`, 'Other'] }, sessions: { $sum: 1 }, visitors: { $addToSet: '$vid' } } }, { $project: { sessions: 1, visitors: { $size: '$visitors' } } }, { $sort: { sessions: -1 } }]);
  const [device, os, browser, screen] = await Promise.all([by('device'), by('os'), by('browser'), by('screen')]);
  const shape = rows => rows.map(x => ({ name: x._id || 'Unknown', sessions: x.sessions, visitors: x.visitors }));
  return { device: shape(device), os: shape(os), browser: shape(browser), screen: shape(screen.filter(x => x._id)) };
}

export async function geography(r) {
  const [visits, users, logins] = await Promise.all([
    VisitorSession.aggregate([{ $match: { startedAt: between(r.from, r.to) } }, { $group: { _id: { $ifNull: ['$country', ''] }, sessions: { $sum: 1 }, visitors: { $addToSet: '$vid' } } }, { $project: { sessions: 1, visitors: { $size: '$visitors' } } }]),
    User.aggregate([{ $match: notDeleted }, { $group: { _id: { $ifNull: ['$signupCountry', ''] }, users: { $sum: 1 } } }]),
    LoginEvent.aggregate([{ $match: { success: true, type: { $in: ['login', 'signup'] }, createdAt: between(r.from, r.to) } }, { $group: { _id: { $ifNull: ['$country', ''] }, logins: { $sum: 1 } } }])
  ]);
  const map = new Map();
  const row = c => { const k = c || ''; if (!map.has(k)) map.set(k, { country: k, visitors: 0, sessions: 0, users: 0, logins: 0 }); return map.get(k); };
  visits.forEach(x => Object.assign(row(x._id), { visitors: x.visitors, sessions: x.sessions }));
  users.forEach(x => { row(x._id).users = x.users; });
  logins.forEach(x => { row(x._id).logins = x.logins; });
  return {
    countries: [...map.values()].sort((a, b) => b.sessions - a.sessions || b.users - a.users),
    note: 'Country is approximate: from a proxy country header when available, otherwise from the browser language region. No IP geolocation or precise location is used.'
  };
}

export async function engagement(r) {
  const keys = bucketKeys({ ...r, unit: 'day' });
  const dr = { ...r, unit: 'day' };
  const to = r.to;
  const [dauRows, wau, mau, testsRows, testsTotal, activeInRange, visits, races] = await Promise.all([
    activeUserSeries(dr), activeUserCount(new Date(+to - 7 * DAY), to), activeUserCount(new Date(+to - 30 * DAY), to),
    series(Result, {}, 'createdAt', dr), Result.countDocuments({ createdAt: between(r.from, r.to) }), activeUserCount(r.from, r.to),
    visitStats(r.from, r.to), CompetitionRoom.countDocuments({ status: 'FINISHED', finishedAt: between(r.from, r.to) })
  ]);
  const dau = fill(keys, dauRows);
  const avgDau = dau.length ? dau.reduce((a, b) => a + b, 0) / dau.length : 0;
  return {
    keys, dau, tests: fill(keys, testsRows),
    summary: {
      avgDau: Math.round(avgDau * 10) / 10, wau, mau, stickiness: mau ? avgDau / mau : 0,
      tests: testsTotal, testsPerActiveUser: activeInRange ? testsTotal / activeInRange : 0,
      avgSessionSeconds: visits.avgSessionSeconds, pagesPerSession: visits.pagesPerSession, bounceRate: visits.bounceRate, racesFinished: races
    }
  };
}
