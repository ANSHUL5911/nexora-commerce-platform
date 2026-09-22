import { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router';
import dayjs from 'dayjs';
import { Header } from '../components/Header.jsx';
import { ordersApi } from '../api/orders.js';
import { adaptOrder } from '../api/adapters.js';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import './TrackingPage.css';

export function TrackingPage({ cart, currentUser, onAuthChange }) {
  const { orderId, productId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchOrder = async () => {
      setLoading(true);
      setError(null);
      try {
        const guestToken = location.state?.guestToken || null;
        const response = await ordersApi.getOrder(orderId, { guestToken });
        const rawOrder =
          response.order ||
          response.data?.order ||
          response.data ||
          response;
        if (isMounted) {
          setOrder(adaptOrder(rawOrder));
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.response?.data?.error?.message || err?.message || 'Failed to load order tracking details');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (orderId) {
      fetchOrder();
    }
    return () => { isMounted = false; };
  }, [orderId, location.state]);

  if (loading) {
    return (
      <>
        <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />
        <main className="tracking-page" aria-busy="true">
          <div className="tracking-card">
            <Skeleton height="30px" width="40%" style={{ marginBottom: '24px' }} />
            <Skeleton height="100px" style={{ marginBottom: '32px' }} />
            <Skeleton height="12px" />
          </div>
        </main>
      </>
    );
  }

  if (error || !order) {
    return (
      <>
        <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />
        <main className="tracking-page" id="main-content" tabIndex="-1">
          <div className="tracking-card" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Tracking Record Unavailable</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>{error || 'The requested order could not be located.'}</p>
            <Link to="/orders">
              <Button variant="secondary">View All Orders</Button>
            </Link>
          </div>
        </main>
      </>
    );
  }

  const items = order.items || [];
  const item = items.find((p) => p.productId === productId || p.id === productId) || items[0] || {};
  const status = (order.status || 'PROCESSING').toUpperCase();

  const isPending = status === 'PENDING_PAYMENT';
  const isCancelled = status === 'CANCELLED';
  const isExpired = status === 'EXPIRED';
  const isRefunded = status === 'REFUNDED';
  const isDelivered = status === 'DELIVERED';
  const isShipped = status === 'SHIPPED';
  const isProcessing = ['PAID', 'PROCESSING', 'CONFIRMED'].includes(status);

  let progressPercent = 0;
  if (isDelivered) {
    progressPercent = 100;
  } else if (isShipped) {
    progressPercent = 66;
  } else if (isProcessing) {
    progressPercent = 33;
  } else {
    progressPercent = 0;
  }

  const deliveryDate = dayjs(order.createdAt).add(5, 'day').format('dddd, MMMM D, YYYY');

  let statusHeading = `Estimated Delivery: ${deliveryDate}`;
  if (isDelivered) {
    statusHeading = `Delivered on ${dayjs(order.updatedAt || order.createdAt).format('MMMM D, YYYY')}`;
  } else if (isPending) {
    statusHeading = 'Payment required before fulfillment tracking becomes available.';
  } else if (isCancelled) {
    statusHeading = 'Order was cancelled. Fulfillment is inactive.';
  } else if (isExpired) {
    statusHeading = 'Order reservation expired. Fulfillment is inactive.';
  } else if (isRefunded) {
    statusHeading = 'Order was refunded. Fulfillment is inactive.';
  }

  return (
    <>
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />

      <main className="tracking-page" id="main-content" tabIndex="-1">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link to="/orders" className="link-primary" style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            ← Back to Order History
          </Link>
        </div>

        <div className="tracking-card">
          <header className="tracking-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Order #{order.id}
              </span>
              <Badge status={status}>{status}</Badge>
            </div>

            <h1 className="tracking-delivery-date">
              {statusHeading}
            </h1>
          </header>

          <section className="tracking-product-preview" aria-label="Tracking Item Preview">
            <div className="tracking-product-img-wrap">
              <img
                className="tracking-product-img"
                src={item.imageUrl || item.image || 'images/products/athletic-cotton-socks-6-pairs.jpg'}
                alt={item.productName || item.name || 'Product'}
              />
            </div>

            <div className="tracking-product-details">
              <div className="tracking-product-name">{item.productName || item.name || 'Order Item'}</div>
              <div className="tracking-product-qty">Quantity: {item.quantity || 1}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Shipment Carrier: Nexora Express Logistics
              </div>
            </div>
          </section>

          {/* Stepper Timeline */}
          <section className="tracking-stepper" aria-label="Fulfillment Progress">
            <div className="tracking-labels-row">
              <span className={`tracking-label ${isProcessing ? 'active' : ''}`}>Preparing</span>
              <span className={`tracking-label ${isShipped ? 'active' : ''}`}>In Transit</span>
              <span className={`tracking-label ${isDelivered ? 'active' : ''}`}>Delivered</span>
            </div>

            <div className="tracking-bar-bg" role="progressbar" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100">
              <div
                className={`tracking-bar-fill ${isCancelled || isExpired || isRefunded ? 'cancelled' : ''}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}