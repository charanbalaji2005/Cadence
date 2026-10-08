export const springSmooth = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.8
};

export const springSnappy = {
  type: 'spring',
  stiffness: 500,
  damping: 35
};

export const easeOutFast = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1]
};

export const easeInOutSmooth = {
  duration: 0.35,
  ease: [0.4, 0, 0.2, 1]
};
