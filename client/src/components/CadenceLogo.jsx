/**
 * Animated Cadence logo mark using pure SVG and CSS animations (no external runtime dependencies).
 * Features the signature 5-segment dashed circle with a vertical emerald cursor on the right.
 */
export default function CadenceLogo({
  size = 36,
  className = '',
  animated = true,
  spinRing = false,
  showGlow = false
}) {
  return (
    <div
      className={`cadence-logo-wrap ${className}`}
      style={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        flexShrink: 0
      }}
    >
      {showGlow && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '-20%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            filter: 'blur(16px)',
            pointerEvents: 'none',
            zIndex: 0,
            opacity: 0.5
          }}
        />
      )}

      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="cadence-svg"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
          position: 'relative',
          zIndex: 1,
          transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1)'
        }}
      >
        {/* Dashed outer ring (5 rounded segments with space on the right) */}
        <circle
          cx="24"
          cy="24"
          r="15"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray="6.2 7.8 6.2 7.8 6.2 7.8 6.2 7.8 6.2 32.05"
          strokeDashoffset="-16.02"
          className={spinRing ? 'cadence-spin' : animated ? 'cadence-ring-pulse' : ''}
          style={{ transformOrigin: '24px 24px' }}
        />

        {/* Vertical cadence cursor / caret indicator in emerald green */}
        <line
          x1="34.5"
          y1="16"
          x2="34.5"
          y2="32"
          stroke="var(--accent)"
          strokeWidth="3.6"
          strokeLinecap="round"
          className={animated ? 'cadence-caret-blink' : ''}
          style={{
            transformOrigin: '34.5px 24px',
            filter: 'drop-shadow(0 0 6px var(--caret-glow))'
          }}
        />
      </svg>
    </div>
  );
}
