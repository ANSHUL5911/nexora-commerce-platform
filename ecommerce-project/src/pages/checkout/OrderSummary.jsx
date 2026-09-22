import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItemDetails } from './CartItemDetails';
import { cartApi } from '../../api/cart';
import { Icon } from '../../components/ui/Icon.jsx';
import { springs, useReducedMotion, withReducedMotion } from '../../lib/motion.js';

export function OrderSummary({
    cart = [],
    loadCart,
    reservationExpiresAt,
    onContinue,
    isCompleted,
    isActive,
    onEdit,
}) {
    const shouldReduceMotion = useReducedMotion();
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!reservationExpiresAt) {
            setTimeLeft('');
            return;
        }

        const updateCountdown = () => {
            const now = Date.now();
            const expires = new Date(reservationExpiresAt).getTime();
            const diff = expires - now;

            if (diff <= 0) {
                setTimeLeft('Reservation expired');
                return;
            }

            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [reservationExpiresAt]);

    if (!cart || cart.length === 0) {
        return (
            <section className="checkout-step is-active" aria-labelledby="step-3-heading">
                <div className="step-header">
                    <div className="step-badge">3</div>
                    <h2 id="step-3-heading" className="step-title">Order Review</h2>
                </div>
                <div className="step-content empty-cart-message">
                    <p>Your shopping bag is empty.</p>
                </div>
            </section>
        );
    }

    const totalQuantity = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);

    return (
        <section className={`checkout-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`} aria-labelledby="step-3-heading">
            <div className="step-header">
                <div className="step-badge">
                    {isCompleted && !isActive ? <Icon name="Check" size={13} strokeWidth={2.5} aria-hidden="true" /> : '3'}
                </div>
                <h2 id="step-3-heading" className="step-title">Order Review &amp; Reservation</h2>
                {isCompleted && !isActive && (
                    <button
                        type="button"
                        className="step-edit-button"
                        onClick={onEdit}
                        aria-label="Edit Order Review"
                    >
                        Edit
                    </button>
                )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
                {isActive ? (
                    <motion.div
                        key="review-active-step"
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        transition={withReducedMotion(springs.accordion, shouldReduceMotion)}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="step-content review-step-content">
                            {reservationExpiresAt ? (
                                <div className="reservation-notice is-active-timer" role="status" aria-live="polite">
                                    <span className="notice-dot" aria-hidden="true"></span>
                                    <span className="notice-text">
                                        Stock locked. Complete checkout in <strong className="countdown-time">{timeLeft || '...'}</strong>
                                    </span>
                                </div>
                            ) : (
                                <div className="reservation-notice">
                                    <Icon name="Clock" size={15} aria-hidden="true" />
                                    <span className="notice-text">
                                        A 15-minute inventory reservation will be secured upon proceeding to payment.
                                    </span>
                                </div>
                            )}

                            <div className="review-items-list" aria-label="Items in your order">
                                {cart.map((cartItem) => {
                                    const itemId = cartItem.id || cartItem.productId;
                                    const deleteCartItem = async () => {
                                        try {
                                            await cartApi.removeItem(itemId);
                                            if (loadCart) {
                                                await loadCart();
                                            }
                                        } catch (err) {
                                            console.error('Failed to remove cart item:', err);
                                        }
                                    };

                                    return (
                                        <CartItemDetails
                                            key={itemId}
                                            cartItem={cartItem}
                                            deleteCartItem={deleteCartItem}
                                            loadCart={loadCart}
                                        />
                                    );
                                })}
                            </div>

                            <div className="step-actions">
                                <button
                                    type="button"
                                    className="button-primary submit-review-btn"
                                    onClick={onContinue}
                                >
                                    Verify Allocation & Lock Stock
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : isCompleted ? (
                    <motion.div
                        key="review-completed-summary"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? false : { opacity: 0 }}
                        transition={withReducedMotion(springs.responsive, shouldReduceMotion)}
                        className="step-summary-content"
                    >
                        <p className="summary-name">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'} reviewed</p>
                        <p className="summary-line">
                            {cart.map((i) => i.name || i.product?.name).filter(Boolean).slice(0, 2).join(', ')}
                            {cart.length > 2 ? ` and ${cart.length - 2} more` : ''}
                        </p>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </section>
    );
}