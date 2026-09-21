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
  const triggerElementRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element for focus restoration on close
    triggerElementRef.current = typeof document !== 'undefined' ? document.activeElement : null;

    let timer = null;
    if (import.meta.env.MODE !== 'test') {
      timer = setTimeout(() => {
        if (dialogRef.current && (document.activeElement === document.body || !dialogRef.current.contains(document.activeElement))) {
          const focusable = dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 50);
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      // Focus restoration on close
      if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
        triggerElementRef.current.focus();
      }
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

export default Modal;
