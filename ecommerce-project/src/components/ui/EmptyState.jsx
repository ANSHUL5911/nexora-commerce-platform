import { Link } from 'react-router';
import { Button } from './Button.jsx';
import './ui.css';

export function EmptyState({
  title = 'No items found',
  description = 'There are no items to display right now.',
  actionLabel,
  actionTo,
  onAction,
  icon,
  className = '',
}) {
  return (
    <div className={`nx-empty-state ${className}`.trim()}>
      {icon && <div style={{ fontSize: '36px', marginBottom: 'var(--space-3)' }}>{icon}</div>}
      <h3 className="nx-empty-title">{title}</h3>
      <p className="nx-empty-desc">{description}</p>
      {actionLabel && (
        actionTo ? (
          <Link to={actionTo}>
            <Button variant="primary">{actionLabel}</Button>
          </Link>
        ) : onAction ? (
          <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
        ) : null
      )}
    </div>
  );
}
