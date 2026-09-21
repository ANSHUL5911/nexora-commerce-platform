import { Link } from 'react-router';
import { Button } from './Button.jsx';
import {
  EmptyCartIllustration,
  EmptySearchIllustration,
  EmptyOrdersIllustration,
  EmptyAdminIllustration,
  NetworkErrorIllustration,
  NotFoundIllustration,
} from './illustrations/index.js';
import './ui.css';

const PRESET_ILLUSTRATIONS = {
  cart: EmptyCartIllustration,
  search: EmptySearchIllustration,
  orders: EmptyOrdersIllustration,
  admin: EmptyAdminIllustration,
  error: NetworkErrorIllustration,
  'not-found': NotFoundIllustration,
};

/**
 * Architectural Editorial Empty State Component.
 * Supports dedicated hairline line-art illustrations, custom Lucide icons,
 * and deliberate editorial microcopy across storefront and admin.
 */
export function EmptyState({
  title = 'No items found',
  description = 'There are no items to display right now.',
  actionLabel,
  actionTo,
  onAction,
  icon,
  illustration,
  preset,
  headingLevel = 'h2',
  className = '',
}) {
  const HeadingTag = headingLevel;
  const ResolvedIllustration =
    illustration ||
    (preset && PRESET_ILLUSTRATIONS[preset]) ||
    (typeof icon === 'string' && PRESET_ILLUSTRATIONS[icon]);

  return (
    <div className={`nx-empty-state ${className}`.trim()} role="status">
      {ResolvedIllustration ? (
        <div className="nx-empty-illustration-wrap" aria-hidden="true">
          {typeof ResolvedIllustration === 'function' ? (
            <ResolvedIllustration size={100} />
          ) : (
            ResolvedIllustration
          )}
        </div>
      ) : icon ? (
        <div className="nx-empty-icon-wrap" aria-hidden="true">
          {icon}
        </div>
      ) : null}

      <HeadingTag className="nx-empty-title">{title}</HeadingTag>
      <p className="nx-empty-desc">{description}</p>

      {actionLabel && (
        <div className="nx-empty-action">
          {actionTo ? (
            <Link to={actionTo} className="nx-empty-link">
              <Button variant="primary">{actionLabel}</Button>
            </Link>
          ) : onAction ? (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
