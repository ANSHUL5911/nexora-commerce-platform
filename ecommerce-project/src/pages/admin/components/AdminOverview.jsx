import { useState, useEffect } from 'react';
import { adminApi } from '../../../api/admin.js';
import { formatMoney } from '../../../utils/money.js';
import { Badge } from '../../../components/ui/Badge.jsx';

/**
 * AdminOverview Component (Phase 07.26B)
 * Operations-focused administrative overview displaying backend-authoritative commerce metrics,
 * recent orders, low-stock attention items, and recent administrative audit activity.
 */
export function AdminOverview({ onNavigateTab, onSelectOrder }) {
  const [metrics, setMetrics] = useState({
    totalProducts: null,
    activeProducts: null,
    lowStockCount: null,
    totalOrders: null,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentAudits, setRecentAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchOverviewData() {
      setLoading(true);
      setError(null);
      try {
        const [
          productsRes,
          activeProductsRes,
          lowStockRes,
          ordersRes,
          auditsRes,
        ] = await Promise.all([
          adminApi.listProducts({ limit: 1 }),
          adminApi.listProducts({ status: 'active', limit: 1 }),
          adminApi.getInventory({ lowStockOnly: true, limit: 5 }),
          adminApi.listOrders({ limit: 5 }),
          adminApi.listAuditLogs({ limit: 5 }),
        ]);

        if (!isMounted) return;

        setMetrics({
          totalProducts: productsRes?.pagination?.total ?? 0,
          activeProducts: activeProductsRes?.pagination?.total ?? 0,
          lowStockCount: lowStockRes?.pagination?.total ?? 0,
          totalOrders: ordersRes?.pagination?.total ?? 0,
        });

        setRecentOrders(ordersRes?.data || []);
        setLowStockItems(lowStockRes?.data || []);
        setRecentAudits(auditsRes?.data || []);
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to load administrative overview:', err);
        setError(err.message || 'Unable to load operations overview.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchOverviewData();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="nx-admin-loading" role="status" aria-live="polite">
        <div className="nx-admin-spinner" aria-hidden="true" />
        <p>Loading commerce operations overview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nx-admin-error-box" role="alert">
        <h3 className="nx-admin-error-title">Overview Error</h3>
        <p>{error}</p>
        <button
          type="button"
          className="button-secondary"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="nx-admin-overview-view">
      {/* 1. Authoritative Commerce Operational Metrics */}
      <section className="nx-admin-section" aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="nx-admin-section-heading">
          Nexora Operations Console — Real-Time Fiduciary & Inventory Ledger
        </h2>
        <div className="nx-admin-metrics-row">
          <div className="nx-admin-metric-card">
            <span className="nx-admin-metric-label">Total Products</span>
            <span className="nx-admin-metric-value">{metrics.totalProducts}</span>
            <span className="nx-admin-metric-sub">{metrics.activeProducts} active</span>
          </div>

          <div className="nx-admin-metric-card">
            <span className="nx-admin-metric-label">Total Orders</span>
            <span className="nx-admin-metric-value">{metrics.totalOrders}</span>
            <span className="nx-admin-metric-sub">lifetime volume</span>
          </div>

          <div className="nx-admin-metric-card">
            <span className="nx-admin-metric-label">Low Stock Attention</span>
            <span className={`nx-admin-metric-value ${metrics.lowStockCount > 0 ? 'is-warning' : ''}`}>
              {metrics.lowStockCount}
            </span>
            <span className="nx-admin-metric-sub">available &le; 5 units</span>
          </div>
        </div>
      </section>

      {/* 2. Recent Orders */}
      <section className="nx-admin-section" aria-labelledby="recent-orders-heading">
        <div className="nx-admin-section-header-row">
          <h2 id="recent-orders-heading" className="nx-admin-section-heading">Recent Orders</h2>
          <button
            type="button"
            className="nx-admin-inline-link"
            onClick={() => onNavigateTab('orders', '/admin/orders')}
          >
            View all orders &rarr;
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <p className="nx-admin-empty-text">No orders placed yet.</p>
        ) : (
          <div className="nx-admin-table-wrap">
            <table className="nx-admin-table" aria-label="Recent Orders">
              <thead>
                <tr>
                  <th scope="col">Order ID</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Items</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="nx-text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <code className="nx-admin-id-tag" title={order.id}>
                        {order.id.slice(0, 8)}&hellip;
                      </code>
                    </td>
                    <td>
                      <div className="nx-admin-cell-stacked">
                        <span className="nx-admin-primary-text">
                          {order.customer?.fullName || order.shippingAddress?.fullName || 'Guest'}
                        </span>
                        <span className="nx-admin-secondary-text">
                          {order.customer?.email || '—'}
                        </span>
                      </div>
                    </td>
                    <td>{order.itemCount}</td>
                    <td>
                      <span className="nx-admin-mono-number">
                        {formatMoney(order.totalCostPaise)}
                      </span>
                    </td>
                    <td>
                      <Badge status={order.orderStatus || order.status} />
                    </td>
                    <td>
                      <span className="nx-admin-secondary-text">
                        {order.paymentStatus || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="nx-admin-mono-date">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="nx-text-right">
                      <button
                        type="button"
                        className="nx-admin-table-btn"
                        onClick={() => {
                          if (onSelectOrder) {
                            onSelectOrder(order.id);
                          } else {
                            onNavigateTab('orders', '/admin/orders');
                          }
                        }}
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
      </section>

      {/* 3. Low-Stock Attention */}
      <section className="nx-admin-section" aria-labelledby="low-stock-heading">
        <div className="nx-admin-section-header-row">
          <h2 id="low-stock-heading" className="nx-admin-section-heading">Low-Stock Attention</h2>
          <button
            type="button"
            className="nx-admin-inline-link"
            onClick={() => onNavigateTab('inventory', '/admin/inventory')}
          >
            View full inventory &rarr;
          </button>
        </div>

        {lowStockItems.length === 0 ? (
          <p className="nx-admin-empty-text">All catalog items have healthy inventory reserves (&gt; 5 units).</p>
        ) : (
          <div className="nx-admin-table-wrap">
            <table className="nx-admin-table" aria-label="Low Stock Items">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Category</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Reserved</th>
                  <th scope="col">Available</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((item) => (
                  <tr key={item.productId}>
                    <td>
                      <div className="nx-admin-cell-stacked">
                        <span className="nx-admin-primary-text">{item.name}</span>
                        <code className="nx-admin-secondary-text">{item.productId.slice(0, 8)}&hellip;</code>
                      </div>
                    </td>
                    <td>{item.category}</td>
                    <td className="nx-admin-mono-number">{item.stockQuantity}</td>
                    <td className="nx-admin-mono-number">{item.reservedQuantity}</td>
                    <td>
                      <span className={`nx-admin-mono-number ${item.availableQuantity === 0 ? 'is-danger' : 'is-warning'}`}>
                        {item.availableQuantity}
                      </span>
                    </td>
                    <td>
                      <Badge
                        status={item.availableQuantity === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Recent Administrative Activity */}
      <section className="nx-admin-section" aria-labelledby="recent-audit-heading">
        <div className="nx-admin-section-header-row">
          <h2 id="recent-audit-heading" className="nx-admin-section-heading">Recent Administrative Activity</h2>
          <button
            type="button"
            className="nx-admin-inline-link"
            onClick={() => onNavigateTab('audit', '/admin/audit-logs')}
          >
            View all audit logs &rarr;
          </button>
        </div>

        {recentAudits.length === 0 ? (
          <p className="nx-admin-empty-text">No administrative events recorded yet.</p>
        ) : (
          <div className="nx-admin-table-wrap">
            <table className="nx-admin-table" aria-label="Recent Administrative Activity">
              <thead>
                <tr>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Action</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Resource</th>
                  <th scope="col">Resource ID</th>
                </tr>
              </thead>
              <tbody>
                {recentAudits.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="nx-admin-mono-date">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className="nx-admin-action-pill">{log.action}</span>
                    </td>
                    <td>
                      <span className="nx-admin-secondary-text">
                        {log.actor?.email || log.actorId || 'System'}
                      </span>
                    </td>
                    <td>{log.targetResource}</td>
                    <td>
                      <code className="nx-admin-id-tag">
                        {log.resourceId ? `${log.resourceId.slice(0, 8)}…` : '—'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminOverview;
