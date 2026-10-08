/**
 * Cadence Auto Traffic Manager & Surge Governor
 * Automatically detects traffic spikes, buffers incoming load, protects the database,
 * and engages an automatic virtual waiting room when traffic exceeds server capacity.
 *
 * Admins (role: ADMIN / SUPER_ADMIN) and /api/admin/* always bypass automatically.
 */

// Sliding window of request timestamps in the last 60 seconds
const requestTimestamps = [];
let inFlightRequests = 0;
let totalSurgeEvents = 0;
let totalQueuedRequests = 0;
let totalAdmittedRequests = 0;

// Default traffic manager configuration
let config = {
  enabled: true,
  mode: 'auto', // 'auto' | 'always_on' | 'disabled'
  surgeThresholdRpm: 300,      // Requests/min to trigger SURGE mitigation
  criticalThresholdRpm: 600,   // Requests/min to engage virtual waiting room
  maxConcurrent: 60,           // Max in-flight requests before buffering
  waitingRoomMessage: 'Cadence is experiencing a high volume of traffic. You are in our virtual waiting queue and will be admitted shortly.'
};

/**
 * Prunes request timestamps older than 60 seconds.
 */
function pruneTimestamps(now = Date.now()) {
  const windowStart = now - 60000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
    requestTimestamps.shift();
  }
}

/**
 * Returns current requests-per-minute rate.
 */
export function getCurrentRpm() {
  pruneTimestamps();
  return requestTimestamps.length;
}

/**
 * Evaluates current traffic status level: 'NORMAL' | 'SURGE' | 'CRITICAL'
 */
export function getTrafficStatus() {
  if (!config.enabled || config.mode === 'disabled') {
    return 'NORMAL';
  }
  if (config.mode === 'always_on') {
    return 'SURGE';
  }

  const rpm = getCurrentRpm();

  if (rpm >= config.criticalThresholdRpm || inFlightRequests >= config.maxConcurrent * 1.5) {
    return 'CRITICAL';
  }
  if (rpm >= config.surgeThresholdRpm || inFlightRequests >= config.maxConcurrent) {
    return 'SURGE';
  }
  return 'NORMAL';
}

/**
 * Returns comprehensive traffic metrics for the Admin Dashboard.
 */
export function getTrafficStats() {
  const now = Date.now();
  pruneTimestamps(now);

  const rpm = requestTimestamps.length;
  // Calculate requests in last 5 seconds for peak velocity
  const fiveSecStart = now - 5000;
  let fiveSecCount = 0;
  for (let i = requestTimestamps.length - 1; i >= 0; i--) {
    if (requestTimestamps[i] >= fiveSecStart) fiveSecCount++;
    else break;
  }
  const peakRps = Math.round((fiveSecCount / 5) * 10) / 10;

  const status = getTrafficStatus();

  return {
    status,
    rpm,
    peakRps,
    inFlightRequests,
    totalSurgeEvents,
    totalQueuedRequests,
    totalAdmittedRequests,
    config: { ...config },
    capacityPercent: Math.min(100, Math.round((rpm / config.surgeThresholdRpm) * 100))
  };
}

/**
 * Updates traffic manager configuration (called from Admin Panel).
 */
export function updateTrafficConfig(patch = {}) {
  if (typeof patch.enabled === 'boolean') config.enabled = patch.enabled;
  if (['auto', 'always_on', 'disabled'].includes(patch.mode)) config.mode = patch.mode;
  if (Number.isInteger(patch.surgeThresholdRpm) && patch.surgeThresholdRpm >= 10) {
    config.surgeThresholdRpm = patch.surgeThresholdRpm;
  }
  if (Number.isInteger(patch.criticalThresholdRpm) && patch.criticalThresholdRpm > config.surgeThresholdRpm) {
    config.criticalThresholdRpm = patch.criticalThresholdRpm;
  }
  if (Number.isInteger(patch.maxConcurrent) && patch.maxConcurrent >= 5) {
    config.maxConcurrent = patch.maxConcurrent;
  }
  if (typeof patch.waitingRoomMessage === 'string' && patch.waitingRoomMessage.trim()) {
    config.waitingRoomMessage = patch.waitingRoomMessage.trim();
  }
  return getTrafficStats();
}

/**
 * Simulates a traffic spike for testing from the Admin Panel.
 */
export function simulateTrafficSpike(count = 350) {
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    requestTimestamps.push(now - Math.floor(Math.random() * 30000));
  }
  totalSurgeEvents++;
  return getTrafficStats();
}

/**
 * Express middleware to manage traffic and automatically shed load / queue visitors.
 */
export function trafficManagerMiddleware(req, res, next) {
  // Always allow non-API assets (static assets, client bundle, etc.)
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // 1. VIP Bypass: Admin routes and admin users NEVER wait in line
  if (req.path.startsWith('/api/admin')) {
    return next();
  }
  if (req.user && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
    return next();
  }

  // 2. Critical system endpoints bypass queue
  if (
    req.path === '/api/health' ||
    req.path === '/api/wake' ||
    req.path === '/api/maintenance' ||
    req.path === '/api/traffic/status'
  ) {
    return next();
  }

  // 3. Record incoming request timestamp
  const now = Date.now();
  requestTimestamps.push(now);
  inFlightRequests++;

  const status = getTrafficStatus();

  // If status is CRITICAL or SURGE, evaluate whether to buffer non-VIP visitor
  if (status !== 'NORMAL') {
    // Check if visitor holds an active bypass pass token
    const hasTrafficPass = req.headers['x-cadence-traffic-pass'] || req.cookies?.tf_traffic_pass;

    // Buffer unauthenticated non-VIP visitors if concurrent limit exceeded
    if (!hasTrafficPass && !req.user && inFlightRequests > config.maxConcurrent) {
      totalQueuedRequests++;
      inFlightRequests--; // request did not proceed to work

      res.set('Retry-After', '3');
      res.set('X-Cadence-Traffic-Status', status);
      return res.status(429).json({
        queued: true,
        trafficStatus: status,
        message: config.waitingRoomMessage,
        queuePosition: Math.floor(Math.random() * 5) + 1,
        estimatedWaitSeconds: status === 'CRITICAL' ? 8 : 4,
        retryAfter: 3
      });
    }
  }

  totalAdmittedRequests++;

  // Track completion and decrease in-flight counter
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      inFlightRequests = Math.max(0, inFlightRequests - 1);
    }
  };

  res.on('finish', finish);
  res.on('close', finish);

  next();
}
