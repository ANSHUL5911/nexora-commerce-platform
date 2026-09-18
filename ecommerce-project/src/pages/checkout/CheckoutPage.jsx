import { useState, useCallback } from 'react';
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
import { clearGuestCart } from '../../api/guestCart';
import './CheckoutPage.css';

export function CheckoutPage({ cart = [], loadCart, currentUser }) {
    const navigate = useNavigate();

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
    const [guestToken, setGuestToken] = useState(null);

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
        setPaymentState('PAYMENT_PROCESSING');
        setServerError('');

        try {
            let orderId = pendingOrder?.id;
            let currentGuestToken = guestToken;

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

                // Guest buyer: provide direct items payload required by backend
                if (currentUser === null) {
                    initiatePayload.items = (cart || []).map((item) => ({
                        productId: item.productId || item.id,
                        quantity: item.quantity,
                    }));
                }

                const checkoutResult = await checkoutApi.initiateCheckout(initiatePayload);

                const createdOrder = checkoutResult.order || checkoutResult.data?.order || checkoutResult.data || checkoutResult;
                orderId = createdOrder.id;
                currentGuestToken = checkoutResult.guestToken || checkoutResult.data?.guestToken || null;

                setPendingOrder(createdOrder);
                if (currentGuestToken) {
                    setGuestToken(currentGuestToken);
                }

                // If guest checkout successfully created Order, clear local guest cart
                if (currentUser === null && orderId) {
                    clearGuestCart();
                }
            }

            // Step 2: Create Payment Attempt
            const paymentResult = await paymentsApi.createPaymentOrder({
                orderId,
                guestToken: currentGuestToken,
            });

            const paymentData = paymentResult.data || paymentResult;

            // Step 3: Launch Razorpay Checkout Modal
            if (typeof window !== 'undefined' && window.Razorpay && paymentData.razorpayOrderId) {
                const rzp = new window.Razorpay({
                    key: paymentData.keyId,
                    amount: paymentData.amount,
                    currency: paymentData.currency || 'INR',
                    name: 'Nexora Commerce',
                    description: `Order #${orderId.slice(0, 8)}`,
                    order_id: paymentData.razorpayOrderId,
                    handler: async function (response) {
                        await handleVerifyPayment({
                            orderId,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpayOrderId: response.razorpay_order_id,
                            razorpaySignature: response.razorpay_signature,
                            guestToken: currentGuestToken,
                        });
                    },
                    modal: {
                        ondismiss: function () {
                            setPaymentState('PAYMENT_FAILED');
                            setServerError('Payment was dismissed before completion. You can retry payment.');
                        },
                    },
                });
                rzp.open();
            } else {
                // Direct verification fallback for testing / headless simulation
                await handleVerifyPayment({
                    orderId,
                    razorpayPaymentId: `pay_sim_${Date.now()}`,
                    razorpayOrderId: paymentData.razorpayOrderId || `order_sim_${Date.now()}`,
                    razorpaySignature: 'simulated_valid_signature',
                    guestToken: currentGuestToken,
                });
            }
        } catch (err) {
            const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || 'Payment initiation failed.';
            setServerError(msg);
            setPaymentState('PAYMENT_FAILED');
        }
    };

    // Payment Verification Flow
    const handleVerifyPayment = useCallback(async ({ orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature, guestToken: gToken }) => {
        try {
            setPaymentState('PAYMENT_RECONCILIATION_PENDING');
            await paymentsApi.verifyPayment({
                orderId,
                razorpayPaymentId,
                razorpayOrderId,
                razorpaySignature,
                guestToken: gToken,
            });

            setPaymentState('PAYMENT_SUCCESS');
            if (loadCart) {
                await loadCart();
            }
            navigate('/orders', {
                state: {
                    guestToken: gToken,
                    orderId,
                },
            });
        } catch (err) {
            const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || 'Payment verification failed.';
            setServerError(msg);
            setPaymentState('PAYMENT_RETRY_AVAILABLE');
        }
    }, [loadCart, navigate]);

    // Payment Retry Flow (Against the SAME ecommerce Order)
    const handleRetryPayment = async () => {
        if (!pendingOrder) return;
        setPaymentState('PAYMENT_PROCESSING');
        setServerError('');

        try {
            const retryResult = await paymentsApi.retryPayment({
                orderId: pendingOrder.id,
                guestToken,
            });

            const paymentData = retryResult.data || retryResult;

            if (typeof window !== 'undefined' && window.Razorpay && paymentData.razorpayOrderId) {
                const rzp = new window.Razorpay({
                    key: paymentData.keyId,
                    amount: paymentData.amount,
                    currency: paymentData.currency || 'INR',
                    name: 'Nexora Commerce',
                    description: `Order #${pendingOrder.id.slice(0, 8)}`,
                    order_id: paymentData.razorpayOrderId,
                    handler: async function (response) {
                        await handleVerifyPayment({
                            orderId: pendingOrder.id,
                            razorpayPaymentId: response.razorpay_payment_id,
                            razorpayOrderId: response.razorpay_order_id,
                            razorpaySignature: response.razorpay_signature,
                            guestToken,
                        });
                    },
                    modal: {
                        ondismiss: function () {
                            setPaymentState('PAYMENT_FAILED');
                            setServerError('Payment was dismissed. You can retry payment.');
                        },
                    },
                });
                rzp.open();
            } else {
                await handleVerifyPayment({
                    orderId: pendingOrder.id,
                    razorpayPaymentId: `pay_retry_${Date.now()}`,
                    razorpayOrderId: paymentData.razorpayOrderId || `order_retry_${Date.now()}`,
                    razorpaySignature: 'simulated_retry_signature',
                    guestToken,
                });
            }
        } catch (err) {
            const msg = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data?.message || err.message || 'Payment retry failed.';
            setServerError(msg);
            setPaymentState('PAYMENT_RETRY_AVAILABLE');
        }
    };

    const handleRestartCheckout = () => {
        setPendingOrder(null);
        setPaymentState('READY_FOR_PAYMENT');
        setActiveStep(1);
    };

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