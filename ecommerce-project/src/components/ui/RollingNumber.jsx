import { motion, AnimatePresence } from 'motion/react';
import { useReducedMotion, springs, withReducedMotion } from '../../lib/motion.js';
import { formatMoney } from '../../utils/money.js';

/**
 * RollingNumber Component (Phase 2 Architectural Motion)
 * Replaces jarring tabular jumps with smooth, monospaced vertical ledger numeral rolls.
 * Respects prefers-reduced-motion: if enabled, updates instantly without layout shifts.
 */
export function RollingNumber({
  value,
  amountPaise,
  className = '',
  'data-testid': testId,
  ...props
}) {
  const shouldReduceMotion = useReducedMotion();
  const displayString = amountPaise !== undefined ? formatMoney(amountPaise) : String(value ?? '');

  if (shouldReduceMotion) {
    return (
      <span className={className} data-testid={testId} {...props}>
        {displayString}
      </span>
    );
  }

  return (
    <span
      className={`nx-rolling-number ${className}`.trim()}
      data-testid={testId}
      style={{
        display: 'inline-flex',
        overflow: 'hidden',
        verticalAlign: 'bottom',
        fontVariantNumeric: 'tabular-nums',
      }}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={displayString}
          initial={{ y: '30%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-30%', opacity: 0 }}
          transition={withReducedMotion(springs.responsive, shouldReduceMotion)}
          style={{ display: 'inline-block' }}
        >
          {displayString}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default RollingNumber;
