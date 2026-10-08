import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame, CheckCircle2, ShieldAlert, Award } from 'lucide-react';
import { fadeUp } from '../../animations/variants.js';

const MILESTONES = [
  { days: 3, label: '3 Days', desc: 'Starting strong' },
  { days: 7, label: '7 Days', desc: 'One week streak' },
  { days: 14, label: '14 Days', desc: 'Two weeks consistent' },
  { days: 30, label: '30 Days', desc: 'One full month' },
  { days: 60, label: '60 Days', desc: 'True dedication' },
  { days: 100, label: '100 Days', desc: 'Centurion typist' },
  { days: 365, label: '365 Days', desc: 'Master of cadence' }
];

export default function TypingStreak({
  currentStreak = 0,
  longestStreak = 0,
  results = []
}) {
  const { weekCount, monthCount } = useMemo(() => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 864e5;
    const oneMonthAgo = now - 30 * 864e5;

    let wk = 0;
    let mo = 0;
    for (const r of results) {
      if (r.date >= oneWeekAgo) wk++;
      if (r.date >= oneMonthAgo) mo++;
    }
    return { weekCount: wk, monthCount: mo };
  }, [results]);

  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="typing-streak-card glass"
      aria-label="Typing Streak and Consistency"
    >
      <div className="typing-streak-header">
        <div className="typing-streak-icon-pill">
          <Flame size={20} className="flame-icon" />
          <span>Cadence Streak</span>
        </div>
        <div className="typing-streak-current">
          <strong>{currentStreak}</strong> <small>days active</small>
        </div>
      </div>

      <div className="typing-streak-quick-stats">
        <div className="streak-quick-stat">
          <span className="lbl">Longest Streak</span>
          <span className="val">{longestStreak} days</span>
        </div>
        <div className="streak-quick-stat">
          <span className="lbl">Tests This Week</span>
          <span className="val">{weekCount}</span>
        </div>
        <div className="streak-quick-stat">
          <span className="lbl">Tests This Month</span>
          <span className="val">{monthCount}</span>
        </div>
      </div>

      {/* Milestone Track */}
      <div className="typing-milestones-wrap">
        <h4 className="milestones-title">Streak Milestones</h4>
        <div className="milestones-grid">
          {MILESTONES.map(m => {
            const unlocked = longestStreak >= m.days;
            return (
              <div
                key={m.days}
                className={`milestone-badge-card ${unlocked ? 'unlocked' : 'locked'}`}
              >
                <div className="milestone-badge-top">
                  <span className="milestone-icon">{unlocked ? '🔥' : '🔒'}</span>
                  <span className="milestone-days">{m.label}</span>
                </div>
                <span className="milestone-desc">{m.desc}</span>
                <div className="milestone-progress-bar">
                  <div
                    className="milestone-progress-fill"
                    style={{
                      width: `${Math.min(100, Math.round((currentStreak / m.days) * 100))}%`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
