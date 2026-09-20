import { useState } from 'react';
import { Link } from 'react-router';
import dayjs from 'dayjs';
import { formatMoney } from '../../utils/money.js';
import { cartApi } from '../../api/cart.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  getOrderStatusPresentation,
  isOrderPaymentRecoverable,
  isOrderReservationExpired,
} from '../../utils/orderStatus.js';

function OrderHeader({
  order,
  onCompletePayment,
  completingOrderId,
  isAnyCompleting,
}) {
  const totalPaise = order.totalPaise ?? order.totalCostPaise ?? order.totalCostCents ?? 0;
  const orderDate = order.createdAt || order.orderTimeMs;
  const presentation = getOrderStatusPresentation(order.status);
  const isThisOrderCompleting = completingOrderId === order.id;
  const isPayable = isOrderPaymentRecoverable(order);

  return (
    <div className="order-card-header">
      <div className="order-header-meta-group">
        <div className="order-meta-block">
          <span className="order-meta-label">{presentation.headerLabel}</span>
          <span className="order-meta-value">{orderDate ? dayjs(orderDate).format('MMMM D, YYYY') : 'Recent'}</span>
        </div>

        <div className="order-meta-block">
          <span className="order-meta-label">Total</span>
          <span className="order-meta-value price-val">{formatMoney(totalPaise)}</span>
        </div>

        {order.status && (
          <div className="order-meta-block">
            <span className="order-meta-label">Status</span>
            <div><Badge status={presentation.normalizedStatus}>{presentation.normalizedStatus}</Badge></div>
          </div>
        )}
      </div>

      <div className="order-header-actions-group">
        <div className="order-meta-block order-id-block">
          <span className="order-meta-label">Order ID</span>
          <span className="order-meta-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{order.id}</span>
        </div>

        {isPayable && (
          <Button
            variant="primary"
            size="sm"
            className="complete-payment-button"
            onClick={() => onCompletePayment && onCompletePayment(order)}
            loading={isThisOrderCompleting}
            disabled={isAnyCompleting || isThisOrderCompleting}
            aria-label="Complete Payment"
          >
            {isThisOrderCompleting ? 'Complete Payment...' : 'Complete Payment'}
          </Button>
        )}
      </div>
    </div>
  );
}

function OrderDetailsGrid({ order, loadCart }) {
  const items = order.items || order.products || [];
  const [addingId, setAddingId] = useState(null);
  const [addedId, setAddedId] = useState(null);
  const presentation = getOrderStatusPresentation(order.status);
  const hasActions = presentation.showBuyAgain || presentation.showTrackPackage;

  const handleBuyAgain = async (productId) => {
    if (!productId) return;
    try {
      setAddingId(productId);
      await cartApi.addItem({
        productId,
        quantity: 1,
      });
      if (loadCart) {
        await loadCart();
      }
      setAddedId(productId);
      setTimeout(() => setAddedId(null), 2000);
    } catch (err) {
      console.error('Failed to add item to cart:', err);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="order-items-container">
      {items.map((item, idx) => {
        const productId = item.productId || item.product_id || item.product?.id || item.id;
        const productName = item.productName || item.product_name || item.name || item.product?.name || 'Product';
        const productImage = item.imageUrl || item.image || item.image_url || item.product?.image || 'images/products/athletic-cotton-socks-6-pairs.jpg';
        const itemKey = item.id || `${order.id}-${productId}-${idx}`;
        const unitPrice = item.unitPricePaise ?? item.price_paise ?? item.pricePaise ?? item.unit_price_paise ?? 0;

        return (
          <div key={itemKey} className="order-item-row">
            <div className="order-item-thumb-wrap">
              <img src={productImage} alt={productName} className="order-item-thumb" />
            </div>

            <div className="order-item-info">
              <div className="order-item-name">{productName}</div>
              <div className="order-item-qty">Quantity: {item.quantity}</div>
              {unitPrice > 0 && (
                <div className="order-item-price">Unit Price: {formatMoney(unitPrice)}</div>
              )}
            </div>

            {hasActions && (
              <div className="order-item-actions">
                {presentation.showBuyAgain && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="buy-again-button"
                    onClick={() => handleBuyAgain(productId)}
                    loading={addingId === productId}
                  >
                    {addedId === productId ? '✓ Added' : 'Buy Again'}
                  </Button>
                )}

                {presentation.showTrackPackage && (
                  <Link to={`/tracking/${order.id}/${productId}`} state={{ guestToken: order.guestToken }}>
                    <Button variant="secondary" size="sm" style={{ width: '100%' }}>
                      Track Package
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function OrdersGrid({
  orders = [],
  loadCart,
  onCompletePayment,
  completingOrderId,
  isAnyCompleting,
  paymentErrors = {},
}) {
  if (!orders || orders.length === 0) {
    return (
      <EmptyState
        title="No placed orders"
        description="You have not placed any orders yet. Explore our curated collections to place your first order."
        actionLabel="Start Shopping"
        actionTo="/"
      />
    );
  }

  return (
    <div className="orders-grid">
      {orders.map((order) => {
        const orderPaymentError = paymentErrors[order.id];
        const isExpired = isOrderReservationExpired(order);

        return (
          <article key={order.id} className="order-card">
            <OrderHeader
              order={order}
              onCompletePayment={onCompletePayment}
              completingOrderId={completingOrderId}
              isAnyCompleting={isAnyCompleting}
            />
            <OrderDetailsGrid order={order} loadCart={loadCart} />

            {isExpired && (
              <div className="order-expired-recovery-footer" role="status">
                <div className="order-expired-message-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="order-expired-icon" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <p className="order-expired-text">Payment window expired. Please place a new order.</p>
                </div>
                <Link to="/">
                  <Button variant="secondary" size="sm" className="place-new-order-button">
                    Place New Order
                  </Button>
                </Link>
              </div>
            )}

            {orderPaymentError && (
              <div className="order-payment-alert is-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p className="order-payment-alert-text">{orderPaymentError}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
