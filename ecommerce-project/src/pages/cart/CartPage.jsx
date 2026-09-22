import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from '../../components/Header.jsx';
import { cartApi } from '../../api/cart.js';
import { updateGuestCartItem, removeGuestCartItem } from '../../api/guestCart.js';
import { formatMoney } from '../../utils/money.js';
import { getAuthRedirectPath } from '../../utils/authRedirect.js';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SafeImage } from '../../components/ui/SafeImage.jsx';
import { AuthModal } from '../../components/auth/AuthModal.jsx';
import { RollingNumber } from '../../components/ui/RollingNumber.jsx';
import { springs, useReducedMotion, withReducedMotion } from '../../lib/motion.js';
import { SEOHead } from '../../components/ui/SEOHead.jsx';
import './CartPage.css';

export function CartPage({ cart = [], loadCart, currentUser, onAuthChange }) {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleProceedToCheckout = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    navigate('/checkout');
  };

  const handleAuthSuccess = async (user) => {
    if (onAuthChange) {
      await onAuthChange(user);
    }
    setIsAuthModalOpen(false);
    navigate(getAuthRedirectPath(user, '/checkout'));
  };

  const handleQuantityChange = async (item, newQty) => {
    const itemId = item.id || item.cartItemId;
    const productId = item.productId || item.id;
    try {
      setUpdatingId(itemId);
      setErrorMsg(null);
      if (currentUser === null) {
        updateGuestCartItem(productId, Number(newQty), item.availableQuantity);
      } else {
        await cartApi.updateItem(itemId, { quantity: Number(newQty) });
      }
      if (loadCart) {
        await loadCart();
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to update item quantity');
      if (loadCart) {
        await loadCart();
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveItem = async (item) => {
    const itemId = item.id || item.cartItemId;
    const productId = item.productId || item.id;
    try {
      setUpdatingId(itemId);
      setErrorMsg(null);
      if (currentUser === null) {
        removeGuestCartItem(productId);
      } else {
        await cartApi.removeItem(itemId);
      }
      if (loadCart) {
        await loadCart();
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to remove item');
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
      <SEOHead
        title="Order Dossier — Cart"
        description="Review selected industrial artifacts, verify quantities, and proceed to checkout."
        canonical="https://nexora.design/cart"
      />
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />

      <main className="cart-page" id="main-content" tabIndex="-1">
        <header className="cart-page-header">
          <h1 className="cart-page-title">Shopping Cart</h1>
          <span className="cart-item-count">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</span>
        </header>

        {errorMsg && (
          <div className="cart-mutation-alert is-error" role="alert">
            <p>{errorMsg}</p>
          </div>
        )}

        {cart.length === 0 ? (
          <EmptyState
            preset="cart"
            title="Acquisition Bag Empty"
            description="The acquisition bag contains no cataloged pieces. Curated editions await inspection in the permanent collection."
            actionLabel="Discover Collections"
            actionTo="/catalog"
          />
        ) : (
          <div className="cart-layout">
            <section className="cart-items-list" aria-label="Cart Items">
              <AnimatePresence initial={false}>
              {cart.map((item) => {
                const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? item.price_paise ?? 0;
                const lineTotal = itemPrice * item.quantity;
                const itemId = item.id || item.cartItemId;

                return (
                  <motion.div
                    key={itemId}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: updatingId === itemId ? 0.6 : 1, y: 0 }}
                    exit={shouldReduceMotion ? false : { opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={withReducedMotion(springs.listReorder, shouldReduceMotion)}
                    className="cart-item-row"
                  >
                    <div className="cart-item-img-wrap">
                      <SafeImage
                        className="cart-item-img"
                        src={item.image || item.imageUrl || item.image_url || 'images/products/athletic-cotton-socks-6-pairs.jpg'}
                        alt={item.name || 'Product'}
                        width={80}
                        height={100}
                        loading="lazy"
                        decoding="async"
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
                            onChange={(e) => handleQuantityChange(item, e.target.value)}
                          >
                            {Array.from(
                              { length: item.availableQuantity !== undefined && item.availableQuantity !== null ? Math.min(10, Math.max(1, item.availableQuantity)) : 10 },
                              (_, i) => i + 1
                            ).map((num) => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          className="cart-item-remove-btn"
                          disabled={updatingId === itemId}
                          onClick={() => handleRemoveItem(item)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="cart-item-total">
                      <RollingNumber amountPaise={lineTotal} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </section>

          <aside className="cart-summary-box" aria-label="Order Summary">
            <h2 className="cart-summary-title">Summary</h2>

            <div className="cart-summary-row total-row">
              <span>Items Subtotal</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                <RollingNumber amountPaise={subtotalPaise} />
              </span>
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
              Shipping fee calculated at checkout.
            </p>

            <Button
              variant="primary"
              className="cart-checkout-btn"
              onClick={handleProceedToCheckout}
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

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        subtitle="Create an account or sign in to complete acquisition."
      />
    </>
  );
}
