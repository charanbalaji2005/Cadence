import { motion } from 'framer-motion';
import { Flame, Trophy, Gauge, Timer, Type, Activity, Calendar } from 'lucide-react';
import { fadeUp } from '../../animations/variants.js';

function formatHours(seconds = 0) {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatChars(num = 0) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toLocaleString();
}

export { formatHours, formatChars };

export default function ActivitySummary({
  totalTests = 0,
  totalTypingTime = 0,
  totalCharacters = 0,
  bestWpm = 0,
  averageWpm = 0,
  currentStreak = 0,
  longestStreak = 0
}) {
  const stats = [
    {
      id: 'tests',
      label: 'Total Tests',
      val: totalTests.toLocaleString(),
      sub: 'tests finished',
      icon: Activity,
      color: 'var(--accent)'
    },
    {
      id: 'time',
      label: 'Typing Time',
      val: formatHours(totalTypingTime),
      sub: 'active typing',
      icon: Timer,
      color: '#38bdf8'
    },
    {
      id: 'chars',
      label: 'Characters',
      val: formatChars(totalCharacters),
      sub: 'keystrokes logged',
      icon: Type,
      color: '#a78bfa'
    },
    {
      id: 'best',
      label: 'Best Speed',
      val: `${Math.round(bestWpm)}`,
      unit: 'WPM',
      sub: 'peak speed',
      icon: Trophy,
      color: '#fbbf24'
    },
    {
      id: 'avg',
      label: 'Average Speed',
      val: `${Math.round(averageWpm)}`,
      unit: 'WPM',
      sub: 'consistent pace',
      icon: Gauge,
      color: 'var(--accent)'
    },
    {
      id: 'streak',
      label: 'Current Streak',
      val: `${currentStreak}`,
      unit: 'days',
      sub: `best: ${longestStreak}d`,
      icon: Flame,
      color: '#f97316'
    }
  ];

  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="activity-summary-section"
      aria-label="Activity Summary"
    >
      <div className="activity-summary-header">
        <div>
          <span className="cadence-kicker">cadence analytics</span>
          <h2 className="activity-title">Typing Activity</h2>
          <p className="activity-subtitle">Your typing journey over time</p>
        </div>
      </div>

      <div className="activity-summary-grid">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.id} className="activity-stat-card glass">
              <div className="activity-stat-icon-wrap" style={{ color: s.color }}>
                <Icon size={18} />
              </div>
              <div className="activity-stat-meta">
                <span className="activity-stat-label">{s.label}</span>
                <div className="activity-stat-value-row">
                  <span className="activity-stat-value">{s.val}</span>
                  {s.unit && <span className="activity-stat-unit">{s.unit}</span>}
                </div>
                <span className="activity-stat-sub">{s.sub}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
