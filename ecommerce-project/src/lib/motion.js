/**
 * Nexora Commerce Motion System (Phase 2 — Award Caliber Execution)
 * Grounded in Emil Kowalski's animation philosophy and Apple Design principles.
 * 
 * Rules:
 * 1. Restraint first: Motion only serves feedback, state indication, spatial consistency, or prevents jarring changes.
 * 2. Zero inline magic numbers: All components import named springs, durations, easings, and staggers from this file.
 * 3. JS-level reduced-motion gating: All animations check useReducedMotion and collapse gracefully.
 */

import { useReducedMotion as useFramerReducedMotion } from 'motion/react';

// ============================================================================
// 1. EASING CURVES (Cubic-bezier definitions)
// ============================================================================
export const easings = {
  // Swift deceleration for entries: starts fast, lands with precision
  easeOut: [0.23, 1, 0.32, 1],
  // Smooth symmetrical acceleration & deceleration for layout morphs
  easeInOut: [0.77, 0, 0.175, 1],
  // Apple fluid sheet / drawer deceleration curve
  easeDrawer: [0.32, 0.72, 0, 1],
  // Linear for continuous tickers or opacity dissolves
  linear: [0, 0, 1, 1],
};

// ============================================================================
// 2. NAMED SPRING CONFIGURATIONS
// ============================================================================
export const springs = {
  // Ultra-crisp feedback for buttons, press states, micro-interactions (no overshoot)
  responsive: {
    type: 'spring',
    stiffness: 420,
    damping: 34,
    mass: 0.8,
  },
  // Smooth continuous accordion unfolding (checkout steps, collapsible drawers)
  accordion: {
    type: 'spring',
    stiffness: 340,
    damping: 36,
    mass: 1,
  },
  // Active pill / tab layout morphing (admin nav tabs, category filters)
  tabIndicator: {
    type: 'spring',
    stiffness: 450,
    damping: 38,
    mass: 0.9,
  },
  // Archival specimen card to PDP hero shared element emergence
  specimenMorph: {
    type: 'spring',
    stiffness: 300,
    damping: 32,
    mass: 1,
  },
  // Gentle list item reordering and cart row removal
  listReorder: {
    type: 'spring',
    stiffness: 380,
    damping: 35,
    mass: 0.9,
  },
  // Restrained celebration/delight (rare, reserved for order ledger settlement)
  delight: {
    type: 'spring',
    stiffness: 280,
    damping: 24,
    mass: 0.9,
  },
};

// ============================================================================
// 3. TIME BUDGETS (in seconds)
// ============================================================================
export const durations = {
  instant: 0.1,    // 100ms - press feedback
  fast: 0.16,      // 160ms - tooltip, menu item hover, chip toggle
  base: 0.24,      // 240ms - dropdown open, accordion row
  moderate: 0.32,  // 320ms - modal entry, drawer slide
  slow: 0.45,      // 450ms - full screen hero transitions
};

// ============================================================================
// 4. STAGGER DELAYS (in seconds)
// ============================================================================
export const staggers = {
  micro: 0.025,
  fast: 0.04,
  base: 0.06,
  relaxed: 0.09,
};

// ============================================================================
// 5. REDUCED MOTION GATING & HELPERS
// ============================================================================

/**
 * Re-export useReducedMotion hook with automatic test-environment bypass
 */
export function useReducedMotion() {
  const prefersReduced = useFramerReducedMotion();
  if (import.meta.env?.MODE === 'test') {
    return true;
  }
  return Boolean(prefersReduced);
}

/**
 * Wraps any transition object with a zero-duration fallback if reduced motion is requested
 */
export function withReducedMotion(transitionConfig, shouldReduceMotion) {
  if (shouldReduceMotion) {
    return { duration: 0.01, ease: 'linear' };
  }
  return transitionConfig;
}

/**
 * Standardized entrance & exit animation variants for common UI patterns
 */
export const motionPresets = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: durations.fast, ease: easings.easeOut },
  },
  accordionContent: {
    initial: { height: 0, opacity: 0 },
    animate: { height: 'auto', opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: springs.accordion,
  },
  cardExit: {
    initial: { opacity: 1, height: 'auto', transform: 'scale(1)' },
    exit: { opacity: 0, height: 0, transform: 'scale(0.96)' },
    transition: springs.listReorder,
  },
  modalBackdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: durations.base, ease: easings.easeOut },
  },
  modalContent: {
    initial: { opacity: 0, scale: 0.97, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.97, y: 6 },
    transition: springs.responsive,
  },
};
