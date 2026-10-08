import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/** Which step to show for the time left before GO, from the server-synced clock. */
function stepFor(ms) {
  if (ms > 3000) return 'ready';
  if (ms > 0) return Math.ceil(ms / 1000);
  if (ms > -700) return 'GO';
  return null;
}

/**
 * 3, 2, 1, GO over the typing area. Purely visual: it never blocks input, and the race
 * itself starts from the server's start time, not from this animation.
 */
export default function Countdown({ startAt, serverNow }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(() => stepFor(startAt - serverNow()));
  useEffect(() => {
    const tick = () => setStep(stepFor(startAt - serverNow()));
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [startAt, serverNow]);

  return (
    <div className="cp-countdown" aria-hidden={step === null}>
      <AnimatePresence mode="popLayout">
        {step !== null && (
          <motion.span key={step} className={`cp-count${step === 'GO' ? ' go' : ''}${step === 'ready' ? ' ready' : ''}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.5, filter: 'blur(6px)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7, transition: { duration: 0.18 } }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
            {step === 'ready' ? 'Get ready' : step}
          </motion.span>
        )}
      </AnimatePresence>
      <span className="sr" aria-live="assertive">{step === 'GO' ? 'Go!' : typeof step === 'number' ? String(step) : ''}</span>
    </div>
  );
}
