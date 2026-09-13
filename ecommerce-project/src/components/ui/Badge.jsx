import './ui.css';

export function Badge({
  children,
  variant = 'default',
  status,
  className = '',
  ...props
}) {
  let resolvedVariant = variant;

  if (status) {
    const s = String(status).toUpperCase();
    if (['PAID', 'DELIVERED', 'SUCCESS', 'ACTIVE', 'IN_STOCK'].includes(s)) {
      resolvedVariant = 'success';
    } else if (['PENDING', 'PENDING_PAYMENT', 'PROCESSING', 'LOW_STOCK', 'INITIATED'].includes(s)) {
      resolvedVariant = 'warning';
    } else if (['CANCELLED', 'FAILED', 'ERROR', 'EXPIRED', 'OUT_OF_STOCK'].includes(s)) {
      resolvedVariant = 'error';
    } else if (['SHIPPED', 'REFUNDED', 'INFO'].includes(s)) {
      resolvedVariant = 'info';
    }
  }

  return (
    <span className={`nx-badge nx-badge-${resolvedVariant} ${className}`.trim()} {...props}>
      {children || status}
    </span>
  );
}
