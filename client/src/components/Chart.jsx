import { useEffect, useRef } from 'react';
import { drawChart, drawBars } from '../lib/charts.js';

/** Redraws an imperative SVG chart whenever its data or size changes. */
export function LineChart({ options, className = 'chart', deps = [] }) {
  const ref = useRef(null);
  const opt = useRef(options);
  opt.current = options;
  useEffect(() => {
    const box = ref.current; if (!box) return undefined;
    const draw = () => drawChart(box, opt.current);
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={className} ref={ref} />;
}

export function BarChart({ bins, label, deps = [] }) {
  const ref = useRef(null);
  const data = useRef(bins);
  data.current = bins;
  useEffect(() => {
    const box = ref.current; if (!box) return undefined;
    const draw = () => drawBars(box, data.current, { label });
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="chart" ref={ref} />;
}
