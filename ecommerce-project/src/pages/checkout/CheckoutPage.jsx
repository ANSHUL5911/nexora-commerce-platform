import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckoutHeader } from './CheckoutHeader';
import { ShippingAddressStep } from './ShippingAddressStep';
import { DeliveryOptions } from './DeliveryOptions';
import { OrderSummary } from './OrderSummary';
import { PaymentStep } from './PaymentStep';
import { PaymentSummary } from './PaymentSummary';
import { DEFAULT_DELIVERY_OPTIONS } from './deliveryOptionsData';
import { checkoutApi } from '../../api/checkout';
import { paymentsApi } from '../../api/payments';
import { AuthModal } from '../../components/auth/AuthModal';
import { openRazorpayCheckout, retryAndPayOrder } from '../../services/paymentOrchestration';
import './CheckoutPage.css';

export function CheckoutPage({ cart = [], loadCart, currentUser, authLoading = false, onAuthChange }) {
    const navigate = useNavigate();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authMode, setAuthMode] = useState('login');

    // Step state tracking: 1, 2, 3, or 4
    const [activeStep, setActiveStep] = useState(1);
    const [completedSteps, setCompletedSteps] = useState({
        1: false,
        2: false,
        3: false,
        4: false,
    });

    // Form and transaction state
    const [shippingAddress, setShippingAddress] = useState({
        fullName: '',
        addressLine1: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
    });

    const [shippingMethod, setShippingMethod] = useState('STANDARD');

    // Frontend Payment Presentation State Machine
    // 'READY_FOR_PAYMENT' | 'PAYMENT_PROCESSING' | 'PAYMENT_RECONCILIATION_PENDING' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_RETRY_AVAILABLE' | 'EXPIRED_RESERVATION'
    const [paymentState, setPaymentState] = useState('READY_FOR_PAYMENT');
    const [serverError, setServerError] = useState('');
    const [pendingOrder, setPendingOrder] = useState(null);

    // Subtotal and Total calculations (Integer Paise)
    const subtotalPaise = (cart || []).reduce((sum, item) => {
        const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? 0;
        return sum + (itemPrice * (item.quantity || 1));
    }, 0);

    const shippingFeePaise = shippingMethod === 'OVERNIGHT'
        ? 30000
        : (shippingMethod === 'EXPRESS' ? 10000 : 0);

    const totalPaise = subtotalPaise + shippingFeePaise;

    // Handlers for Step Transitions
    const handleSaveAddress = (addressData) => {
        setShippingAddress(addressData);
        setCompletedSteps((prev) => ({ ...prev, 1: true }));
        setActiveStep(2);
    };

    const handleContinueShipping = () => {
        setCompletedSteps((prev) => ({ ...prev, 2: true }));
        setActiveStep(3);
    };

    const handleContinueReview = () => {
        setCompletedSteps((prev) => ({ ...prev, 3: true }));
        setActiveStep(4);
    };

    // Payment Execution Flow
    const handleInitiateAndPay = async () => {
        if (!currentUser) {
            setIsAuthModalOpen(true);
            return;
        }

        setPaymentState('PAYMENT_PROCESSING');
        setServerError('');

        try {
            let orderId = pendingOrder?.id;

            // Step 1: Initiate Unified Checkout if not already created
            if (!pendingOrder) {
                const initiatePayload = {
                    shippingAddress: {
                        fullName: shippingAddress.fullName.trim(),
                        addressLine1: shippingAddress.addressLine1.trim(),
                        city: shippingAddress.city.trim(),
                        state: shippingAddress.state.trim(),
                        pincode: shippingAddress.pincode.trim(),
                        phone: shippingAddress.phone.replace(/\D/g, ''),
                    },
                    shippingMethod,
                };

                const checkoutResult = await checkoutApi.initiateCheckout(initiatePayload);

                const createdOrder = checkoutResult.order || checkoutResult.data?.order || checkoutResult.data || checkoutResult;
                orderId = createdOrder.id;

                setPendingOrder(createdOrder);
            }

            // Step 2: Create Payment Attempt
            const paymentResult = await paymentsApi.createPaymentOrder({
                orderId,
            });

            const paymentData = paymentResult.data || paymentResult;

            // Step 3: Launch Razorpay Checkout Modal
            openRazorpayCheckout({
                paymentData,
                orderId,
                onBeforeVerify: () => {
                    setPaymentState('PAYMENT_RECONCILIATION_PENDING');
                },
                onVerified: async () => {
                    setPaymentState('PAYMENT_SUCCESS');
                    if (loadCart) {
                        await loadCart();
                    }
                    navigate('/orders', {
                        state: {
                            orderId,
                        },
                    });
                },
                onDismiss: () => {
                    setPaymentState('PAYMENT_FAILED');
                    setServerError('Payment was dismissed before completion. You can retry payment.');
                },
                onError: (err) => {
                    const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || 'Payment initiation failed.';
                    setServerError(msg);
                    setPaymentState('PAYMENT_RETRY_AVAILABLE');
                },
            });
        } catch (err) {
            const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || 'Payment initiation failed.';
            setServerError(msg);
            setPaymentState('PAYMENT_FAILED');
        }
    };

    // Payment Retry Flow (Against the SAME ecommerce Order)
    const handleRetryPayment = async () => {
        if (!pendingOrder) return;
        setPaymentState('PAYMENT_PROCESSING');
        setServerError('');

        await retryAndPayOrder({
            orderId: pendingOrder.id,
            onBeforeVerify: () => {
                setPaymentState('PAYMENT_RECONCILIATION_PENDING');
            },
            onVerified: async () => {
                setPaymentState('PAYMENT_SUCCESS');
                if (loadCart) {
                    await loadCart();
                }
                navigate('/orders', {
                    state: {
                        orderId: pendingOrder.id,
                    },
                });
            },
            onDismiss: () => {
                setPaymentState('PAYMENT_FAILED');
                setServerError('Payment was dismissed. You can retry payment.');
            },
            onError: (err) => {
                const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || 'Payment retry failed.';
                setServerError(msg);
                setPaymentState('PAYMENT_RETRY_AVAILABLE');
            },
        });
    };

    const handleRestartCheckout = () => {
        setPendingOrder(null);
        setPaymentState('READY_FOR_PAYMENT');
        setActiveStep(1);
    };

    const handleAuthSuccess = async (user) => {
        if (onAuthChange) {
            await onAuthChange(user);
        }
        setIsAuthModalOpen(false);
    };

    if (authLoading) {
        return (
            <>
                <title>Checkout — Nexora</title>
                <CheckoutHeader cart={cart} />
                <main className="checkout-main-container" id="checkout-content">
                    <div className="empty-checkout-card" role="status" aria-live="polite">
                        <div className="inline-spinner" aria-hidden="true" style={{ margin: '0 auto var(--space-4)' }}></div>
                        <h1 className="empty-title">Verifying Session</h1>
                        <p className="empty-description">Please wait while we verify your authentication status.</p>
                    </div>
                </main>
            </>
        );
    }

    if (!currentUser) {
        return (
            <>
                <title>Checkout — Nexora</title>
                <CheckoutHeader cart={cart} />
                <main className="checkout-main-container" id="checkout-content">
                    <div className="empty-checkout-card checkout-auth-gate-card">
                        <h1 className="empty-title">Sign in to continue</h1>
                        <p className="empty-description">
                            Create an account or sign in to continue to checkout.
                        </p>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
                            <button
                                type="button"
                                className="button-primary"
                                onClick={() => {
                                    setAuthMode('login');
                                    setIsAuthModalOpen(true);
                                }}
                            >
                                Sign In
                            </button>
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={() => {
                                    setAuthMode('register');
                                    setIsAuthModalOpen(true);
                                }}
                            >
                                Create Account
                            </button>
                        </div>
                    </div>
                </main>

                <AuthModal
                    isOpen={isAuthModalOpen}
                    initialMode={authMode}
                    onClose={() => setIsAuthModalOpen(false)}
                    onAuthSuccess={handleAuthSuccess}
                    subtitle="Create an account or sign in to continue to checkout."
                />
            </>
        );
    }

    const isEmptyCart = !cart || cart.length === 0;

    return (
        <>
            <title>Checkout — Nexora</title>

            <CheckoutHeader cart={cart} />

            <main className="checkout-main-container" id="checkout-content">
                {isEmptyCart ? (
                    <div className="empty-checkout-card">
                        <h1 className="empty-title">Your shopping bag is empty</h1>
                        <p className="empty-description">
                            You have no items in your cart to checkout.
                        </p>
                        <button
                            type="button"
                            className="button-primary return-shop-btn"
                            onClick={() => navigate('/')}
                        >
                            Explore Catalog
                        </button>
                    </div>
                ) : (
                    <div className="checkout-two-col-layout">
                        {/* Left Column: 4-Step Linear Progression */}
                        <div className="checkout-steps-column">
                            <h1 className="checkout-page-heading">Checkout</h1>

                            {/* Step 1: Delivery Address */}
                            <ShippingAddressStep
                                address={shippingAddress}
                                onSaveAddress={handleSaveAddress}
                                isCompleted={completedSteps[1]}
                                isActive={activeStep === 1}
                                onEdit={() => setActiveStep(1)}
                            />

                            {/* Step 2: Shipping Method */}
                            <DeliveryOptions
                                deliveryOptions={DEFAULT_DELIVERY_OPTIONS}
                                selectedOptionId={shippingMethod}
                                onSelectOption={setShippingMethod}
                                onContinue={handleContinueShipping}
                                isCompleted={completedSteps[2]}
                                isActive={activeStep === 2}
                                onEdit={() => setActiveStep(2)}
                            />

                            {/* Step 3: Order Review & Stock Reservation */}
                            <OrderSummary
                                cart={cart}
                                loadCart={loadCart}
                                reservationExpiresAt={pendingOrder?.reservationExpiresAt || pendingOrder?.reservation_expires_at}
                                onContinue={handleContinueReview}
                                isCompleted={completedSteps[3]}
                                isActive={activeStep === 3}
                                onEdit={() => setActiveStep(3)}
                            />

                            {/* Step 4: Authoritative Razorpay Payment */}
                            <PaymentStep
                                isActive={activeStep === 4}
                                isCompleted={completedSteps[4]}
                                paymentState={paymentState}
                                totalPaise={totalPaise}
                                onPay={handleInitiateAndPay}
                                onRetry={handleRetryPayment}
                                onRestartCheckout={handleRestartCheckout}
                                serverError={serverError}
                                orderId={pendingOrder?.id}
                                reservationExpiresAt={pendingOrder?.reservationExpiresAt}
                            />
                        </div>

                        {/* Right Column: Sticky Order Summary & Non-Intrusive Mobile Toggle */}
                        <div className="checkout-summary-column">
                            <PaymentSummary
                                cart={cart}
                                selectedShippingMethod={shippingMethod}
                                onPlaceOrder={handleInitiateAndPay}
                                processing={paymentState === 'PAYMENT_PROCESSING' || paymentState === 'PAYMENT_RECONCILIATION_PENDING'}
                                disabled={activeStep !== 4}
                                isStep4Active={activeStep === 4}
                                orderTotalPaise={pendingOrder?.totalPaise ?? totalPaise}
                            />
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}