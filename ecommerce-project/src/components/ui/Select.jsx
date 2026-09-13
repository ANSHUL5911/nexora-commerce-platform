import './ui.css';

export function Select({
  label,
  id,
  error,
  children,
  className = '',
  required = false,
  ...props
}) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const errorId = error && selectId ? `${selectId}-error` : undefined;

  return (
    <div className="nx-form-group">
      {label && (
        <label htmlFor={selectId} className="nx-label">
          {label} {required && <span aria-hidden="true" style={{ color: 'var(--color-status-error)' }}>*</span>}
        </label>
      )}
      <select
        id={selectId}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`nx-select ${error ? 'nx-has-error' : ''} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      {error && (
        <div id={errorId} className="nx-error-text" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
