import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { adminApi } from '../../../api/admin.js';

/**
 * OrderRestockModal Component (Phase 07.26B)
 * Dedicated administrative modal for physical inventory restocking of refunded order items.
 * Bounded by remaining eligible quantities: 0 < quantity <= (ordered - alreadyRestocked).
 */
export function OrderRestockModal({ isOpen, onClose, order, onRestockSuccess }) {
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState(() => {
    const initial = {};
    if (order?.items) {
      for (const item of order.items) {
        initial[item.productId] = item.remainingRestockableQuantity || 0;
      }
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!order) return null;

  const eligibleItems = (order.items || []).filter(
    (item) => (item.remainingRestockableQuantity || 0) > 0
  );

  const handleQuantityChange = (productId, val, max) => {
    const parsed = parseInt(val, 10);
    const validQty = isNaN(parsed) ? 0 : Math.max(0, Math.min(parsed, max));
    setQuantities((prev) => ({
      ...prev,
      [productId]: validQty,
    }));
  };

  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Restock reason is required for operational audit logging.');
      return;
    }

    const itemsToRestock = [];
    for (const item of eligibleItems) {
      const qty = quantities[item.productId] ?? 0;
      if (qty > 0) {
        itemsToRestock.push({
          productId: item.productId,
          quantity: qty,
        });
      }
    }

    if (itemsToRestock.length === 0) {
      setError('Please specify at least one item with quantity greater than zero to restock.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await adminApi.restockOrder(order.id, {
        reason: trimmedReason,
        items: itemsToRestock,
      });

      if (onRestockSuccess) {
        onRestockSuccess(response?.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to restock order:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Restock operation failed.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? undefined : onClose}
      title="Restock Refunded Order Items"
      maxWidth="620px"
      ariaLabel="Restock Refunded Order Items Modal"
    >
      <form onSubmit={handleRestockSubmit} className="nx-admin-modal-form">
        <div className="nx-admin-callout is-info">
          <strong>Physical Inventory Restock:</strong> Returned items will be added back into catalog{' '}
          <code>stock_quantity</code>. Quantities are strictly bounded by what was ordered minus what has
          already been restocked.
        </div>

        {eligibleItems.length === 0 ? (
          <p className="nx-admin-empty-text">All items in this order have already been fully restocked.</p>
        ) : (
          <div className="nx-admin-restock-items">
            <table className="nx-admin-table" aria-label="Eligible Items for Restock">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Ordered</th>
                  <th scope="col">Restocked</th>
                  <th scope="col">Remaining</th>
                  <th scope="col">Restock Qty</th>
                </tr>
              </thead>
              <tbody>
                {eligibleItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="nx-admin-primary-text">{item.productName}</span>
                    </td>
                    <td>{item.quantity}</td>
                    <td>{item.quantityRestocked || 0}</td>
                    <td>
                      <strong>{item.remainingRestockableQuantity}</strong>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={item.remainingRestockableQuantity}
                        className="nx-admin-input-compact"
                        value={quantities[item.productId] ?? item.remainingRestockableQuantity}
                        onChange={(e) =>
                          handleQuantityChange(
                            item.productId,
                            e.target.value,
                            item.remainingRestockableQuantity
                          )
                        }
                        disabled={submitting}
                        aria-label={`Restock quantity for ${item.productName}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="nx-admin-field-group">
          <label htmlFor="restock-reason" className="nx-admin-form-label">
            Restock Reason <span className="nx-required">*</span>
          </label>
          <textarea
            id="restock-reason"
            className="nx-admin-textarea"
            rows="3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Items returned to warehouse in original sealed packaging and verified in good condition."
            maxLength={500}
            required
            disabled={submitting}
          />
          <span className="nx-admin-form-help">Mandatory audit explanation. Maximum 500 characters.</span>
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
            className="button-primary"
            disabled={submitting || eligibleItems.length === 0}
          >
            {submitting ? 'Restocking Inventory...' : 'Confirm Restock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default OrderRestockModal;
