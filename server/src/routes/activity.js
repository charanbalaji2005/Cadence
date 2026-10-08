import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { DailyActivity } from '../models/DailyActivity.js';
import { Result, COUNTED_RESULTS } from '../models/Result.js';
import { bulkRecordDailyTests } from '../utils/activity.js';

const router = Router();
router.use(requireAuth);

/**
 * Backfill DailyActivity from existing results if empty.
 */
async function ensureDailyActivity(userId) {
  const count = await DailyActivity.countDocuments({ user: userId });
  if (count === 0) {
    const existing = await Result.find({ user: userId, ...COUNTED_RESULTS }).sort({ createdAt: 1 });
    if (existing.length) {
      await bulkRecordDailyTests(userId, existing);
    }
  }
}

/**
 * GET /api/activity/year/:year
 * Returns aggregated daily activity for a given calendar year.
 */
router.get('/year/:year', async (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'Invalid year.' });
  }

  await ensureDailyActivity(req.user._id);

  const startStr = `${year}-01-01`;
  const endStr = `${year}-12-31`;

  const days = await DailyActivity.find({
    user: req.user._id,
    date: { $gte: startStr, $lte: endStr }
  }).sort({ date: 1 });

  res.set('Cache-Control', 'no-store');
  res.json({
    year,
    days: days.map(d => d.toPublic())
  });
});

/**
 * GET /api/activity/all
 * Returns all active days across all years.
 */
router.get('/all', async (req, res) => {
  await ensureDailyActivity(req.user._id);
  const days = await DailyActivity.find({ user: req.user._id }).sort({ date: 1 });
  res.set('Cache-Control', 'no-store');
  res.json({
    days: days.map(d => d.toPublic())
  });
});

/**
 * GET /api/activity/summary
 * Returns total tests, typing time, characters, best WPM, average WPM, and streaks.
 */
router.get('/summary', async (req, res) => {
  await ensureDailyActivity(req.user._id);

  const allDays = await DailyActivity.find({ user: req.user._id }).sort({ date: 1 });

  let totalTests = 0;
  let totalTypingTime = 0;
  let totalCharacters = 0;
  let bestWpm = 0;
  let weightedWpmSum = 0;

  for (const d of allDays) {
    totalTests += d.tests;
    totalTypingTime += d.typingTime;
    totalCharacters += d.characters;
    if (d.bestWpm > bestWpm) bestWpm = d.bestWpm;
    weightedWpmSum += (d.averageWpm || 0) * d.tests;
  }

  const averageWpm = totalTests > 0 ? Math.round(weightedWpmSum / totalTests) : 0;

  // Streak calculation
  let currentStreak = 0;
  let longestStreak = 0;

  if (allDays.length > 0) {
    const dates = allDays.map(d => d.date);
    const dateSet = new Set(dates);

    // Calculate longest streak
    let tempStreak = 0;
    const sortedDates = [...dateSet].sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    }

    // Calculate current streak from today or yesterday
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    now.setDate(now.getDate() - 1);
    const yesterdayStr = now.toISOString().slice(0, 10);

    let checkDate = new Date(dateSet.has(todayStr) ? todayStr : yesterdayStr);
    if (dateSet.has(todayStr) || dateSet.has(yesterdayStr)) {
      while (true) {
        const str = checkDate.toISOString().slice(0, 10);
        if (dateSet.has(str)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    totalTests,
    totalTypingTime,
    totalCharacters,
    bestWpm,
    averageWpm,
    currentStreak,
    longestStreak
  });
});

export default router;
