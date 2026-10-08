import { useReducedMotion } from 'framer-motion';

/**
 * Hook to provide safe animation variants respecting user's prefers-reduced-motion preference.
 */
export function useSafeAnimation(variants) {
  const shouldReduceMotion = useReducedMotion();

  if (!shouldReduceMotion) return variants;

  // Reduced motion: replace transforms with gentle opacity transitions only
  const safeVariants = {};
  for (const [key, val] of Object.entries(variants)) {
    if (typeof val === 'object') {
      const { x, y, scale, rotate, ...rest } = val;
      safeVariants[key] = {
        ...rest,
        transition: { duration: 0.15 }
      };
    } else {
      safeVariants[key] = val;
    }
  }
  return safeVariants;
}
