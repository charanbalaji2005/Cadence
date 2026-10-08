import { DailyActivity } from '../models/DailyActivity.js';

export function formatDateKey(dateObj) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toMidnightDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Record a test result into the user's aggregated DailyActivity.
 * Runs atomically without placing heavy computation on Render's server.
 */
export async function recordDailyTest(userId, test) {
  try {
    const d = test.createdAt ? new Date(test.createdAt) : new Date();
    const dateKey = formatDateKey(d);
    const dayDate = toMidnightDate(dateKey);

    const charsCount =
      test.chars
        ? (test.chars.correct || 0) + (test.chars.incorrect || 0) + (test.chars.extra || 0)
        : Math.round((test.wpm * 5 * test.elapsed) / 60);

    const doc = await DailyActivity.findOne({ user: userId, date: dateKey });

    if (!doc) {
      await DailyActivity.create({
        user: userId,
        date: dateKey,
        dayDate,
        tests: 1,
        characters: charsCount,
        typingTime: Math.round(test.elapsed),
        bestWpm: test.wpm,
        averageWpm: test.wpm,
        averageAccuracy: test.acc,
        achievements: []
      });
    } else {
      const prevTests = doc.tests || 0;
      const nextTests = prevTests + 1;
      const nextAvgWpm = ((doc.averageWpm || 0) * prevTests + test.wpm) / nextTests;
      const nextAvgAcc = ((doc.averageAccuracy || 0) * prevTests + test.acc) / nextTests;

      doc.tests = nextTests;
      doc.characters = (doc.characters || 0) + charsCount;
      doc.typingTime = (doc.typingTime || 0) + Math.round(test.elapsed);
      doc.bestWpm = Math.max(doc.bestWpm || 0, test.wpm);
      doc.averageWpm = nextAvgWpm;
      doc.averageAccuracy = nextAvgAcc;
      await doc.save();
    }
  } catch (err) {
    console.error('Error updating DailyActivity:', err.message);
  }
}

/**
 * Bulk updates daily activity for imported guest results.
 */
export async function bulkRecordDailyTests(userId, tests) {
  for (const test of tests) {
    await recordDailyTest(userId, test);
  }
}
