import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Result } from '../models/Result.js';
import { LoginEvent } from '../models/LoginEvent.js';
import { SecurityEvent } from '../models/SecurityEvent.js';
import { ActivityEvent } from '../models/ActivityEvent.js';
import { PageView, VisitorSession } from '../models/Analytics.js';
import { SystemError, ErrorEvent } from '../models/SystemError.js';
import { AdminNotification, ExportJob } from '../models/AdminData.js';
import { CompetitionRoom } from '../models/CompetitionRoom.js';
import { getSettings } from './settings.js';
import { notifyAdmins } from './events.js';
import { apiMetrics } from './monitoring.js';
import { cleanupExports } from './exporter.js';
import * as A from './analytics.js';

const DAY = 864e5;

/* ---------- reports ---------- */

/** The period a report covers: the chosen day, or the 7 / 30 days ending with it. */
export function reportPeriod(type, date, tz = 'UTC') {
  const anchor = date ? new Date(date) : new Date();
  if (Number.isNaN(+anchor)) throw Object.assign(new Error('Choose a valid date.'), { status: 400 });
  const dayStart = A.startOfDay(anchor, tz);
  const to = new Date(Math.min(Date.now(), +dayStart + DAY));
  const days = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
  const from = new Date(+dayStart + DAY - days * DAY);
  const span = to - from;
  return { range: 'custom', from, to, prevFrom: new Date(+from - span), prevTo: from, tz, unit: days === 1 ? 'hour' : 'day' };
}

/** Builds a report from real data for the period, with the previous period for comparison. */
export async function buildReport(type, r) {
  const between = { $gte: r.from, $lt: r.to }, prevBetween = { $gte: r.prevFrom, $lt: r.prevTo };
  const [
    newUsers, newUsersPrev, totalUsers, activeUsers, activeUsersPrev,
    visits, visitsPrev, traffic, pages, logins, loginsPrev, failed, failedPrev, byProvider,
    security, tests, races, engagement, retention, errors, topErrors
  ] = await Promise.all([
    User.countDocuments({ createdAt: between }), User.countDocuments({ createdAt: prevBetween }), User.countDocuments({ status: { $ne: 'deleted' }, createdAt: { $lt: r.to } }),
    A.activeUserCount(r.from, r.to), A.activeUserCount(r.prevFrom, r.prevTo),
    A.visitorAnalytics(r).then(v => v.current), A.visitorAnalytics({ ...r, from: r.prevFrom, to: r.prevTo }).then(v => v.current),
    A.traffic(r), A.pages(r),
    LoginEvent.countDocuments({ type: 'login', success: true, createdAt: between }), LoginEvent.countDocuments({ type: 'login', success: true, createdAt: prevBetween }),
    LoginEvent.countDocuments({ type: 'failed', createdAt: between }), LoginEvent.countDocuments({ type: 'failed', createdAt: prevBetween }),
    LoginEvent.aggregate([{ $match: { type: { $in: ['login', 'signup'] }, success: true, createdAt: between } }, { $group: { _id: '$provider', n: { $sum: 1 } } }]),
    SecurityEvent.aggregate([{ $match: { createdAt: between } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
    Result.countDocuments({ createdAt: between }), CompetitionRoom.countDocuments({ status: 'FINISHED', finishedAt: between }),
    A.engagement(r), A.retention(), ErrorEvent.countDocuments({ at: between }),
    SystemError.find({ lastSeen: between }).sort({ count: -1 }).limit(5).select('type message route count severity').lean()
  ]);
  const ch = A.pctChange;
  return {
    type, period: { from: r.from, to: r.to, previousFrom: r.prevFrom, previousTo: r.prevTo, timezone: r.tz },
    users: { new: newUsers, newPrevious: newUsersPrev, newChange: ch(newUsers, newUsersPrev), total: totalUsers, active: activeUsers, activePrevious: activeUsersPrev, activeChange: ch(activeUsers, activeUsersPrev) },
    visitors: { ...visits, visitorsChange: ch(visits.visitors, visitsPrev.visitors), pageViewsChange: ch(visits.pageViews, visitsPrev.pageViews), previous: visitsPrev },
    traffic: traffic.sources.map(({ source, sessions, change }) => ({ source, sessions, change })),
    topPages: pages.pages.slice(0, 10).map(({ route, views, visitors, avgSeconds }) => ({ route, views, visitors, avgSeconds })),
    authentication: {
      logins, loginsChange: ch(logins, loginsPrev), failed, failedChange: ch(failed, failedPrev),
      successRate: logins + failed ? logins / (logins + failed) : null,
      byProvider: Object.fromEntries(byProvider.map(p => [p._id || 'unknown', p.n]))
    },
    security: Object.fromEntries(['normal', 'suspicious', 'critical'].map(s => [s, security.find(x => x._id === s)?.n || 0])),
    engagement: { tests, racesFinished: races, ...engagement.summary },
    retention: retention.overall,
    system: { errors, topErrors: topErrors.map(e => ({ type: e.type, message: e.message, route: e.route, count: e.count, severity: e.severity })) }
  };
}

/** Flattens a report to key,value rows for CSV download. */
export function flattenReport(obj, prefix = '') {
  const rows = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v instanceof Date) rows.push([key, v.toISOString()]);
    else if (Array.isArray(v)) v.forEach((item, i) => (item && typeof item === 'object' ? rows.push(...flattenReport(item, `${key}[${i}]`)) : rows.push([`${key}[${i}]`, item])));
    else if (v && typeof v === 'object') rows.push(...flattenReport(v, key));
    else rows.push([key, v]);
  }
  return rows;
}

/* ---------- retention ---------- */

/** Deletes data older than the configured retention. Audit logs are never purged. */
export async function runRetention() {
  if (mongoose.connection.readyState !== 1) return null;
  const r = (await getSettings()).retention;
  const before = days => ({ $lt: new Date(Date.now() - days * DAY) });
  const del = async (Model, filter) => (await Model.deleteMany(filter)).deletedCount || 0;
  const removed = {
    pageViews: await del(PageView, { createdAt: before(r.pageViewDays) }),
    visitorSessions: await del(VisitorSession, { startedAt: before(r.visitorSessionDays) }),
    activity: await del(ActivityEvent, { createdAt: before(r.activityDays) }),
    loginEvents: await del(LoginEvent, { createdAt: before(r.loginEventDays) }),
    securityEvents: await del(SecurityEvent, { createdAt: before(r.securityEventDays) }),
    errorEvents: await del(ErrorEvent, { at: before(r.errorDays) }),
    errors: await del(SystemError, { lastSeen: before(r.errorDays) }),
    notifications: await del(AdminNotification, { createdAt: before(90) }),
    competitions: await del(CompetitionRoom, { status: 'FINISHED', finishedAt: before(r.activityDays) }),
    exportJobs: await del(ExportJob, { createdAt: before(30), status: { $in: ['expired', 'failed'] } })
  };
  return removed;
}

/* ---------- monitors ---------- */

/** Raises admin notifications for traffic spikes, failed-login spikes and API error bursts. */
export async function runMonitors() {
  if (mongoose.connection.readyState !== 1) return;
  const now = Date.now(), hourAgo = new Date(now - 3600e3), dayAgo = new Date(now - DAY);
  const spike = async (Model, match, field, min, title, link, type) => {
    const [last, before] = await Promise.all([
      Model.countDocuments({ ...match, [field]: { $gte: hourAgo } }),
      Model.countDocuments({ ...match, [field]: { $gte: dayAgo, $lt: hourAgo } })
    ]);
    const avg = before / 23;
    if (last >= min && last >= Math.max(1, avg) * 3) {
      await notifyAdmins({ type, severity: type === 'failed_logins' ? 'critical' : 'info', title: title(last, avg), link, dedupeKey: `spike:${type}`, windowMinutes: 120 });
    }
  };
  await spike(PageView, {}, 'createdAt', 50, (n, avg) => `Traffic spike: ${n} page views in the last hour (usually ~${Math.round(avg)})`, '/admin/analytics/traffic', 'traffic_spike');
  await spike(LoginEvent, { type: 'failed' }, 'createdAt', 20, (n, avg) => `Failed sign-ins jumped to ${n} in the last hour (usually ~${Math.round(avg)})`, '/admin/security', 'failed_logins');
  const m = apiMetrics();
  if (m.requestsLast5Min >= 20 && m.errorRate5Min > 0.2) {
    await notifyAdmins({ type: 'api', severity: 'critical', title: `API errors: ${Math.round(m.errorRate5Min * 100)}% of requests failed in the last 5 minutes`, link: '/admin/system', dedupeKey: 'api:errors', windowMinutes: 30 });
  }
}

/** Starts the light background schedule. Everything runs in this process; no cron service is needed. */
export function startBackgroundJobs() {
  const every = (ms, fn) => { const t = setInterval(() => fn().catch(err => console.error('Background job failed:', err.message)), ms); t.unref(); };
  cleanupExports({ startup: true }).catch(() => {});
  every(6 * 3600e3, runRetention);
  every(10 * 60e3, runMonitors);
  every(15 * 60e3, () => cleanupExports());
  setTimeout(() => runRetention().catch(() => {}), 60e3).unref();
}
