import './ui.css';

export function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius = 'var(--radius-xs)',
  className = '',
  style = {},
}) {
  return (
    <div
      aria-hidden="true"
      className={`nx-skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}
