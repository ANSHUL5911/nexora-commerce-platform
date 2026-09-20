import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { adminApi } from '../../../api/admin.js';
import { formatMoney } from '../../../utils/money.js';
import { OrderRefundModal } from './OrderRefundModal.jsx';
import { OrderRestockModal } from './OrderRestockModal.jsx';

/**
 * OrderDetailModal Component (Phase 07.26B)
 * Comprehensive operational order inspector adhering to backend DTO contract,
 * state machine constraints, payment attempt history, restock records, and administrative actions.
 */
export function OrderDetailModal({ isOpen, onClose, orderId, onOrderMutated }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Status transition state
  const [targetStatus, setTargetStatus] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState(null);

  // Modals for dedicated operational actions
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);

  const fetchOrderDetail = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getOrder(id);
      setOrder(response?.data || null);
    } catch (err) {
      console.error('Failed to load order detail:', err);
      setError(err.message || 'Unable to retrieve order details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrderDetail(orderId);
      setTargetStatus('');
      setTransitionNote('');
      setTransitionError(null);
    } else {
      setOrder(null);
    }
  }, [isOpen, orderId, fetchOrderDetail]);

  if (!isOpen) return null;

  // Allowed forward state machine transitions (for UX guidance; backend is authoritative)
  const getNextAllowedStatuses = (currentStatus) => {
    switch (currentStatus) {
      case 'PENDING_PAYMENT':
        return ['CANCELLED'];
      case 'PAID':
        return ['PROCESSING'];
      case 'PROCESSING':
        return ['SHIPPED'];
      case 'SHIPPED':
        return ['DELIVERED'];
      default:
        return [];
    }
  };

  const allowedNextStatuses = order ? getNextAllowedStatuses(order.orderStatus) : [];

  const handleStatusTransition = async (e) => {
    e.preventDefault();
    if (!targetStatus) return;

    setTransitioning(true);
    setTransitionError(null);

    try {
      const response = await adminApi.updateOrderStatus(order.id, {
        status: targetStatus,
        note: transitionNote.trim() || undefined,
      });

      setOrder(response?.data);
      setTargetStatus('');
      setTransitionNote('');
      if (onOrderMutated) {
        onOrderMutated(response?.data);
      }
    } catch (err) {
      console.error('Failed to update order status:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Failed to update order status.';
      setTransitionError(msg);
    } finally {
      setTransitioning(false);
    }
  };

  const handleRefundSuccess = () => {
    fetchOrderDetail(order.id);
    if (onOrderMutated) {
      onOrderMutated();
    }
  };

  const handleRestockSuccess = () => {
    fetchOrderDetail(order.id);
    if (onOrderMutated) {
      onOrderMutated();
    }
  };

  const hasRemainingRestockable = (order?.items || []).some(
    (item) => (item.remainingRestockableQuantity || 0) > 0
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={order ? `Order ${order.id}` : 'Order Details'}
        maxWidth="820px"
        ariaLabel="Order Detail Modal"
      >
        {loading && (
          <div className="nx-admin-loading" role="status">
            <div className="nx-admin-spinner" aria-hidden="true" />
            <p>Loading comprehensive order details...</p>
          </div>
        )}

        {error && (
          <div className="nx-admin-error-box" role="alert">
            <p>{error}</p>
          </div>
        )}

        {!loading && order && (
          <div className="nx-admin-order-detail-content">
            {/* Top Operational Status Bar */}
            <div className="nx-admin-detail-banner">
              <div className="nx-admin-detail-status-group">
                <span className="nx-admin-field-label">Order Status:</span>
                <Badge status={order.orderStatus} />
                {order.reservationExpiresAt && order.orderStatus === 'PENDING_PAYMENT' && (
                  <span className="nx-admin-mono-number nx-text-muted">
                    Reservation Expires:{' '}
                    {new Date(order.reservationExpiresAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Dedicated Operational Actions */}
              <div className="nx-admin-detail-action-buttons">
                {order.isRefundEligible && (
                  <button
                    type="button"
                    className="nx-btn-danger-outline"
                    onClick={() => setShowRefundModal(true)}
                  >
                    Issue Full Refund
                  </button>
                )}

                {order.isRestockEligible && hasRemainingRestockable && (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => setShowRestockModal(true)}
                  >
                    Restock Items
                  </button>
                )}
              </div>
            </div>

            {/* Customer & Shipping Information Grid */}
            <div className="nx-admin-grid-2col">
              <div className="nx-admin-detail-box">
                <h3 className="nx-admin-box-title">Customer Information</h3>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">Name:</span>
                  <span className="nx-admin-field-value">
                    {order.customer?.fullName || order.shippingAddress?.fullName || 'Guest Customer'}
                  </span>
                </div>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">Email:</span>
                  <span className="nx-admin-field-value">{order.customer?.email || '—'}</span>
                </div>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">User ID:</span>
                  <code className="nx-admin-field-value">{order.userId || 'Guest (Unauthenticated)'}</code>
                </div>
              </div>

              <div className="nx-admin-detail-box">
                <h3 className="nx-admin-box-title">Shipping Address</h3>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">Recipient:</span>
                  <span className="nx-admin-field-value">{order.shippingAddress?.fullName}</span>
                </div>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">Address:</span>
                  <span className="nx-admin-field-value">{order.shippingAddress?.addressLine1}</span>
                </div>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">Location:</span>
                  <span className="nx-admin-field-value">
                    {order.shippingAddress?.city}, {order.shippingAddress?.state}{' '}
                    <code className="nx-admin-id-tag">{order.shippingAddress?.pincode}</code>
                  </span>
                </div>
                <div className="nx-admin-field">
                  <span className="nx-admin-field-label">Phone:</span>
                  <span className="nx-admin-field-value">{order.shippingAddress?.phone}</span>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="nx-admin-detail-section">
              <h3 className="nx-admin-box-title">Order Items</h3>
              <div className="nx-admin-table-wrap">
                <table className="nx-admin-table" aria-label="Order Items Snapshot">
                  <thead>
                    <tr>
                      <th scope="col">Product Snapshot</th>
                      <th scope="col">Unit Price</th>
                      <th scope="col">Qty</th>
                      <th scope="col">Total</th>
                      <th scope="col">Restocked</th>
                      <th scope="col">Restockable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items || []).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="nx-admin-cell-stacked">
                            <span className="nx-admin-primary-text">{item.productName}</span>
                            <code className="nx-admin-secondary-text">{item.productId.slice(0, 8)}&hellip;</code>
                          </div>
                        </td>
                        <td className="nx-admin-mono-number">{formatMoney(item.unitPricePaise)}</td>
                        <td>{item.quantity}</td>
                        <td className="nx-admin-mono-number">{formatMoney(item.lineTotalPaise)}</td>
                        <td>{item.quantityRestocked || 0}</td>
                        <td>
                          <strong>{item.remainingRestockableQuantity}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="nx-admin-cost-breakdown">
                <div className="nx-admin-cost-row">
                  <span>Subtotal:</span>
                  <span className="nx-admin-mono-number">{formatMoney(order.subtotalPaise)}</span>
                </div>
                <div className="nx-admin-cost-row">
                  <span>Shipping Fee:</span>
                  <span className="nx-admin-mono-number">{formatMoney(order.shippingFeePaise)}</span>
                </div>
                <div className="nx-admin-cost-row is-total">
                  <span>Order Total:</span>
                  <span className="nx-admin-mono-number">{formatMoney(order.totalCostPaise)}</span>
                </div>
              </div>
            </div>

            {/* State Machine Transition Controls */}
            <div className="nx-admin-detail-section">
              <h3 className="nx-admin-box-title">Order Lifecycle &amp; State Advancement</h3>
              {allowedNextStatuses.length === 0 ? (
                <p className="nx-admin-secondary-text">
                  Order is currently in terminal status <strong>{order.orderStatus}</strong>. No further status
                  advancements can be performed.
                </p>
              ) : (
                <form onSubmit={handleStatusTransition} className="nx-admin-transition-form">
                  <div className="nx-admin-transition-inputs">
                    <div className="nx-admin-field-group">
                      <label htmlFor="next-status-select" className="nx-admin-form-label">
                        Advance Status To:
                      </label>
                      <select
                        id="next-status-select"
                        className="nx-admin-select"
                        value={targetStatus}
                        onChange={(e) => setTargetStatus(e.target.value)}
                        required
                        disabled={transitioning}
                      >
                        <option value="">Select Target Status...</option>
                        {allowedNextStatuses.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="nx-admin-field-group is-flex-grow">
                      <label htmlFor="status-note-input" className="nx-admin-form-label">
                        Optional Operational Note:
                      </label>
                      <input
                        id="status-note-input"
                        type="text"
                        className="nx-admin-input"
                        value={transitionNote}
                        onChange={(e) => setTransitionNote(e.target.value)}
                        placeholder="e.g. Dispatched via Express Logistics"
                        maxLength={500}
                        disabled={transitioning}
                      />
                    </div>

                    <button
                      type="submit"
                      className="button-primary"
                      disabled={transitioning || !targetStatus}
                    >
                      {transitioning ? 'Advancing...' : 'Advance Status'}
                    </button>
                  </div>

                  {transitionError && (
                    <div className="nx-admin-form-error" role="alert">
                      {transitionError}
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Payment Attempts History */}
            <div className="nx-admin-detail-section">
              <h3 className="nx-admin-box-title">Payment Attempts</h3>
              {(order.paymentAttempts || []).length === 0 ? (
                <p className="nx-admin-empty-text">No payment attempts initiated yet.</p>
              ) : (
                <div className="nx-admin-table-wrap">
                  <table className="nx-admin-table" aria-label="Payment Attempts History">
                    <thead>
                      <tr>
                        <th scope="col">Attempt #</th>
                        <th scope="col">Gateway Order ID</th>
                        <th scope="col">Gateway Payment ID</th>
                        <th scope="col">Refund ID</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Status</th>
                        <th scope="col">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.paymentAttempts.map((pa) => (
                        <tr key={pa.id}>
                          <td>#{pa.attemptNumber}</td>
                          <td>
                            <code className="nx-admin-id-tag">{pa.razorpayOrderId}</code>
                          </td>
                          <td>
                            {pa.razorpayPaymentId ? (
                              <code className="nx-admin-id-tag">{pa.razorpayPaymentId}</code>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {pa.razorpayRefundId ? (
                              <code className="nx-admin-id-tag">{pa.razorpayRefundId}</code>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="nx-admin-mono-number">{formatMoney(pa.amountPaise)}</td>
                          <td>
                            <Badge status={pa.status} />
                          </td>
                          <td>
                            <span className="nx-admin-mono-date">
                              {new Date(pa.createdAt).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Restock History (if any) */}
            {order.restockLogs && order.restockLogs.length > 0 && (
              <div className="nx-admin-detail-section">
                <h3 className="nx-admin-box-title">Restock History</h3>
                <div className="nx-admin-table-wrap">
                  <table className="nx-admin-table" aria-label="Order Restock Logs">
                    <thead>
                      <tr>
                        <th scope="col">Product ID</th>
                        <th scope="col">Qty Restocked</th>
                        <th scope="col">Reason</th>
                        <th scope="col">Initiated By</th>
                        <th scope="col">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.restockLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <code className="nx-admin-id-tag">{log.productId.slice(0, 8)}&hellip;</code>
                          </td>
                          <td>
                            <strong>+{log.quantityRestocked}</strong>
                          </td>
                          <td>{log.reason}</td>
                          <td>
                            <span className="nx-admin-secondary-text">
                              {log.initiatedBy ? `${log.initiatedBy.slice(0, 8)}…` : 'Admin'}
                            </span>
                          </td>
                          <td>
                            <span className="nx-admin-mono-date">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Nested Dedicated Operation Modals */}
      {order && (
        <>
          <OrderRefundModal
            isOpen={showRefundModal}
            onClose={() => setShowRefundModal(false)}
            order={order}
            onRefundSuccess={handleRefundSuccess}
          />
          <OrderRestockModal
            isOpen={showRestockModal}
            onClose={() => setShowRestockModal(false)}
            order={order}
            onRestockSuccess={handleRestockSuccess}
          />
        </>
      )}
    </>
  );
}

export default OrderDetailModal;
