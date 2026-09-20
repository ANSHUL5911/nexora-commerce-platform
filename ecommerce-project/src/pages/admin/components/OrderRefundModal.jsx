import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { adminApi } from '../../../api/admin.js';
import { formatMoney } from '../../../utils/money.js';

/**
 * OrderRefundModal Component (Phase 07.26B)
 * Dedicated administrative modal for issuing a full financial refund on a settled order.
 * Calls POST /api/admin/orders/:orderId/refund with Idempotency-Key and mandatory confirmation.
 */
export function OrderRefundModal({ isOpen, onClose, order, onRefundSuccess }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!order) return null;

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await adminApi.refundOrder(order.id, {
        reason: reason.trim() || undefined,
      });

      if (onRefundSuccess) {
        onRefundSuccess(response?.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to issue refund:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Refund failed to process.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? undefined : onClose}
      title="Issue Full Order Refund"
      maxWidth="540px"
      ariaLabel="Issue Full Order Refund Modal"
    >
      <form onSubmit={handleRefundSubmit} className="nx-admin-modal-form">
        <div className="nx-admin-callout is-warning">
          <strong>Important:</strong> This operation immediately issues a full external refund of{' '}
          <strong>{formatMoney(order.totalCostPaise)}</strong> through the payment gateway (Razorpay)
          and transitions the order to <code>REFUNDED</code>. This action cannot be reversed.
        </div>

        <div className="nx-admin-field-group">
          <label htmlFor="refund-reason" className="nx-admin-form-label">
            Refund Reason (Recommended for audit trail)
          </label>
          <textarea
            id="refund-reason"
            className="nx-admin-textarea"
            rows="3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested refund due to delivery cancellation."
            maxLength={500}
            disabled={submitting}
          />
          <span className="nx-admin-form-help">Maximum 500 characters. Recorded in the immutable audit log.</span>
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
            type="submit"
            className="nx-btn-danger"
            disabled={submitting}
          >
            {submitting ? 'Processing Gateway Refund...' : 'Confirm Full Refund'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default OrderRefundModal;
