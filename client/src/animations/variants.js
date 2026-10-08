import { easeOutFast, springSmooth } from './transitions.js';

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.2 } }
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: springSmooth },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
};

export const staggerContainer = (staggerChildren = 0.03, delayChildren = 0) => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren,
      delayChildren
    }
  }
});

export const staggerItem = {
  initial: { opacity: 0, y: 4, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: easeOutFast }
};

export const tooltipVariant = {
  initial: { opacity: 0, scale: 0.94, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.96, y: 2, transition: { duration: 0.1 } }
};

export const modalVariant = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: springSmooth },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.15 } }
};

export const backdropVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};

export const timelineItemVariant = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0, transition: springSmooth }
};

export const achievementUnlockVariant = {
  initial: { scale: 0.8, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 450,
      damping: 25
    }
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
};
