import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { connectDb } from './db.js';
import { loadSession, csrfGuard } from './middleware/auth.js';
import authRoutes, { handleGithubRedirect } from './routes/auth.js';
import srmapRoutes from './routes/srmap.js';
import meRoutes from './routes/me.js';
import resultRoutes from './routes/results.js';
import leaderboardRoutes from './routes/leaderboard.js';
import activityRoutes from './routes/activity.js';
import userRoutes from './routes/users.js';
import friendRoutes from './routes/friends.js';
import competitionRoutes from './routes/competitions.js';
import { attachRealtime } from './realtime/server.js';
import { mongoStore } from './realtime/store.js';
import { backfillUsernameNormalized } from './utils/username.js';
import adminRoutes from './routes/admin/index.js';
import trackRoutes from './routes/track.js';
import { metricsMiddleware, captureError } from './services/monitoring.js';
import { track } from './services/events.js';
import { bootstrapAdmins } from './services/accounts.js';
import { startBackgroundJobs } from './services/jobs.js';
import { getSettings } from './services/settings.js';
import { trafficManagerMiddleware, getTrafficStats } from './services/trafficManager.js';
import { BroadcastMessage } from './models/BroadcastMessage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Every request gets an id, so an error report can be matched to the request that caused it.
app.use((req, res, next) => { req.id = crypto.randomUUID(); res.set('X-Request-Id', req.id); next(); });
app.use(metricsMiddleware);

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // needed by Google Identity Services
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
      frameSrc: ['https://accounts.google.com/gsi/'],
      // ws/wss origins are listed explicitly because older browsers don't count them as 'self'.
      connectSrc: ["'self'", ...config.clientOrigins.map(o => o.replace(/^http/, 'ws')), 'https://accounts.google.com/gsi/'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com', 'https://*.githubusercontent.com', 'https://oursrmap.purlyedit.in'],
      upgradeInsecureRequests: null // HTTPS is enforced by your proxy or host; this keeps plain-HTTP local runs working
    }
  }
}));
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use('/api', trafficManagerMiddleware);
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Slow down for a moment.' } }));
app.use('/api', loadSession, csrfGuard);

let arrivalCounter = 0;
// Render wake-up and arrival alert endpoint (active when deployed on Render / production, silent on localhost)
app.all('/api/wake', (req, res) => {
  const isRender = Boolean(process.env.RENDER || config.isProd || process.env.NODE_ENV === 'production');
  if (isRender) {
    arrivalCounter++;
    const from = req.query.from || req.body?.from || 'login/auth';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    console.log(`\n======================================================`);
    console.log(`🚨 [BACKEND ALERT] USER ARRIVAL DETECTED #${arrivalCounter}`);
    console.log(`   Source: ${from}`);
    console.log(`   Client IP: ${ip}`);
    console.log(`   Time: ${new Date().toLocaleString()}`);
    console.log(`   Server Status: Render instance AWAKE & READY`);
    console.log(`======================================================\n`);
  }
  res.json({
    ok: true,
    status: 'awake',
    arrivalCounter: isRender ? arrivalCounter : 0,
    serverTime: new Date().toISOString(),
    message: isRender ? 'Backend is awake and ready.' : 'Localhost development - wake engine disabled.'
  });
});

function formatTimeAgo(date) {
  if (!date) return 'Just now';
  const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

app.get('/api/notifications', async (req, res) => {
  if (!req.user) {
    return res.json({
      inbox: [],
      announcements: [],
      notifications: [],
      unreadCount: 0,
      totalCount: 0
    });
  }

  // Fetch admin broadcast messages from MongoDB
  let broadcasts = [];
  try {
    broadcasts = await BroadcastMessage.find({ active: true }).sort({ createdAt: -1 }).limit(100).lean();
  } catch (err) {
    console.warn('Failed to load broadcasts from db:', err);
  }

  const formatItem = (b) => ({
    id: String(b._id),
    category: b.category || 'Cadence Team',
    title: b.title,
    content: b.content,
    severity: b.severity || 'info',
    type: b.type === 'notification' ? (b.severity === 'urgent' ? 'warning' : b.severity || 'info') : b.type,
    author: b.author || 'Cadence Admin',
    time: formatTimeAgo(b.createdAt),
    read: false,
    createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString()
  });

  const dbInbox = broadcasts.filter(b => b.type === 'inbox').map(formatItem);
  const dbAnnouncements = broadcasts.filter(b => b.type === 'announcement').map(formatItem);
  const dbNotifications = broadcasts.filter(b => b.type === 'notification').map(formatItem);

  const defaultInbox = [
    {
      id: 'mail-welcome',
      category: 'Cadence Team',
      title: 'Welcome to Cadence!',
      content: 'Master your typing rhythm, discover daily streaks, and race against typists in real-time.',
      time: 'Just now',
      read: false,
      createdAt: req.user.createdAt ? new Date(req.user.createdAt).toISOString() : new Date().toISOString()
    },
    {
      id: 'mail-tips',
      category: 'Pro Tips',
      title: 'Rhythm over raw speed',
      content: 'Maintaining a steady pace prevents keystroke errors and maximizes your consistency rating.',
      time: '1d ago',
      read: false,
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ];

  const defaultAnnouncements = [
    {
      id: 'ann-cadence-v2',
      category: 'Release',
      title: 'Cadence v2.0 Platform Update',
      content: 'Live multiplayer race rooms, typing heatmaps, and public player profiles are now active!',
      time: '2d ago',
      createdAt: new Date(Date.now() - 172800000).toISOString()
    }
  ];

  const defaultNotifications = [
    {
      id: 'notif-init-1',
      category: 'Success',
      title: 'Account created',
      content: 'Your account was created successfully.',
      type: 'success',
      time: 'Just now',
      read: false,
      createdAt: req.user.createdAt ? new Date(req.user.createdAt).toISOString() : new Date().toISOString()
    }
  ];

  const inbox = [...dbInbox, ...defaultInbox];
  const announcements = [...dbAnnouncements, ...defaultAnnouncements];
  const notifications = [...dbNotifications, ...defaultNotifications];

  const unreadCount = inbox.filter(i => !i.read).length + notifications.filter(n => !n.read).length;

  res.json({
    inbox,
    announcements,
    notifications,
    unreadCount,
    totalCount: Math.max(25, inbox.length + announcements.length + notifications.length)
  });
});

app.get('/api/health', (req, res) => {
  const isRender = Boolean(process.env.RENDER || config.isProd || process.env.NODE_ENV === 'production');
  if (req.query.wake && isRender) {
    console.log(`⚡ [PING WAKEUP] Health ping received from user (${req.query.from || 'client'})`);
  }
  res.json({ ok: true, awake: true });
});

// Public maintenance status endpoint
app.get('/api/maintenance', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const s = await getSettings();
    const appCfg = s.application || {};
    res.json({
      maintenanceMode: Boolean(appCfg.maintenanceMode),
      maintenanceStart: appCfg.maintenanceStart || '',
      maintenanceEnd: appCfg.maintenanceEnd || '',
      maintenanceMessage: appCfg.maintenanceMessage || 'Cadence is temporarily under scheduled system maintenance. We are performing optimizations and will be back online shortly.'
    });
  } catch {
    res.json({
      maintenanceMode: false,
      maintenanceStart: '',
      maintenanceEnd: '',
      maintenanceMessage: ''
    });
  }
});

// Public live traffic status endpoint
app.get('/api/traffic/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getTrafficStats());
});

// Guard non-admin mutations when maintenance mode is active
app.use('/api', async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/admin') || req.path.startsWith('/auth') || req.path === '/wake' || req.path === '/maintenance') {
    return next();
  }
  if (req.user && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return next();
  }
  try {
    const s = await getSettings();
    if (s.application?.maintenanceMode) {
      return res.status(503).json({
        error: 'System is currently under scheduled maintenance. Changes are temporarily disabled.',
        maintenance: true,
        start: s.application?.maintenanceStart || '',
        end: s.application?.maintenanceEnd || ''
      });
    }
  } catch {
    // Proceed if settings cannot be read
  }
  next();
});

app.use('/api/auth/srmap', srmapRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/t', trackRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// GitHub OAuth callback alias: handles GitHub redirecting to /login?code=...
app.get('/login', (req, res, next) => {
  if (req.query.code) {
    return handleGithubRedirect(req, res);
  }
  next();
});

// In production, serve the built React app from the same origin.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1y', index: false, setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.code === 11000) return res.status(409).json({ error: 'That username or email is already in use.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
  // Errors thrown on purpose with a 4xx status (e.g. an invalid date range) carry a safe message.
  if (err?.status >= 400 && err.status < 500 && err.message) return res.status(err.status).json({ error: err.message });
  console.error(err);
  captureError(err, { source: 'server', route: `${req.method} ${req.originalUrl}`, requestId: req.id });
  res.status(500).json({ error: 'Something went wrong on the server. Try again.', requestId: req.id });
});

process.on('unhandledRejection', err => { console.error('Unhandled rejection:', err); captureError(err, { source: 'server', route: 'unhandledRejection', severity: 'high' }); });

// One HTTP server carries the API, the built client and the competition WebSockets.
const server = http.createServer(app);
const realtime = attachRealtime(server, {
  track: (type, user, metadata) => track(type, { user: { _id: user.id, username: user.username }, metadata }),
  log: { error: (msg, err) => { console.error(msg, err?.message || err); if (err instanceof Error) captureError(err, { source: 'realtime', route: String(msg).slice(0, 80) }); } }
});

connectDb()
  .then(() => {
    server.listen(config.port, () => console.log(`TypeFlow API listening on http://localhost:${config.port}`));
    // Rooms live in memory, so any the previous process left open are over.
    mongoStore.expireOrphans().catch(err => console.error('Could not close old rooms:', err.message));
    backfillUsernameNormalized().catch(err => console.error('Username backfill failed:', err.message));
    bootstrapAdmins().catch(err => console.error('Admin bootstrap failed:', err.message));
    startBackgroundJobs();
  })
  .catch(err => { console.error('Could not connect to MongoDB:', err.message); process.exit(1); });

// Render sends SIGTERM before a deploy or restart: tell players their room is ending, then exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    realtime.shutdown();
    server.close();
    setTimeout(() => process.exit(0), 300);
  });
}

export default app;
