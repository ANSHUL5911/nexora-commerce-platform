import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { adminApi } from '../../../api/admin.js';

/**
 * ProductDeleteModal Component (Phase 07.26B)
 * Modal for confirming administrative soft deletion (catalog deactivation) of a product.
 * Preserves historical order item snapshots and references.
 */
export function ProductDeleteModal({ isOpen, onClose, product, onProductDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !product) return null;

  const handleDelete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.deleteProduct(product.id);
      if (onProductDeleted) {
        onProductDeleted(product.id);
      }
      onClose();
    } catch (err) {
      console.error('Failed to deactivate product:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Failed to deactivate product.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? undefined : onClose}
      title="Deactivate Product"
      maxWidth="480px"
      ariaLabel="Deactivate Product Modal"
    >
      <div className="nx-admin-modal-content">
        <p className="nx-admin-confirm-text">
          Are you sure you want to deactivate <strong>{product.name}</strong>?
        </p>

        <div className="nx-admin-callout is-warning">
          <strong>Soft Deletion:</strong> This product will be marked as inactive and removed from the
          customer storefront catalog. Existing customer orders, historical items, and audit logs will remain intact.
        </div>

        {error && (
          <div className="nx-admin-form-error" role="alert">
            {error}
          </div>
        )}

        <div className="nx-admin-modal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nx-btn-danger"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? 'Deactivating...' : 'Confirm Deactivation'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ProductDeleteModal;
