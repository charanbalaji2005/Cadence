import { Router } from 'express';
import { Result } from '../models/Result.js';
import { User } from '../models/User.js';
import { LB_LENGTHS, startOfToday } from '../utils/rank.js';

const router = Router();

/** Each player's single best eligible result, fastest first. */
const bestPerPlayer = match => [
  { $match: match },
  { $sort: { wpm: -1, acc: -1 } },
  { $group: { _id: '$user', wpm: { $first: '$wpm' }, acc: { $first: '$acc' }, raw: { $first: '$raw' }, consistency: { $first: '$consistency' }, date: { $first: '$createdAt' } } },
  { $sort: { wpm: -1, acc: -1 } }
];

const ACTIVE = { status: { $nin: ['suspended', 'deleted'] } };
// Verified SRM AP students: the server-written link mirror, never anything the browser sends.
const SRMAP = { 'connectedAccounts.srm_ap.verified': true };

/** The public SRM AP badge for an entry: verified + batch only, as on public profiles. */
const srmapBadge = u => (u.connectedAccounts?.srm_ap?.verified ? { batchYear: u.connectedAccounts.srm_ap.batchYear ?? null } : null);

/** Strip raw registration numbers from avatar URLs on public leaderboard */
const safeAvatar = avatar => {
  if (!avatar) return '';
  if (/AP\d{11}/i.test(avatar)) return '';
  return avatar;
};

/**
 * Public: guests can view the board. Only signed-in players' eligible results are on it.
 * board=srmap ranks only students with a verified Connect SRM AP link (optionally one batch).
 */
router.get('/', async (req, res) => {
  const length = LB_LENGTHS.includes(String(req.query.length)) ? String(req.query.length) : '15';
  const range = req.query.range === 'today' ? 'today' : 'all';
  const board = req.query.board === 'srmap' ? 'srmap' : 'global';
  const batch = board === 'srmap' && /^\d{4}$/.test(String(req.query.batch || '')) ? Number(req.query.batch) : null;
  const match = { lbEligible: true, mode2: length };
  if (range === 'today') match.createdAt = { $gte: startOfToday(Number(req.query.tz)) };

  let batches = [];
  if (board === 'srmap') {
    const filter = { ...SRMAP, ...ACTIVE, ...(batch ? { 'connectedAccounts.srm_ap.batchYear': batch } : {}) };
    const [ids, years] = await Promise.all([
      User.find(filter).select('_id').lean(),
      User.distinct('connectedAccounts.srm_ap.batchYear', { ...SRMAP, ...ACTIVE })
    ]);
    match.user = { $in: ids.map(u => u._id) };
    batches = years.filter(y => Number.isInteger(y)).sort((a, b) => b - a);
  }

  const [top, count] = await Promise.all([
    Result.aggregate([...bestPerPlayer(match), { $limit: 100 }]),
    Result.aggregate([{ $match: match }, { $group: { _id: '$user' } }, { $count: 'n' }])
  ]);
  // Suspended and deleted accounts drop off the board.
  const users = await User.find({ _id: { $in: top.map(t => t._id) }, ...ACTIVE }).select('username avatar connectedAccounts.srm_ap.verified connectedAccounts.srm_ap.batchYear').lean();
  const byId = new Map(users.map(u => [u._id.toString(), u]));
  const entries = top
    .map(t => ({ t, u: byId.get(t._id.toString()) }))
    .filter(x => x.u) // skip results whose account was deleted mid-request
    .map(({ t, u }) => ({ userId: t._id.toString(), username: u.username, avatar: safeAvatar(u.avatar), srmap: srmapBadge(u), wpm: t.wpm, acc: t.acc, raw: t.raw, consistency: t.consistency, date: new Date(t.date).getTime() }));

  let me = null;
  if (req.user) {
    const myId = req.user._id.toString();
    const idx = entries.findIndex(e => e.userId === myId);
    if (idx >= 0) me = { rank: idx + 1, wpm: entries[idx].wpm, acc: entries[idx].acc };
    // On the SRM AP board, only verified students (of the chosen batch) have a rank.
    else if (board === 'global' || match.user.$in.some(id => id.equals(req.user._id))) {
      const mine = await Result.findOne({ ...match, user: req.user._id }).sort({ wpm: -1, acc: -1 });
      if (mine) {
        const better = await Result.aggregate([...bestPerPlayer(match).slice(0, 3), { $match: { wpm: { $gt: mine.wpm } } }, { $count: 'n' }]);
        me = { rank: (better[0]?.n || 0) + 1, wpm: mine.wpm, acc: mine.acc };
      }
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json({ length, range, board, batch, batches, players: count[0]?.n || 0, entries, me });
});

export default router;
