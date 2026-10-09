import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requirePermission } from '../../middleware/admin.js';
import { User } from '../../models/User.js';
import { config } from '../../config.js';
import { audit } from '../../services/audit.js';
import { track } from '../../services/events.js';
import { createSession } from '../../utils/session.js';
import users from './users.js';
import auth from './auth.js';
import insights from './insights.js';
import ops from './ops.js';
import srmap from './srmap.js';
import broadcasts from './broadcasts.js';

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
 * Allows any authenticated user or visitor who enters the ADMIN_PASSWORD from .env to obtain SUPER_ADMIN.
 */
router.post('/claim', claimLimiter, async (req, res) => {
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

  let user = req.user;
  const previousRole = user?.role || 'NONE';

  if (user) {
    await User.updateOne({ _id: user._id }, { $set: { role: 'SUPER_ADMIN' } });
    user.role = 'SUPER_ADMIN';
  } else {
    // Visitor is unauthenticated: locate existing super admin or create/elevate a root super admin
    let adminUser = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!adminUser) {
      adminUser = await User.findOne({});
      if (adminUser) {
        adminUser.role = 'SUPER_ADMIN';
        await adminUser.save();
      } else {
        adminUser = await User.create({
          username: 'admin',
          email: 'admin@cadence.app',
          passwordHash: '!',
          role: 'SUPER_ADMIN',
          emailVerified: true
        });
      }
    }
    await createSession(req, res, adminUser, true, 'admin_claim');
    user = adminUser;
    req.user = adminUser;
  }

  await audit({
    actor: user,
    action: 'CLAIM_SUPER_ADMIN',
    targetType: 'user',
    targetId: user._id,
    targetLabel: `${user.username} <${user.email}>`,
    reason: 'Claimed via ADMIN_PASSWORD key',
    metadata: { previousRole, newRole: 'SUPER_ADMIN' },
    req
  }).catch(() => {});

  track('ADMIN_ACTION', {
    user,
    actor: user,
    target: 'CLAIM_SUPER_ADMIN',
    metadata: { previousRole, newRole: 'SUPER_ADMIN' }
  });

  return res.json({
    ok: true,
    role: 'SUPER_ADMIN',
    user: { id: user._id, username: user.username, email: user.email, role: 'SUPER_ADMIN' },
    message: 'Admin access granted! You now have Super Admin privileges.'
  });
});

router.use(requirePermission('admin.access'));
router.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: req => String(req.user._id), message: { error: 'Too many admin requests. Slow down for a moment.' } }));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.use('/users', users);
router.use('/srmap', srmap);
router.use('/broadcasts', broadcasts);
router.use('/', auth);
router.use('/', insights);
router.use('/', ops);

export default router;
