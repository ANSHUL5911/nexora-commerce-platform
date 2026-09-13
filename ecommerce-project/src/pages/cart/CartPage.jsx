import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { cartApi } from '../../api/cart.js';
import { formatMoney } from '../../utils/money.js';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import './CartPage.css';

export function CartPage({ cart = [], loadCart, currentUser, onAuthChange }) {
  const navigate = useNavigate();
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleQuantityChange = async (itemId, newQty) => {
    try {
      setUpdatingId(itemId);
      setErrorMsg(null);
      await cartApi.updateItem(itemId, { quantity: Number(newQty) });
      if (loadCart) {
        await loadCart();
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.error?.message || err?.message || 'Failed to update item quantity');
      if (loadCart) {
        await loadCart();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      setUpdatingId(itemId);
      setErrorMsg(null);
      await cartApi.removeItem(itemId);
      if (loadCart) {
        await loadCart();
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.error?.message || err?.message || 'Failed to remove item');
      if (loadCart) {
        await loadCart();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const subtotalPaise = (cart || []).reduce((sum, item) => {
    const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? item.price_paise ?? 0;
    return sum + (itemPrice * (item.quantity || 1));
  }, 0);

  const totalQuantity = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <>
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />

      <main className="cart-page">
        <header className="cart-page-header">
          <h1 className="cart-page-title">Shopping Cart</h1>
          <span className="cart-item-count">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</span>
        </header>

        {errorMsg && (
          <div className="nx-error-text" role="alert" style={{ marginBottom: 'var(--space-4)', padding: '8px', backgroundColor: 'var(--color-status-error-bg)', borderRadius: 'var(--radius-xs)' }}>
            {errorMsg}
          </div>
        )}

        {cart.length === 0 ? (
          <EmptyState
            title="Your cart is empty"
            description="You have not added any architectural essentials to your cart yet."
            actionLabel="Discover Collections"
            actionTo="/"
          />
        ) : (
          <div className="cart-layout">
            <section className="cart-items-list" aria-label="Cart Items">
              {cart.map((item) => {
                const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? item.price_paise ?? 0;
                const lineTotal = itemPrice * item.quantity;
                const itemId = item.id || item.cartItemId;

                return (
                  <div key={itemId} className="cart-item-row" style={{ opacity: updatingId === itemId ? 0.6 : 1 }}>
                    <div className="cart-item-img-wrap">
                      <img
                        className="cart-item-img"
                        src={item.image || item.imageUrl || item.image_url || 'images/products/athletic-cotton-socks-6-pairs.jpg'}
                        alt={item.name || 'Product'}
                      />
                    </div>

                    <div className="cart-item-details">
                      <div className="cart-item-name">{item.name || 'Product'}</div>
                      <div className="cart-item-unit-price">Unit Price: {formatMoney(itemPrice)}</div>

                      <div className="cart-item-controls">
                        <div className="cart-item-qty">
                          <select
                            aria-label={`Quantity for ${item.name}`}
                            value={item.quantity}
                            disabled={updatingId === itemId}
                            onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          className="cart-item-remove-btn"
                          disabled={updatingId === itemId}
                          onClick={() => handleRemoveItem(itemId)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="cart-item-total">
                      {formatMoney(lineTotal)}
                    </div>
                  </div>
                );
              })}
            </section>

            <aside className="cart-summary-box" aria-label="Order Summary">
              <h2 className="cart-summary-title">Summary</h2>

              <div className="cart-summary-row total-row">
                <span>Items Subtotal</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(subtotalPaise)}</span>
              </div>

              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                Shipping fee calculated at checkout.
              </p>

              <Button
                variant="primary"
                className="cart-checkout-btn"
                onClick={() => navigate('/checkout')}
              >
                Proceed to Checkout
              </Button>

              <div style={{ textAlign: 'center', marginTop: 'var(--space-2)' }}>
                <Link to="/" className="link-primary" style={{ fontSize: 'var(--text-xs)' }}>
                  Continue Shopping
                </Link>
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
