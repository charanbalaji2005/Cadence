import { motion } from 'framer-motion';

/**
 * Animated Cadence logo mark.
 * Features the signature 5-segment dashed circle with a vertical green cursor on the right.
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
        <motion.div
          aria-hidden="true"
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.3, 0.7, 0.3]
          }}
          transition={{
            repeat: Infinity,
            duration: 2.2,
            ease: 'easeInOut'
          }}
          style={{
            position: 'absolute',
            inset: '-20%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
            filter: 'blur(16px)',
            pointerEvents: 'none',
            zIndex: 0
          }}
        />
      )}

      <motion.svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'visible',
          position: 'relative',
          zIndex: 1
        }}
        whileHover={animated ? { scale: 1.08, rotate: [0, -4, 4, 0] } : undefined}
        transition={{ duration: 0.3 }}
      >
        {/* Dashed outer ring (5 rounded segments with space on the right) */}
        <motion.circle
          cx="24"
          cy="24"
          r="15"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeDasharray="6.2 7.8 6.2 7.8 6.2 7.8 6.2 7.8 6.2 32.05"
          strokeDashoffset="-16.02"
          animate={
            spinRing
              ? { rotate: 360 }
              : animated
                ? {
                    strokeOpacity: [0.75, 1, 0.75]
                  }
                : undefined
          }
          transition={
            spinRing
              ? {
                  repeat: Infinity,
                  duration: 1.5,
                  ease: 'linear'
                }
              : animated
                ? {
                    repeat: Infinity,
                    duration: 3,
                    ease: 'easeInOut'
                  }
                : undefined
          }
          style={{ transformOrigin: '24px 24px' }}
        />

        {/* Vertical cadence cursor / caret indicator in emerald green */}
        <motion.line
          x1="34.5"
          y1="16"
          x2="34.5"
          y2="32"
          stroke="var(--accent)"
          strokeWidth="3.6"
          strokeLinecap="round"
          animate={
            animated
              ? {
                  opacity: [1, 0.2, 1],
                  scaleY: [1, 0.92, 1]
                }
              : undefined
          }
          transition={
            animated
              ? {
                  repeat: Infinity,
                  duration: 0.95,
                  ease: 'easeInOut'
                }
              : undefined
          }
          style={{
            transformOrigin: '34.5px 24px',
            filter: 'drop-shadow(0 0 6px var(--caret-glow))'
          }}
        />
      </motion.svg>
    </div>
  );
}
