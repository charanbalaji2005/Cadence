import mongoose from 'mongoose';
import { z } from 'zod';
import { User } from '../../models/User.js';

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Unknown id.');
export const isId = v => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
export const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ?page & ?limit, capped so no request can pull an unbounded list. */
export function paging(q, max = 100) {
  const page = Math.max(1, Math.min(10000, parseInt(q.page, 10) || 1));
  const limit = Math.max(1, Math.min(max, parseInt(q.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}
export const paged = (items, total, p) => ({ items, total, page: p.page, limit: p.limit, pages: Math.max(1, Math.ceil(total / p.limit)) });

/** ?from & ?to on a date field. Invalid dates are ignored rather than matching everything wrongly. */
export function dateFilter(q, field) {
  const f = {};
  const from = q.from ? new Date(q.from) : null, to = q.to ? new Date(q.to) : null;
  if (from && !Number.isNaN(+from)) f.$gte = from;
  if (to && !Number.isNaN(+to)) f.$lte = /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? new Date(+to + 864e5 - 1) : to;
  return Object.keys(f).length ? { [field]: f } : {};
}

/** ?sort=field&dir=asc|desc against an allow-list. */
export function sortSpec(q, allowed, fallback) {
  const field = allowed.includes(q.sort) ? q.sort : fallback;
  return { [field]: q.dir === 'asc' ? 1 : -1, _id: q.dir === 'asc' ? 1 : -1 };
}

/** A ?user filter can be an id or a username; resolves to an ObjectId (or null if nobody matches). */
export async function resolveUserParam(v) {
  if (!v) return undefined;
  if (isId(v)) return new mongoose.Types.ObjectId(v);
  const u = await User.findOne({ usernameNormalized: String(v).toLowerCase().replace(/^@/, '') }).select('_id').lean();
  return u ? u._id : null;
}

export function bad(res, message, status = 400) { return res.status(status).json({ error: message }); }

/** Validates a body with zod; replies 400 with the first message. */
export function body(schema, req, res) {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) { bad(res, r.error.issues[0]?.message || 'Invalid request.'); return null; }
  return r.data;
}

/** Loads the :id user (including soft-deleted), or replies 404. */
export async function loadTarget(req, res, select = '') {
  if (!isId(req.params.id)) { bad(res, 'User not found.', 404); return null; }
  const u = await User.findById(req.params.id).select(select);
  if (!u) { bad(res, 'User not found.', 404); return null; }
  return u;
}

export const userRef = u => (u ? { id: String(u._id), username: u.username, avatar: u.avatar || '' } : null);
