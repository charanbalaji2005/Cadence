import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Result, COUNTED_RESULTS } from '../models/Result.js';
import { User } from '../models/User.js';
import { DailyActivity } from '../models/DailyActivity.js';
import { recordDailyTest, bulkRecordDailyTests } from '../utils/activity.js';
import { parse, resultSchema, importSchema } from '../utils/validate.js';
import { isPlausible, leaderboardCheck, pbKey } from '../utils/rank.js';
import { keyInc, userStatsUpdate } from '../utils/resultStats.js';

const router = Router();
router.use(requireAuth);

const pick = r => ({ wpm: r.wpm, raw: r.raw, acc: r.acc, consistency: r.consistency, mode: r.mode, mode2: r.mode2, language: r.language || 'english', punctuation: r.punctuation, numbers: r.numbers, elapsed: r.elapsed, chars: r.chars });

async function rankFor(userId, mode2, wpm) {
  const better = await Result.aggregate([
    { $match: { lbEligible: true, mode2, user: { $ne: userId } } },
    { $sort: { wpm: -1 } },
    { $group: { _id: '$user', wpm: { $first: '$wpm' } } },
    { $match: { wpm: { $gt: wpm } } },
    { $count: 'n' }
  ]);
  return (better[0]?.n || 0) + 1;
}

router.get('/', async (req, res) => {
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 1000));
  const rows = await Result.find({ user: req.user._id, ...COUNTED_RESULTS }).sort({ createdAt: -1 }).limit(limit);
  res.set('Cache-Control', 'no-store');
  res.json({ results: rows.reverse().map(r => r.toPublic()) });
});

router.post('/', async (req, res) => {
  const d = parse(resultSchema, req.body, res); if (!d) return;
  if (d.clientId) {
    const existing = await Result.findOne({ user: req.user._id, clientId: d.clientId });
    if (existing) return res.status(200).json({ result: existing.toPublic(), pb: null, leaderboard: null, duplicate: true });
  }
  const lb = leaderboardCheck(d);
  const result = await Result.create({ ...pick(d), user: req.user._id, lbEligible: lb.eligible, ...(d.clientId ? { clientId: d.clientId } : {}) });

  // Update aggregated DailyActivity
  recordDailyTest(req.user._id, result).catch(e => console.error('DailyActivity error:', e));

  const { update, pb } = userStatsUpdate(req.user, d);
  if (Object.keys(update).length) await User.updateOne({ _id: req.user._id }, update);

  const leaderboard = { eligible: lb.eligible, reason: lb.reason, rank: null, newBest: false };
  if (lb.eligible) {
    // The result is already saved; a ranking hiccup shouldn't make the save look failed.
    try {
      const best = await Result.findOne({ user: req.user._id, lbEligible: true, mode2: d.mode2 }).sort({ wpm: -1 }).select('wpm');
      leaderboard.newBest = !!best && best._id.equals(result._id);
      leaderboard.rank = await rankFor(req.user._id, d.mode2, best.wpm);
    } catch (err) { console.error('Ranking failed:', err.message); }
  }
  res.status(201).json({ result: result.toPublic(), pb, leaderboard });
});

/** Moves results a guest typed before signing in into their account. Imported results never rank. */
router.post('/import', async (req, res) => {
  const body = parse(importSchema, req.body, res); if (!body) return;
  const d = { results: body.results.map(r => resultSchema.safeParse(r)).filter(r => r.success).map(r => r.data) };
  if (!d.results.length) return res.status(201).json({ imported: 0, skipped: body.results.length });
  const now = Date.now();
  const docs = d.results.map(r => ({ ...pick(r), user: req.user._id, lbEligible: false, imported: true, createdAt: new Date(Math.min(r.date || now, now)) }));
  await Result.collection.insertMany(docs);

  // Update aggregated DailyActivity in background
  bulkRecordDailyTests(req.user._id, docs).catch(e => console.error('Bulk DailyActivity error:', e));

  const inc = {};
  d.results.forEach(r => Object.entries(keyInc(r.keyStats)).forEach(([k, v]) => { inc[k] = (inc[k] || 0) + v; }));
  const set = {};
  const bests = req.user.personalBests;
  d.results.forEach(r => {
    if ((r.mode !== 'time' && r.mode !== 'words') || r.acc < 50 || !isPlausible(r)) return;
    const key = pbKey(r), cur = set[`personalBests.${key}`] || bests?.get(key);
    if (!cur || r.wpm > cur.wpm) set[`personalBests.${key}`] = { wpm: r.wpm, acc: r.acc, raw: r.raw, consistency: r.consistency, date: new Date(r.date || now) };
  });
  const update = {};
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(update).length) await User.updateOne({ _id: req.user._id }, update);
  res.status(201).json({ imported: docs.length, skipped: body.results.length - docs.length });
});

router.delete('/', async (req, res) => {
  await Result.deleteMany({ user: req.user._id });
  await DailyActivity.deleteMany({ user: req.user._id });
  await User.updateOne({ _id: req.user._id }, { $set: { keyStats: {}, personalBests: {} } });
  res.json({ ok: true });
});

export default router;
