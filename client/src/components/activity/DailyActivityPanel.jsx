import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Calendar, Activity, Trophy, Gauge, Target, Timer, Type, ArrowRight } from 'lucide-react';
import { modalVariant, backdropVariant } from '../../animations/variants.js';

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
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function DailyActivityPanel({
  selectedDay,
  onClose,
  onViewTests
}) {
  useEffect(() => {
    if (!selectedDay) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDay, onClose]);

  if (!selectedDay) return null;

  const {
    date,
    tests = 0,
    bestWpm = 0,
    averageWpm = 0,
    averageAccuracy = 0,
    typingTime = 0,
    characters = 0,
    achievements = []
  } = selectedDay;

  return (
    <AnimatePresence>
      <div className="activity-panel-backdrop" onClick={onClose}>
        <motion.div
          variants={modalVariant}
          initial="initial"
          animate="animate"
          exit="exit"
          className="activity-detail-modal glass"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="activity-detail-header">
            <div className="activity-detail-date-wrap">
              <Calendar size={18} className="activity-detail-icon" />
              <h3>{formatDate(date)}</h3>
            </div>
            <button
              type="button"
              className="icon-btn activity-detail-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          <div className="activity-detail-grid">
            <div className="activity-detail-card">
              <div className="activity-detail-card-top">
                <Activity size={16} />
                <span>Tests Finished</span>
              </div>
              <strong>{tests}</strong>
            </div>

            <div className="activity-detail-card">
              <div className="activity-detail-card-top">
                <Trophy size={16} style={{ color: '#fbbf24' }} />
                <span>Peak Speed</span>
              </div>
              <strong>{Math.round(bestWpm)} <small>WPM</small></strong>
            </div>

            <div className="activity-detail-card">
              <div className="activity-detail-card-top">
                <Gauge size={16} style={{ color: 'var(--accent)' }} />
                <span>Average Speed</span>
              </div>
              <strong>{Math.round(averageWpm)} <small>WPM</small></strong>
            </div>

            <div className="activity-detail-card">
              <div className="activity-detail-card-top">
                <Target size={16} style={{ color: '#38bdf8' }} />
                <span>Accuracy</span>
              </div>
              <strong>{averageAccuracy ? `${averageAccuracy.toFixed(1)}%` : '--'}</strong>
            </div>

            <div className="activity-detail-card">
              <div className="activity-detail-card-top">
                <Timer size={16} />
                <span>Time Typing</span>
              </div>
              <strong>{formatDuration(typingTime)}</strong>
            </div>

            <div className="activity-detail-card">
              <div className="activity-detail-card-top">
                <Type size={16} />
                <span>Characters</span>
              </div>
              <strong>{characters.toLocaleString()}</strong>
            </div>
          </div>

          {achievements && achievements.length > 0 && (
            <div className="activity-detail-achievements">
              <h4>Achievements Unlocked</h4>
              <div className="activity-detail-ach-list">
                {achievements.map((ach, idx) => (
                  <div key={idx} className="activity-detail-ach-badge">
                    <span>🏆</span>
                    <span>{ach}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tests > 0 && onViewTests && (
            <button
              type="button"
              className="btn primary block activity-view-tests-btn"
              onClick={() => {
                onClose();
                onViewTests(date);
              }}
            >
              <span>View tests from this day</span>
              <ArrowRight size={16} />
            </button>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
