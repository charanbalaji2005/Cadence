import { AnimatePresence, motion } from 'framer-motion';
import { tooltipVariant } from '../../animations/variants.js';

function formatDuration(sec = 0) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function ActivityTooltip({ activeData, position }) {
  if (!activeData || !position) return null;

  const { date, tests, averageWpm, bestWpm, averageAccuracy, typingTime, characters, achievements } = activeData;

  // Clamp style coordinates so tooltip doesn't clip screen
  const style = {
    position: 'fixed',
    left: `${Math.max(12, Math.min(window.innerWidth - 240, position.x))}px`,
    top: `${Math.max(12, position.y - 12)}px`,
    transform: 'translate(-50%, -100%)',
    pointerEvents: 'none',
    zIndex: 9999
  };

  return (
    <AnimatePresence>
      <motion.div
        variants={tooltipVariant}
        initial="initial"
        animate="animate"
        exit="exit"
        style={style}
        className="activity-tooltip glass"
        role="tooltip"
      >
        <div className="activity-tooltip-date">{formatDate(date)}</div>

        {tests > 0 ? (
          <div className="activity-tooltip-body">
            <div className="activity-tooltip-headline">
              <span className="activity-tooltip-badge">{tests} test{tests === 1 ? '' : 's'}</span>
              {achievements && achievements.length > 0 && (
                <span className="activity-tooltip-ach-badge">🏆 {achievements.length}</span>
              )}
            </div>

            <div className="activity-tooltip-grid">
              <div className="activity-tooltip-row">
                <span>Avg WPM</span>
                <strong>{Math.round(averageWpm)}</strong>
              </div>
              <div className="activity-tooltip-row">
                <span>Best WPM</span>
                <strong>{Math.round(bestWpm)}</strong>
              </div>
              <div className="activity-tooltip-row">
                <span>Accuracy</span>
                <strong>{averageAccuracy ? `${averageAccuracy.toFixed(1)}%` : '--'}</strong>
              </div>
              <div className="activity-tooltip-row">
                <span>Typing Time</span>
                <strong>{formatDuration(typingTime)}</strong>
              </div>
              <div className="activity-tooltip-row">
                <span>Characters</span>
                <strong>{(characters || 0).toLocaleString()}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="activity-tooltip-empty">No activity recorded</div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
