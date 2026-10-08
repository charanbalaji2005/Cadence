import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Result } from '../models/Result.js';

const router = Router();
router.use(requireAuth);

/** Competition record and recent races for the signed-in user. Flagged races don't count. */
router.get('/history', async (req, res) => {
  const match = { user: req.user._id, 'race.rank': { $exists: true }, 'race.status': { $ne: 'flagged' } };
  const [totals, recent] = await Promise.all([
    Result.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        played: { $sum: 1 },
        wins: { $sum: { $cond: [{ $and: [{ $eq: ['$race.rank', 1] }, { $gt: ['$race.players', 1] }] }, 1, 0] } },
        top3: { $sum: { $cond: [{ $lte: ['$race.rank', 3] }, 1, 0] } },
        best: { $max: '$wpm' }
      } }
    ]),
    Result.find(match).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  const t = totals[0] || { played: 0, wins: 0, top3: 0, best: 0 };
  res.set('Cache-Control', 'no-store');
  res.json({
    stats: { played: t.played, wins: t.wins, top3: t.top3, best: Math.round(t.best || 0), winRate: t.played ? Math.round((t.wins / t.played) * 100) : 0 },
    recent: recent.map(r => ({
      id: r._id.toString(), date: r.createdAt.getTime(), code: r.race.code, rank: r.race.rank, players: r.race.players, status: r.race.status,
      mode: r.mode, mode2: r.mode2, wpm: r.wpm, acc: r.acc,
      opponents: (r.race.opponents || []).map(o => ({ username: o.username, rank: o.rank, wpm: Math.round(o.wpm || 0), status: o.status }))
    }))
  });
});

export default router;
