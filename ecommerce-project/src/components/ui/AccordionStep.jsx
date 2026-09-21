import { motion } from 'motion/react';
import useMeasure from 'react-use-measure';
import { springs, useReducedMotion, withReducedMotion } from '../../lib/motion.js';

/**
 * AccordionStep Component (Phase 2 Architectural Motion)
 * Smooth continuous height animation using react-use-measure + motion.
 * Prevents teleporting state transitions during multi-step checkout.
 */
export function AccordionStep({ isOpen, children, className = '' }) {
  const shouldReduceMotion = useReducedMotion();
  const [ref, bounds] = useMeasure({ debounce: 0, scroll: false });

  if (shouldReduceMotion) {
    return (
      <div className={className} style={{ display: isOpen ? 'block' : 'none' }}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={false}
      animate={{
        height: isOpen ? (bounds.height > 0 ? bounds.height : 'auto') : 0,
        opacity: isOpen ? 1 : 0,
      }}
      transition={withReducedMotion(springs.accordion, shouldReduceMotion)}
      style={{ overflow: 'hidden' }}
      className={className}
    >
      <div ref={ref}>
        {children}
      </div>
    </motion.div>
  );
}

export default AccordionStep;
