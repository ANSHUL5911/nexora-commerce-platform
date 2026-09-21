import { useId } from 'react';

/**
 * Architectural Star Rating Component.
 * Replaces fuzzy raster rating PNGs with crisp, fractional SVG stars.
 * Adheres to Nexora's editorial hairline aesthetic.
 */
export function StarRating({
  rating = 0,
  maxStars = 5,
  size = 13,
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...rest
}) {
  const baseId = useId();
  const clampedRating = Math.max(0, Math.min(maxStars, Number(rating) || 0));

  const stars = Array.from({ length: maxStars }, (_, i) => {
    const fillFraction = Math.max(0, Math.min(1, clampedRating - i));
    const fillPercent = Math.round(fillFraction * 100);
    const gradId = `${baseId}-star-${i}`;

    return (
      <svg
        key={i}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={`url(#${gradId})`}
        stroke="#121212"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="nx-star-icon"
        aria-hidden="true"
        style={{ flexShrink: 0, display: 'inline-block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset={`${fillPercent}%`} stopColor="#121212" />
            <stop offset={`${fillPercent}%`} stopColor="transparent" stopOpacity="1" />
          </linearGradient>
        </defs>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  });

  return (
    <span
      className={`nx-star-rating ${className}`.trim()}
      role="img"
      aria-label={ariaLabel || `Rated ${clampedRating} out of ${maxStars} stars`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        lineHeight: 1,
        verticalAlign: 'middle',
        ...style,
      }}
      {...rest}
    >
      {stars}
    </span>
  );
}

export default StarRating;
