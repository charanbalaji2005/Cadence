import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import ActivityCell from './ActivityCell.jsx';
import ActivityTooltip from './ActivityTooltip.jsx';
import DailyActivityPanel from './DailyActivityPanel.jsx';
import { fadeUp } from '../../animations/variants.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

const METRIC_OPTIONS = [
  { id: 'tests', label: 'Tests' },
  { id: 'characters', label: 'Characters' },
  { id: 'time', label: 'Typing Time' },
  { id: 'wpm', label: 'WPM' },
  { id: 'achievements', label: 'Achievements' }
];

export default function ActivityHeatmap({
  dailyMap = {},
  selectedYear = new Date().getFullYear(),
  onYearChange,
  availableYears = [],
  onViewTests
}) {
  const [metric, setMetric] = useState('tests');
  const [tooltipState, setTooltipState] = useState({ data: null, pos: null });
  const [selectedDay, setSelectedDay] = useState(null);

  // Generate 52 or 53 weeks (365/366 days) for the selected calendar year
  const { weeks, monthHeaders } = useMemo(() => {
    const isAllTime = selectedYear === 'all';
    const targetYear = isAllTime ? new Date().getFullYear() : Number(selectedYear);

    // Compute start date: start of the year aligned to Monday
    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear, 11, 31);

    // Day of week: 0 is Sun, 1 is Mon, ..., 6 is Sat -> align to Mon = 0
    let startDayOfWeek = startOfYear.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const startDate = new Date(startOfYear);
    startDate.setDate(startOfYear.getDate() - startDayOfWeek);

    const generatedWeeks = [];
    const generatedMonths = [];
    let currentWeek = [];
    let curr = new Date(startDate);
    let lastMonth = -1;

    // Build weeks until we pass the end of the year and complete the final week
    while (curr <= endOfYear || currentWeek.length > 0) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      const dayActivity = dailyMap[dateKey] || {
        date: dateKey,
        tests: 0,
        characters: 0,
        typingTime: 0,
        bestWpm: 0,
        averageWpm: 0,
        averageAccuracy: 0,
        achievements: []
      };

      currentWeek.push(dayActivity);

      if (currentWeek.length === 7) {
        generatedWeeks.push(currentWeek);

        // Check month label trigger
        const midDay = currentWeek[3];
        const midMonth = parseInt(midDay.date.split('-')[1], 10) - 1;
        if (midMonth !== lastMonth && midMonth >= 0 && midMonth < 12) {
          generatedMonths.push({
            name: MONTHS[midMonth],
            weekIndex: generatedWeeks.length - 1
          });
          lastMonth = midMonth;
        }

        currentWeek = [];
      }

      curr.setDate(curr.getDate() + 1);
      if (generatedWeeks.length >= 53 && currentWeek.length === 0) break;
    }

    return { weeks: generatedWeeks, monthHeaders: generatedMonths };
  }, [dailyMap, selectedYear]);

  const handleHover = useCallback((day, pos) => {
    setTooltipState({ data: day, pos });
  }, []);

  const handleLeave = useCallback(() => {
    setTooltipState({ data: null, pos: null });
  }, []);

  const handleCellClick = useCallback((day) => {
    setSelectedDay(day);
  }, []);

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="activity-heatmap-card glass"
      aria-label="Cadence Typing Activity Heatmap"
    >
      {/* Top Controls: Metric switcher & Year selector */}
      <div className="activity-heatmap-controls">
        <div className="activity-metric-switcher" role="tablist" aria-label="Activity Metric">
          <span className="activity-metric-label">
            <Layers size={14} /> Metric:
          </span>
          {METRIC_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={metric === opt.id}
              className={`activity-metric-btn ${metric === opt.id ? 'active' : ''}`}
              onClick={() => setMetric(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="activity-year-selector" aria-label="Year Selector">
          <button
            type="button"
            className="icon-btn activity-year-nav"
            onClick={() => onYearChange(Number(selectedYear) - 1)}
            title="Previous Year"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="activity-year-label">{selectedYear}</span>
          <button
            type="button"
            className="icon-btn activity-year-nav"
            onClick={() => onYearChange(Number(selectedYear) + 1)}
            title="Next Year"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Heatmap Grid Container */}
      <div className="activity-grid-scroll-wrap">
        <div className="activity-grid-inner">
          {/* Month labels row */}
          <div className="activity-month-labels">
            <div className="activity-weekday-spacer" />
            <div className="activity-months-track">
              {monthHeaders.map((m, i) => (
                <span
                  key={i}
                  className="activity-month-name"
                  style={{ gridColumnStart: m.weekIndex + 1 }}
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>

          {/* Grid: Weekday labels on left, columns of cells on right */}
          <div className="activity-grid-body">
            <div className="activity-weekday-labels" aria-hidden="true">
              {WEEKDAYS.map((day, idx) => (
                <span key={idx} className="activity-weekday-name">{day}</span>
              ))}
            </div>

            <div
              className="activity-cells-grid"
              role="grid"
              aria-label="Annual activity contribution grid"
            >
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="activity-week-col" role="row">
                  {week.map(day => (
                    <ActivityCell
                      key={day.date}
                      day={day}
                      metric={metric}
                      onHover={handleHover}
                      onLeave={handleLeave}
                      onClick={handleCellClick}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Legend */}
      <div className="activity-heatmap-footer">
        <div className="activity-summary-stats-note">
          <span>Click any square to inspect day performance</span>
        </div>

        <div className="activity-legend" aria-label="Activity Intensity Legend">
          <span>Less</span>
          <div className="activity-legend-cells">
            <span className="activity-cell" data-level={0} />
            <span className="activity-cell" data-level={1} />
            <span className="activity-cell" data-level={2} />
            <span className="activity-cell" data-level={3} />
            <span className="activity-cell" data-level={4} />
          </div>
          <span>More</span>
        </div>
      </div>

      {/* Interactive Tooltip */}
      <ActivityTooltip
        activeData={tooltipState.data}
        position={tooltipState.pos}
      />

      {/* Day Details Modal */}
      <DailyActivityPanel
        selectedDay={selectedDay}
        onClose={() => setSelectedDay(null)}
        onViewTests={onViewTests}
      />
    </motion.div>
  );
}
