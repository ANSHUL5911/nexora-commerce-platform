import './ui.css';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const variantClass = `nx-btn-${variant}`;
  const sizeClass = size !== 'md' ? `nx-btn-${size}` : '';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`nx-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              animation: 'nx-spin 0.6s linear infinite',
            }}
          />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
