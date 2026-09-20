import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../../api/admin.js';
import { formatMoney } from '../../../utils/money.js';
import { Badge } from '../../../components/ui/Badge.jsx';
import { OrderDetailModal } from './OrderDetailModal.jsx';

/**
 * AdminOrders Component (Phase 07.26B)
 * Full administrative order management view supporting status filtering,
 * search, pagination, order detail inspection, state transitions, refunds, and restocks.
 */
export function AdminOrders({ selectedOrderId: propOrderId, onClearSelectedOrder }) {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inspector modal state
  const [inspectOrderId, setInspectOrderId] = useState(propOrderId || null);

  const fetchOrders = useCallback(async (page = 1, status = statusFilter, search = searchQuery) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 10,
      };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();

      const response = await adminApi.listOrders(params);
      setOrders(response?.data || []);
      setPagination(response?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Failed to list orders:', err);
      setError(err.message || 'Unable to retrieve orders.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchOrders(1, statusFilter, searchQuery);
  }, [fetchOrders, statusFilter, searchQuery]);

  useEffect(() => {
    if (propOrderId) {
      setInspectOrderId(propOrderId);
    }
  }, [propOrderId]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchOrders(1, statusFilter, searchQuery);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchOrders(newPage, statusFilter, searchQuery);
    }
  };

  const handleCloseModal = () => {
    setInspectOrderId(null);
    if (onClearSelectedOrder) {
      onClearSelectedOrder();
    }
  };

  const handleOrderMutated = () => {
    // Reconcile orders table state after status change, refund, or restock
    fetchOrders(pagination.page, statusFilter, searchQuery);
  };

  return (
    <div className="nx-admin-orders-view">
      <div className="nx-admin-view-header">
        <h2 className="nx-admin-view-title">Order Management</h2>
        <span className="nx-admin-total-indicator">
          {pagination.total} Total {pagination.total === 1 ? 'Order' : 'Orders'}
        </span>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="nx-admin-toolbar">
        <form onSubmit={handleSearchSubmit} className="nx-admin-search-form">
          <input
            type="search"
            className="nx-admin-search-input"
            placeholder="Search by customer name, address, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search orders"
          />
          <button type="submit" className="button-secondary">
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              className="button-tertiary"
              onClick={() => {
                setSearchQuery('');
                fetchOrders(1, statusFilter, '');
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="nx-admin-filter-group">
          <label htmlFor="order-status-filter" className="nx-admin-filter-label">
            Filter Status:
          </label>
          <select
            id="order-status-filter"
            className="nx-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="PENDING_PAYMENT">Pending Payment</option>
            <option value="PAID">Paid</option>
            <option value="PROCESSING">Processing</option>
            <option value="SHIPPED">Shipped</option>
            <option value="DELIVERED">Delivered</option>
            <option value="REFUNDED">Refunded</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="nx-admin-loading" role="status">
          <div className="nx-admin-spinner" aria-hidden="true" />
          <p>Loading orders...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="nx-admin-error-box" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => fetchOrders(pagination.page, statusFilter, searchQuery)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Orders Table */}
      {!loading && !error && (
        <>
          {orders.length === 0 ? (
            <div className="nx-admin-empty-box">
              <p>No orders matched your current filters.</p>
            </div>
          ) : (
            <div className="nx-admin-table-wrap">
              <table className="nx-admin-table" aria-label="Customer Orders">
                <thead>
                  <tr>
                    <th scope="col">Order ID</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Items</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Date</th>
                    <th scope="col" className="nx-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => (
                    <tr key={ord.id}>
                      <td>
                        <code className="nx-admin-id-tag" title={ord.id}>
                          {ord.id.slice(0, 8)}&hellip;
                        </code>
                      </td>
                      <td>
                        <div className="nx-admin-cell-stacked">
                          <span className="nx-admin-primary-text">
                            {ord.customer?.fullName || ord.shippingAddress?.fullName || 'Guest Customer'}
                          </span>
                          <span className="nx-admin-secondary-text">
                            {ord.customer?.email || '—'}
                          </span>
                        </div>
                      </td>
                      <td>{ord.itemCount}</td>
                      <td>
                        <span className="nx-admin-mono-number">
                          {formatMoney(ord.totalCostPaise)}
                        </span>
                      </td>
                      <td>
                        <Badge status={ord.orderStatus || ord.status} />
                      </td>
                      <td>
                        <span className="nx-admin-secondary-text">
                          {ord.paymentStatus || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="nx-admin-mono-date">
                          {new Date(ord.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="nx-text-right">
                        <button
                          type="button"
                          className="nx-admin-table-btn"
                          onClick={() => setInspectOrderId(ord.id)}
                          aria-label={`Inspect order ${ord.id}`}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="nx-admin-pagination" role="navigation" aria-label="Orders pagination">
              <button
                type="button"
                className="button-secondary"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                &larr; Previous
              </button>
              <span className="nx-admin-page-indicator">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}

      {/* Order Detail Modal */}
      <OrderDetailModal
        isOpen={Boolean(inspectOrderId)}
        onClose={handleCloseModal}
        orderId={inspectOrderId}
        onOrderMutated={handleOrderMutated}
      />
    </div>
  );
}

export default AdminOrders;
