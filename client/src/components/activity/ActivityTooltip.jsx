import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

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

  const tooltipWidth = 220;
  const margin = 16;
  const clampedX = Math.max(
    tooltipWidth / 2 + margin,
    Math.min(window.innerWidth - tooltipWidth / 2 - margin, position.x)
  );

  // If cell is near the top of the viewport, place tooltip below the cell; otherwise above
  const showBelow = position.y < 230;
  const targetY = showBelow
    ? (position.bottom || position.y + 16) + 10
    : position.y - 10;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: `${clampedX}px`,
        top: `${targetY}px`,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        pointerEvents: 'none',
        zIndex: 999999
      }}
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: showBelow ? -6 : 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: showBelow ? -4 : 4 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="activity-tooltip"
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
    </div>,
    document.body
  );
}
