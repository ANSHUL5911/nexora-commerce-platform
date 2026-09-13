import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { ordersApi } from '../../api/orders.js';
import { adaptOrder } from '../../api/adapters.js';
import { OrdersGrid } from './OrdersGrid.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import './OrdersPage.css';

export function OrdersPage({ cart, loadCart, currentUser, onAuthChange }) {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inMemoryGuestToken = location.state?.guestToken;
      const inMemoryOrderId = location.state?.orderId;

      if (inMemoryGuestToken && inMemoryOrderId) {
        const gOrderRes = await ordersApi.getOrder(inMemoryOrderId, { guestToken: inMemoryGuestToken });
        const gOrder = gOrderRes.order || gOrderRes.data?.order || gOrderRes;
        if (gOrder) {
          const adapted = adaptOrder(gOrder);
          adapted.guestToken = inMemoryGuestToken;
          setOrders([adapted]);
          return;
        }
      }

      const response = await ordersApi.listOrders();
      const rawOrders = Array.isArray(response)
        ? response
        : (response?.orders || response?.data?.orders || []);

      setOrders(rawOrders.map(adaptOrder));
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load order history');
    } finally {
      setLoading(false);
    }
  }, [location.state]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <>
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />

      <main className="orders-page">
        <header className="orders-page-header">
          <h1 className="orders-page-title">Order History</h1>
        </header>

        {error && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-6)',
              backgroundColor: 'var(--color-status-error-bg)',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-status-error)',
              textAlign: 'center',
              marginBottom: 'var(--space-8)',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Unable to load orders</p>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '16px' }}>{error}</p>
            <button type="button" className="button-secondary" onClick={fetchOrders}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} aria-busy="true">
            {[1, 2].map((n) => (
              <div key={n} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-6)', backgroundColor: 'var(--color-surface)' }}>
                <Skeleton height="30px" style={{ marginBottom: '16px' }} />
                <Skeleton height="100px" />
              </div>
            ))}
          </div>
        ) : (
          <OrdersGrid orders={orders} loadCart={loadCart} />
        )}
      </main>
    </>
  );
}