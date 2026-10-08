import { raiseSecurity } from '../services/events.js';
import { clientIp } from '../utils/privacy.js';

/**
 * Role-based access control for the admin panel. Roles are ranked; each permission names the
 * lowest role that holds it. Today the app uses USER, ADMIN and SUPER_ADMIN; ANALYST and
 * MODERATOR already work here and only need to be assigned.
 */
export const ROLE_RANK = { USER: 0, ANALYST: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 };

export const PERMISSIONS = {
  'admin.access': 'ANALYST',
  'dashboard.view': 'ANALYST',
  'analytics.view': 'ANALYST',
  'visitors.view': 'ANALYST',
  'reports.manage': 'ANALYST',
  'users.view': 'MODERATOR',
  'users.moderate': 'MODERATOR',   // suspend, activate, revoke sessions, edit username
  'sessions.manage': 'MODERATOR',
  'security.view': 'MODERATOR',
  'activity.view': 'MODERATOR',
  'competitions.manage': 'MODERATOR',
  'users.delete': 'ADMIN',
  'audit.view': 'ADMIN',
  'export.manage': 'ADMIN',
  'system.view': 'ADMIN',
  'errors.manage': 'ADMIN',
  'settings.app': 'ADMIN',
  'settings.retention': 'ADMIN',
  'users.roles': 'SUPER_ADMIN',    // only super admins create, remove or change admins
  'users.purge': 'SUPER_ADMIN',
  'settings.security': 'SUPER_ADMIN'
};

export const rankOf = user => ROLE_RANK[user?.role] ?? 0;
export const can = (user, permission) => !!user && user.status !== 'suspended' && user.status !== 'deleted' && rankOf(user) >= ROLE_RANK[PERMISSIONS[permission]];
export const permissionsFor = user => Object.keys(PERMISSIONS).filter(p => can(user, p));

/**
 * Guards an admin route. Identity comes only from the server-side session (loadSession);
 * a role, user id or flag sent by the browser is never trusted.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Log in to do that.' });
    if (!can(req.user, permission)) {
      // Repeated attempts to reach admin APIs without the role are worth knowing about.
      raiseSecurity({
        type: 'admin_access_denied', severity: rankOf(req.user) === 0 ? 'suspicious' : 'normal',
        title: `${req.user.username} tried to use an admin API without permission`,
        user: req.user, ip: clientIp(req), details: { permission, path: req.originalUrl.split('?')[0] }, dedupeKey: `denied:${req.user._id}`
      });
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}

/** May `actor` moderate `target`? Never yourself through these routes, and never someone of equal or higher rank. */
export function canActOn(actor, target) {
  if (String(actor._id) === String(target._id)) return { ok: false, error: "You can't do that to your own account here." };
  if (rankOf(target) >= rankOf(actor)) return { ok: false, error: 'You can only manage accounts with a lower role than yours.' };
  return { ok: true };
}
