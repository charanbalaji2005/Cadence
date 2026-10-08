import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flag, Zap, Gauge, Rocket, Wind, Crown, Target, Activity, Repeat, Medal, Flame, CalendarCheck, Timer, Moon } from 'lucide-react';
import { ACHIEVEMENTS, RARITY, aggregate } from '../../lib/achievements.js';
import { fadeUp } from '../../animations/variants.js';

const ICON_MAP = {
  Flag, Zap, Gauge, Rocket, Wind, Crown, Target, Activity, Repeat, Medal, Flame, CalendarCheck, Timer, Moon
};

export default function AchievementActivity({ results = [] }) {
  const { list, unlockedCount } = useMemo(() => {
    const agg = aggregate(results);
    const mapped = ACHIEVEMENTS.map(ach => {
      const isUnlocked = ach.test(agg);
      return {
        ...ach,
        unlocked: isUnlocked
      };
    });
    const count = mapped.filter(m => m.unlocked).length;
    return { list: mapped, unlockedCount: count };
  }, [results]);

  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="achievement-activity-card glass"
      aria-label="Achievement Activity"
    >
      <div className="achievement-activity-header">
        <div className="ach-title-row">
          <Trophy size={18} className="ach-header-icon" />
          <h3 className="achievement-activity-title">Achievements</h3>
        </div>
        <span className="ach-counter-badge">
          {unlockedCount} / {ACHIEVEMENTS.length} unlocked
        </span>
      </div>

      <div className="achievements-gallery-grid">
        {list.map(ach => {
          const Icon = ICON_MAP[ach.icon] || Trophy;
          const color = RARITY[ach.rarity] || 'var(--accent)';

          return (
            <div
              key={ach.id}
              className={`ach-badge-card ${ach.unlocked ? 'unlocked' : 'locked'}`}
              title={`${ach.name}: ${ach.desc} (${ach.rarity})`}
            >
              <div
                className="ach-icon-circle"
                style={{
                  color: ach.unlocked ? color : 'var(--sub)',
                  borderColor: ach.unlocked ? color : 'var(--hairline)'
                }}
              >
                <Icon size={20} />
              </div>
              <div className="ach-badge-meta">
                <strong className="ach-name">{ach.name}</strong>
                <p className="ach-desc">{ach.desc}</p>
                <span
                  className="ach-rarity-tag"
                  style={{ color: ach.unlocked ? color : 'var(--sub)' }}
                >
                  {ach.rarity}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
