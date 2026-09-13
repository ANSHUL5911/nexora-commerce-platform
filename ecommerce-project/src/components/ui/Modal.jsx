import { useEffect, useRef } from 'react';
import './ui.css';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '500px',
  ariaLabel,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent background scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="nx-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        className="nx-modal-dialog"
        style={{ maxWidth }}
      >
        <div className="nx-modal-header">
          {title && <h2 className="nx-modal-title">{title}</h2>}
          <button
            type="button"
            className="nx-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className="nx-modal-body">{children}</div>
      </div>
    </div>
  );
}
