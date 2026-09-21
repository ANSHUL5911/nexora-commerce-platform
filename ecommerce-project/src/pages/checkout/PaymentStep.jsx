import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatMoney } from '../../utils/money';
import { Icon } from '../../components/ui/Icon.jsx';
import { springs, useReducedMotion, withReducedMotion } from '../../lib/motion.js';
import { loadRazorpaySDK } from '../../services/paymentOrchestration.js';

export function PaymentStep({
    isActive,
    isCompleted,
    paymentState, // 'READY_FOR_PAYMENT' | 'PAYMENT_PROCESSING' | 'PAYMENT_RECONCILIATION_PENDING' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_RETRY_AVAILABLE' | 'EXPIRED_RESERVATION'
    totalPaise,
    onPay,
    onRetry,
    onRestartCheckout,
    serverError,
    orderId,
}) {
    const shouldReduceMotion = useReducedMotion();
    const isProcessing = paymentState === 'PAYMENT_PROCESSING' || paymentState === 'PAYMENT_RECONCILIATION_PENDING';

    useEffect(() => {
        if (isActive) {
            loadRazorpaySDK().catch(() => {});
        }
    }, [isActive]);

    return (
        <section className={`checkout-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`} aria-labelledby="step-4-heading">
            <div className="step-header">
                <div className="step-badge">
                    {isCompleted && !isActive ? <Icon name="Check" size={13} strokeWidth={2.5} aria-hidden="true" /> : '4'}
                </div>
                <h2 id="step-4-heading" className="step-title">Payment</h2>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                {isActive ? (
                    <motion.div
                        key="payment-active-step"
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        transition={withReducedMotion(springs.accordion, shouldReduceMotion)}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="step-content payment-step-content">
                    {/* Error Banner for Payment Failure / Gateway Timeout */}
                    {(paymentState === 'PAYMENT_FAILED' || paymentState === 'PAYMENT_RETRY_AVAILABLE' || serverError) && (
                        <div className="payment-alert is-error" role="alert">
                            <div className="alert-icon">
                                <Icon name="AlertCircle" size={18} aria-hidden="true" />
                            </div>
                            <div className="alert-content">
                                <h3 className="alert-heading">Payment Unsuccessful</h3>
                                <p className="alert-body">
                                    {serverError || "Payment could not be completed. Your order has not been marked as paid. You can retry the payment."}
                                </p>
                                {orderId && (
                                    <span className="alert-meta">Order reference: <code>#{orderId.slice(0, 8)}</code></span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Expired Reservation State */}
                    {paymentState === 'EXPIRED_RESERVATION' && (
                        <div className="payment-alert is-warning" role="alert">
                            <div className="alert-icon">
                                <Icon name="Clock" size={18} aria-hidden="true" />
                            </div>
                            <div className="alert-content">
                                <h3 className="alert-heading">Reservation Expired</h3>
                                <p className="alert-body">
                                    Your 15-minute stock lock has elapsed. Please refresh your bag to check current stock availability.
                                </p>
                                <button
                                    type="button"
                                    className="button-secondary refresh-stock-btn"
                                    onClick={onRestartCheckout}
                                >
                                    Refresh Bag &amp; Restart Checkout
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reconciliation Pending State */}
                    {paymentState === 'PAYMENT_RECONCILIATION_PENDING' && (
                        <div className="payment-reconciliation-card" role="status" aria-live="polite">
                            <div className="inline-spinner" aria-hidden="true"></div>
                            <h3 className="reconciliation-heading">Verifying Transaction</h3>
                            <p className="reconciliation-body">
                                Confirming payment with banking network. Please do not close or refresh this tab...
                            </p>
                        </div>
                    )}

                    {/* Action Controls */}
                    {paymentState !== 'EXPIRED_RESERVATION' && paymentState !== 'PAYMENT_RECONCILIATION_PENDING' && (
                        <div className="payment-actions">
                            {paymentState === 'PAYMENT_RETRY_AVAILABLE' || (orderId && serverError) ? (
                                <button
                                    type="button"
                                    className="button-primary submit-payment-btn"
                                    onClick={onRetry}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? 'Initializing Retry...' : `Retry Payment (${formatMoney(totalPaise)})`}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="button-primary submit-payment-btn"
                                    onClick={onPay}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? 'Initializing Secure Session...' : `Pay ${formatMoney(totalPaise)} via Razorpay`}
                                </button>
                            )}

                            <div className="payment-security-note">
                                <Icon name="Lock" size={13} aria-hidden="true" />
                                <span>You will be redirected to the secure Razorpay payment modal to complete transaction. Zero raw card credentials are stored by Nexora.</span>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
            ) : null}
            </AnimatePresence>
        </section>
    );
}
