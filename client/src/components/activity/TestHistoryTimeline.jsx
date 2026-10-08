import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Trophy, Target, Gauge, Sparkles } from 'lucide-react';
import { timelineItemVariant } from '../../animations/variants.js';

function formatDayHeader(dateNum) {
  const d = new Date(dateNum);
  const now = new Date();
  const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(dateNum).setHours(0, 0, 0, 0)) / (864e5));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TestHistoryTimeline({ results = [] }) {
  // Group tests by day
  const grouped = useMemo(() => {
    const list = [...results].reverse().slice(0, 30); // show recent 30 items
    const groups = [];
    let curHeader = null;
    let curItems = [];

    for (const r of list) {
      const header = formatDayHeader(r.date);
      if (header !== curHeader) {
        if (curHeader) groups.push({ header: curHeader, items: curItems });
        curHeader = header;
        curItems = [r];
      } else {
        curItems.push(r);
      }
    }
    if (curHeader && curItems.length) {
      groups.push({ header: curHeader, items: curItems });
    }
    return groups;
  }, [results]);

  if (!results || results.length === 0) {
    return (
      <div className="timeline-empty glass">
        <p>No tests recorded in history yet.</p>
      </div>
    );
  }

  return (
    <div className="test-timeline-container" aria-label="Test History Timeline">
      <div className="timeline-spine" aria-hidden="true" />

      {grouped.map((grp, gIdx) => (
        <div key={gIdx} className="timeline-day-group">
          <div className="timeline-day-badge">
            <span>{grp.header}</span>
          </div>

          <div className="timeline-items-list">
            {grp.items.map((test, tIdx) => {
              const timeStr = new Date(test.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const isHigh = test.wpm >= 90;

              return (
                <motion.div
                  key={test.id || `${gIdx}-${tIdx}`}
                  variants={timelineItemVariant}
                  initial="initial"
                  whileInView="animate"
                  viewport={{ once: true, margin: '-20px' }}
                  className={`timeline-card glass ${isHigh ? 'highlight' : ''}`}
                >
                  <div className="timeline-card-dot" />

                  <div className="timeline-card-header">
                    <span className="timeline-card-time">{timeStr}</span>
                    <span className="timeline-card-mode">
                      {test.mode} {test.mode2 ? `• ${test.mode2}` : ''}
                    </span>
                    {isHigh && (
                      <span className="timeline-speed-tag">
                        <Sparkles size={12} /> fast run
                      </span>
                    )}
                  </div>

                  <div className="timeline-card-stats">
                    <div className="timeline-stat">
                      <span className="timeline-val highlight">{Math.round(test.wpm)}</span>
                      <span className="timeline-lbl">WPM</span>
                    </div>
                    <div className="timeline-stat">
                      <span className="timeline-val">{test.acc ? test.acc.toFixed(1) : 100}%</span>
                      <span className="timeline-lbl">Accuracy</span>
                    </div>
                    <div className="timeline-stat">
                      <span className="timeline-val">{test.consistency ? Math.round(test.consistency) : '--'}%</span>
                      <span className="timeline-lbl">Consistency</span>
                    </div>
                    <div className="timeline-stat">
                      <span className="timeline-val">{Math.round(test.elapsed)}s</span>
                      <span className="timeline-lbl">Duration</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
