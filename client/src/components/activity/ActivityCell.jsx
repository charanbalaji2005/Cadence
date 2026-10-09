import { memo } from 'react';

/**
 * Calculate cell intensity level 0-4 based on selected metric.
 */
export function getIntensityLevel(day, metric = 'tests') {
  if (!day) return 0;

  switch (metric) {
    case 'characters': {
      const c = day.characters || 0;
      if (c === 0) return 0;
      if (c < 500) return 1;
      if (c < 2000) return 2;
      if (c < 5000) return 3;
      return 4;
    }
    case 'time': {
      const t = day.typingTime || 0;
      if (t === 0) return 0;
      if (t < 120) return 1; // < 2m
      if (t < 600) return 2; // < 10m
      if (t < 1800) return 3; // < 30m
      return 4; // 30m+
    }
    case 'wpm': {
      const w = day.bestWpm || 0;
      if (w === 0) return 0;
      if (w < 50) return 1;
      if (w < 80) return 2;
      if (w < 110) return 3;
      return 4;
    }
    case 'achievements': {
      const a = (day.achievements && day.achievements.length) || 0;
      if (a === 0) return day.tests > 0 ? 1 : 0;
      if (a === 1) return 2;
      if (a === 2) return 3;
      return 4;
    }
    case 'tests':
    default: {
      const n = day.tests || 0;
      if (n === 0) return 0;
      if (n <= 2) return 1;
      if (n <= 5) return 2;
      if (n <= 10) return 3;
      return 4;
    }
  }
}

function ActivityCell({
  day,
  metric = 'tests',
  onHover,
  onLeave,
  onClick
}) {
  const level = getIntensityLevel(day, metric);
  const tests = day?.tests || 0;
  const dateStr = day?.date || '';

  const ariaLabel = tests > 0
    ? `${dateStr}: ${tests} tests, ${Math.round(day.averageWpm || 0)} avg WPM, ${Math.round(day.bestWpm || 0)} peak WPM`
    : `${dateStr}: No typing activity`;

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onHover?.(day, {
      x: rect.left + rect.width / 2,
      y: rect.top,
      bottom: rect.bottom,
      height: rect.height
    });
  };

  const handleFocus = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onHover?.(day, {
      x: rect.left + rect.width / 2,
      y: rect.top,
      bottom: rect.bottom,
      height: rect.height
    });
  };

  return (
    <button
      type="button"
      className="activity-cell"
      data-level={level}
      data-has-activity={tests > 0}
      data-has-achievement={Boolean(day?.achievements?.length)}
      aria-label={ariaLabel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      onFocus={handleFocus}
      onBlur={onLeave}
      onClick={() => onClick?.(day)}
    />
  );
}

export default memo(ActivityCell);
