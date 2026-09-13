import './ui.css';

export function Input({
  label,
  id,
  error,
  type = 'text',
  className = '',
  required = false,
  ...props
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  return (
    <div className="nx-form-group">
      {label && (
        <label htmlFor={inputId} className="nx-label">
          {label} {required && <span aria-hidden="true" style={{ color: 'var(--color-status-error)' }}>*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`nx-input ${error ? 'nx-has-error' : ''} ${className}`.trim()}
        {...props}
      />
      {error && (
        <div id={errorId} className="nx-error-text" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
