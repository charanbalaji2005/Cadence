import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target, Zap, AlertTriangle, ArrowRight, Activity, Keyboard } from 'lucide-react';
import { fadeUp } from '../../animations/variants.js';

export default function HowYouType({ keyStats = {}, results = [], onPractice }) {
  const analysis = useMemo(() => {
    const list = Object.entries(keyStats || {});
    if (list.length === 0) return null;

    const formatted = list
      .filter(([_, v]) => v.n >= 3)
      .map(([k, v]) => {
        const acc = (1 - v.e / v.n) * 100;
        const latency = v.mc ? Math.round(v.ms / v.mc) : null;
        return { key: k, acc, n: v.n, errors: v.e, latency };
      });

    // Strongest keys
    const strongest = [...formatted].sort((a, b) => b.acc - a.acc).slice(0, 4);

    // Weakest keys (needs practice)
    const weakest = [...formatted].sort((a, b) => a.acc - b.acc).slice(0, 4);

    // Latency calculation
    let totalMs = 0;
    let totalMc = 0;
    for (const [_, v] of list) {
      totalMs += v.ms || 0;
      totalMc += v.mc || 0;
    }
    const avgLatency = totalMc > 0 ? Math.round(totalMs / totalMc) : 180;

    // Error rate
    let totalErrors = 0;
    let totalPresses = 0;
    for (const [_, v] of list) {
      totalErrors += v.e || 0;
      totalPresses += v.n || 0;
    }
    const errorRate = totalPresses > 0 ? ((totalErrors / totalPresses) * 100).toFixed(1) : 0;

    return { strongest, weakest, avgLatency, errorRate };
  }, [keyStats]);

  if (!analysis || results.length === 0) {
    return null;
  }

  const { strongest, weakest, avgLatency, errorRate } = analysis;

  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="how-you-type-card glass"
      aria-label="How You Type Analysis"
    >
      <div className="how-you-type-header">
        <div>
          <span className="cadence-kicker">cadence biometric insights</span>
          <h3 className="how-you-type-title">How You Type</h3>
        </div>

        {weakest.length > 0 && onPractice && (
          <button
            type="button"
            className="btn outline small practice-weak-btn"
            onClick={() => onPractice(weakest.map(w => w.key))}
          >
            <Keyboard size={15} />
            <span>Practice Weak Keys</span>
          </button>
        )}
      </div>

      <div className="how-you-type-overview-grid">
        <div className="how-you-type-metric-box">
          <span className="lbl">Average Key Latency</span>
          <strong className="val">{avgLatency} <small>ms</small></strong>
          <span className="sub">speed from thought to key</span>
        </div>

        <div className="how-you-type-metric-box">
          <span className="lbl">Overall Error Rate</span>
          <strong className="val">{errorRate}%</strong>
          <span className="sub">mistyped inputs</span>
        </div>
      </div>

      <div className="how-you-type-split-columns">
        {/* Strongest Keys */}
        <div className="how-you-type-column">
          <div className="column-title-row">
            <Zap size={16} style={{ color: 'var(--accent)' }} />
            <h4>Strongest Keys</h4>
          </div>
          <div className="key-badges-row">
            {strongest.map(s => (
              <div key={s.key} className="key-performance-badge strong">
                <span className="badge-letter">{s.key.toUpperCase()}</span>
                <span className="badge-acc">{Math.round(s.acc)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Needs Practice */}
        <div className="how-you-type-column">
          <div className="column-title-row">
            <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
            <h4>Needs Practice</h4>
          </div>
          <div className="key-badges-row">
            {weakest.map(w => (
              <div key={w.key} className="key-performance-badge weak">
                <span className="badge-letter">{w.key.toUpperCase()}</span>
                <span className="badge-acc">{Math.round(w.acc)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
