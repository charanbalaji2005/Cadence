import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requirePermission } from '../../middleware/admin.js';
import { User } from '../../models/User.js';
import { config } from '../../config.js';
import { audit } from '../../services/audit.js';
import { track } from '../../services/events.js';
import users from './users.js';
import auth from './auth.js';
import insights from './insights.js';
import ops from './ops.js';

/**
 * /api/admin. Order matters: the session is already loaded (loadSession) and CSRF-checked
 * (csrfGuard) for all of /api; here every request must also carry admin access, then each
 * route checks its own permission.
 */
const router = Router();

// Rate limiter for claim attempts (protects admin password from brute force)
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many admin unlock attempts. Please wait a few minutes and try again.' }
});

/**
 * POST /api/admin/claim
 * Allows any authenticated user who enters the ADMIN_PASSWORD from .env to elevate to SUPER_ADMIN.
 */
router.post('/claim', claimLimiter, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in first before unlocking admin access.' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Admin password is required.' });
  }

  if (!config.adminPassword) {
    return res.status(500).json({ error: 'Admin password is not configured in server .env.' });
  }

  if (password.trim() !== config.adminPassword.trim()) {
    return res.status(403).json({ error: 'Invalid admin password. Please check ADMIN_PASSWORD in your .env file.' });
  }

  const previousRole = req.user.role || 'USER';
  await User.updateOne({ _id: req.user._id }, { $set: { role: 'SUPER_ADMIN' } });
  req.user.role = 'SUPER_ADMIN';

  await audit({
    actor: req.user,
    action: 'CLAIM_SUPER_ADMIN',
    targetType: 'user',
    targetId: req.user._id,
    targetLabel: `${req.user.username} <${req.user.email}>`,
    reason: 'Claimed via ADMIN_PASSWORD key',
    metadata: { previousRole, newRole: 'SUPER_ADMIN' },
    req
  }).catch(() => {});

  track('ADMIN_ACTION', {
    user: req.user,
    actor: req.user,
    target: 'CLAIM_SUPER_ADMIN',
    metadata: { previousRole, newRole: 'SUPER_ADMIN' }
  });

  return res.json({
    ok: true,
    role: 'SUPER_ADMIN',
    message: 'Admin access granted! You now have Super Admin privileges.'
  });
});

router.use(requirePermission('admin.access'));
router.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.user._id), message: { error: 'Too many admin requests. Slow down for a moment.' } }));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.use('/users', users);
router.use('/', auth);
router.use('/', insights);
router.use('/', ops);

export default router;
