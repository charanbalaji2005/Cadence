import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Target, Activity } from 'lucide-react';
import { fadeUp } from '../../animations/variants.js';

const RANGES = [
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '90', label: '90 Days' },
  { id: '365', label: '1 Year' },
  { id: 'all', label: 'All Time' }
];

export default function PerformanceTrend({ results = [] }) {
  const [range, setRange] = useState('30');
  const [metric, setMetric] = useState('wpm'); // 'wpm' | 'acc' | 'consistency'
  const [hoverIndex, setHoverIndex] = useState(null);

  const filtered = useMemo(() => {
    if (!results || results.length === 0) return [];
    const now = Date.now();
    const cutoff = range === 'all' ? 0 : now - Number(range) * 864e5;
    return results.filter(r => r.date >= cutoff).slice(-60); // Cap at latest 60 points for clear SVG
  }, [results, range]);

  const points = useMemo(() => {
    if (filtered.length < 2) return [];
    const vals = filtered.map(r => r[metric] || 0);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const rangeVal = maxVal - minVal || 1;

    const width = 640;
    const height = 180;
    const padding = 20;

    return filtered.map((r, i) => {
      const x = padding + (i / (filtered.length - 1)) * (width - padding * 2);
      const val = r[metric] || 0;
      const y = height - padding - ((val - minVal) / rangeVal) * (height - padding * 2);
      return { x, y, val, date: r.date, mode: r.mode };
    });
  }, [filtered, metric]);

  const pathD = useMemo(() => {
    if (points.length < 2) return '';
    return points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length < 2) return '';
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    return `${pathD} L ${lastX} 180 L ${firstX} 180 Z`;
  }, [pathD, points]);

  const metricLabel = metric === 'wpm' ? 'Speed (WPM)' : metric === 'acc' ? 'Accuracy (%)' : 'Consistency (%)';
  const strokeColor = metric === 'wpm' ? 'var(--accent)' : metric === 'acc' ? '#38bdf8' : '#a78bfa';

  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="perf-trend-card glass"
      aria-label="Performance Trend"
    >
      <div className="perf-trend-header">
        <div className="perf-trend-title-wrap">
          <TrendingUp size={18} className="perf-trend-icon" />
          <h3 className="perf-trend-title">Performance Trend</h3>
        </div>

        <div className="perf-trend-controls">
          <div className="perf-metric-toggle">
            <button
              type="button"
              className={`pill-btn ${metric === 'wpm' ? 'active' : ''}`}
              onClick={() => setMetric('wpm')}
            >
              WPM
            </button>
            <button
              type="button"
              className={`pill-btn ${metric === 'acc' ? 'active' : ''}`}
              onClick={() => setMetric('acc')}
            >
              Accuracy
            </button>
            <button
              type="button"
              className={`pill-btn ${metric === 'consistency' ? 'active' : ''}`}
              onClick={() => setMetric('consistency')}
            >
              Consistency
            </button>
          </div>

          <div className="perf-range-toggle">
            {RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                className={`range-btn ${range === r.id ? 'active' : ''}`}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="perf-chart-wrap">
        {points.length >= 2 ? (
          <svg
            viewBox="0 0 640 180"
            className="perf-chart-svg"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path d={areaD} fill="url(#chartGradient)" />

            {/* Trend line */}
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover points */}
            {points.map((p, idx) => (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r={hoverIndex === idx ? 5 : 2.5}
                fill={hoverIndex === idx ? '#fff' : strokeColor}
                stroke={strokeColor}
                strokeWidth={hoverIndex === idx ? 2 : 1}
                className="perf-chart-point"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            ))}
          </svg>
        ) : (
          <div className="perf-chart-empty">
            <p>Take a few more tests in this time period to view performance trends.</p>
          </div>
        )}

        {hoverIndex !== null && points[hoverIndex] && (
          <div
            className="perf-chart-tooltip glass"
            style={{
              left: `${(points[hoverIndex].x / 640) * 100}%`,
              top: `${(points[hoverIndex].y / 180) * 100}%`
            }}
          >
            <strong>{Math.round(points[hoverIndex].val)} {metric === 'acc' || metric === 'consistency' ? '%' : 'WPM'}</strong>
            <small>{new Date(points[hoverIndex].date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
          </div>
        )}
      </div>
    </motion.section>
  );
}
