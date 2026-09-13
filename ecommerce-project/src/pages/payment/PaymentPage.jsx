import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Header } from '../../components/Header';
import { formatMoney } from '../../utils/money';
import { checkoutApi } from '../../api/checkout';
import { paymentsApi } from '../../api/payments';
import './PaymentPage.css';

export function PaymentPage({ cart = [], loadCart }) {
    const navigate = useNavigate();
    const location = useLocation();

    const [shippingAddress, setShippingAddress] = useState({
        fullName: '',
        addressLine1: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
    });

    const [shippingMethod, setShippingMethod] = useState(
        location.state?.shippingMethod || 'STANDARD'
    );

    const [errors, setErrors] = useState({});
    const [processing, setProcessing] = useState(false);
    const [serverError, setServerError] = useState('');
    const [pendingOrder, setPendingOrder] = useState(null);
    const [guestToken, setGuestToken] = useState(null);

    const totalQuantity = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotalPaise = (cart || []).reduce((sum, item) => {
        const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? 0;
        return sum + (itemPrice * (item.quantity || 1));
    }, 0);

    const shippingFeePaise = shippingMethod === 'OVERNIGHT'
        ? 30000
        : (shippingMethod === 'EXPRESS' ? 10000 : 0);

    const totalPaise = subtotalPaise + shippingFeePaise;

    const validate = () => {
        const newErrors = {};

        if (!shippingAddress.fullName.trim()) {
            newErrors.fullName = 'Full name is required';
        }
        if (!shippingAddress.addressLine1.trim()) {
            newErrors.addressLine1 = 'Address is required';
        }
        if (!shippingAddress.city.trim()) {
            newErrors.city = 'City is required';
        }
        if (!shippingAddress.state.trim()) {
            newErrors.state = 'State is required';
        }
        if (!shippingAddress.pincode.trim()) {
            newErrors.pincode = 'Pincode is required';
        } else if (!/^\d{6}$/.test(shippingAddress.pincode.trim())) {
            newErrors.pincode = 'Enter a valid 6-digit pincode';
        }
        if (!shippingAddress.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        } else if (!/^\d{10}$/.test(shippingAddress.phone.replace(/\D/g, ''))) {
            newErrors.phone = 'Enter a valid 10-digit phone number';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setShippingAddress((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    const handleCheckoutAndPay = async (e) => {
        if (e) e.preventDefault();
        if (!validate()) return;

        setProcessing(true);
        setServerError('');

        try {
            // Step 1: Initiate Unified Checkout -> creates Order (PENDING_PAYMENT) & reserves inventory
            let orderId = pendingOrder?.id;
            let currentGuestToken = guestToken;

            if (!pendingOrder) {
                const checkoutResult = await checkoutApi.initiateCheckout({
                    shippingAddress: {
                        fullName: shippingAddress.fullName.trim(),
                        addressLine1: shippingAddress.addressLine1.trim(),
                        city: shippingAddress.city.trim(),
                        state: shippingAddress.state.trim(),
                        pincode: shippingAddress.pincode.trim(),
                        phone: shippingAddress.phone.replace(/\D/g, ''),
                    },
                    shippingMethod,
                });

                const createdOrder = checkoutResult.order || checkoutResult.data?.order || checkoutResult;
                orderId = createdOrder.id;
                currentGuestToken = checkoutResult.guestToken || checkoutResult.data?.guestToken || null;

                setPendingOrder(createdOrder);
                if (currentGuestToken) {
                    setGuestToken(currentGuestToken);
                }
            }

            // Step 2: Create Razorpay Payment Attempt
            const paymentResult = await paymentsApi.createPaymentOrder({
                orderId,
                guestToken: currentGuestToken,
            });

            const paymentData = paymentResult.data || paymentResult;

            // Step 3: Handle Razorpay Checkout
            if (typeof window !== 'undefined' && window.Razorpay && paymentData.razorpayOrderId) {
                const rzp = new window.Razorpay({
                    key: paymentData.keyId,
                    amount: paymentData.amount,
                    currency: paymentData.currency || 'INR',
                    name: 'Nexora Commerce',
                    description: `Order #${orderId}`,
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
                            setProcessing(false);
                        },
                    },
                });
                rzp.open();
            } else {
                // Mock / Sandbox direct verification flow when Razorpay JS script is not embedded
                await handleVerifyPayment({
                    orderId,
                    razorpayPaymentId: `pay_sim_${Date.now()}`,
                    razorpayOrderId: paymentData.razorpayOrderId || `order_sim_${Date.now()}`,
                    razorpaySignature: 'simulated_valid_signature',
                    guestToken: currentGuestToken,
                });
            }
        } catch (err) {
            setServerError(
                err.response?.data?.error || err.response?.data?.message || err.message || 'Payment initiation failed. Please try again.'
            );
            setProcessing(false);
        }
    };

    const handleVerifyPayment = async ({ orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature, guestToken: gToken }) => {
        try {
            setProcessing(true);
            await paymentsApi.verifyPayment({
                orderId,
                razorpayPaymentId,
                razorpayOrderId,
                razorpaySignature,
                guestToken: gToken,
            });

            if (loadCart) {
                await loadCart();
            }
            navigate('/orders', {
                state: {
                    guestToken: gToken,
                    orderId,
                }
            });
        } catch (err) {
            setServerError(
                err.response?.data?.error || err.response?.data?.message || err.message || 'Payment verification failed. You may retry payment.'
            );
        } finally {
            setProcessing(false);

        }
    };

    const handleRetryPayment = async () => {
        if (!pendingOrder) return;
        setProcessing(true);
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
                    description: `Order #${pendingOrder.id}`,
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
                            setProcessing(false);
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
            setServerError(
                err.response?.data?.error || err.response?.data?.message || err.message || 'Payment retry failed. Please try again.'
            );
            setProcessing(false);
        }
    };

    return (
        <>
            <title>Payment &amp; Delivery</title>
            <link rel="icon" href="cart-favicon.png" />

            <Header cart={cart} />

            <div className="payment-page">
                <div className="payment-page-title">Delivery &amp; Payment</div>

                <div className="payment-container">
                    <div className="payment-form-section">
                        <form className="payment-form" onSubmit={handleCheckoutAndPay}>
                            {serverError && (
                                <div className="payment-error-banner">
                                    <p>{serverError}</p>
                                    {pendingOrder && (
                                        <button
                                            type="button"
                                            className="retry-button button-secondary"
                                            onClick={handleRetryPayment}
                                            disabled={processing}
                                            style={{ marginTop: '8px' }}
                                        >
                                            {processing ? 'Retrying...' : 'Retry Payment'}
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="payment-form-group">
                                <label htmlFor="fullName">Full Name</label>
                                <input
                                    id="fullName"
                                    name="fullName"
                                    type="text"
                                    placeholder="John Doe"
                                    value={shippingAddress.fullName}
                                    onChange={handleChange}
                                    className={errors.fullName ? 'input-error' : ''}
                                />
                                {errors.fullName && (
                                    <span className="payment-field-error">{errors.fullName}</span>
                                )}
                            </div>

                            <div className="payment-form-group">
                                <label htmlFor="addressLine1">Delivery Address</label>
                                <input
                                    id="addressLine1"
                                    name="addressLine1"
                                    type="text"
                                    placeholder="123 Main St, Apartment 4B"
                                    value={shippingAddress.addressLine1}
                                    onChange={handleChange}
                                    className={errors.addressLine1 ? 'input-error' : ''}
                                />
                                {errors.addressLine1 && (
                                    <span className="payment-field-error">{errors.addressLine1}</span>
                                )}
                            </div>

                            <div className="payment-form-row">
                                <div className="payment-form-group">
                                    <label htmlFor="city">City</label>
                                    <input
                                        id="city"
                                        name="city"
                                        type="text"
                                        placeholder="Mumbai"
                                        value={shippingAddress.city}
                                        onChange={handleChange}
                                        className={errors.city ? 'input-error' : ''}
                                    />
                                    {errors.city && (
                                        <span className="payment-field-error">{errors.city}</span>
                                    )}
                                </div>

                                <div className="payment-form-group">
                                    <label htmlFor="state">State</label>
                                    <input
                                        id="state"
                                        name="state"
                                        type="text"
                                        placeholder="Maharashtra"
                                        value={shippingAddress.state}
                                        onChange={handleChange}
                                        className={errors.state ? 'input-error' : ''}
                                    />
                                    {errors.state && (
                                        <span className="payment-field-error">{errors.state}</span>
                                    )}
                                </div>
                            </div>

                            <div className="payment-form-row">
                                <div className="payment-form-group">
                                    <label htmlFor="pincode">Pincode</label>
                                    <input
                                        id="pincode"
                                        name="pincode"
                                        type="text"
                                        maxLength="6"
                                        placeholder="400001"
                                        value={shippingAddress.pincode}
                                        onChange={handleChange}
                                        className={errors.pincode ? 'input-error' : ''}
                                    />
                                    {errors.pincode && (
                                        <span className="payment-field-error">{errors.pincode}</span>
                                    )}
                                </div>

                                <div className="payment-form-group">
                                    <label htmlFor="phone">Phone Number</label>
                                    <input
                                        id="phone"
                                        name="phone"
                                        type="tel"
                                        maxLength="10"
                                        placeholder="9876543210"
                                        value={shippingAddress.phone}
                                        onChange={handleChange}
                                        className={errors.phone ? 'input-error' : ''}
                                    />
                                    {errors.phone && (
                                        <span className="payment-field-error">{errors.phone}</span>
                                    )}
                                </div>
                            </div>

                            <div className="payment-form-group">
                                <label htmlFor="shippingMethod">Shipping Method</label>
                                <select
                                    id="shippingMethod"
                                    name="shippingMethod"
                                    value={shippingMethod}
                                    onChange={(e) => setShippingMethod(e.target.value)}
                                    style={{ padding: '10px 12px', borderRadius: '5px', border: '1px solid rgb(200, 200, 200)' }}
                                >
                                    <option value="STANDARD">Standard Delivery (FREE)</option>
                                    <option value="EXPRESS">Express Delivery (₹100)</option>
                                    <option value="OVERNIGHT">Overnight Delivery (₹300)</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="pay-button button-primary"
                                disabled={processing || totalQuantity === 0}
                            >
                                {processing ? 'Processing Payment...' : `Pay ${formatMoney(totalPaise)} via Razorpay`}
                            </button>
                        </form>
                    </div>

                    <div className="payment-info-section">
                        <div className="payment-info-title">Order Summary</div>
                        <div className="payment-info-row">
                            <span>Items ({totalQuantity}):</span>
                            <span>{formatMoney(subtotalPaise)}</span>
                        </div>
                        <div className="payment-info-row">
                            <span>Shipping &amp; handling:</span>
                            <span>{formatMoney(shippingFeePaise)}</span>
                        </div>
                        <div className="payment-info-divider"></div>
                        <div className="payment-info-total">
                            <span>Order total:</span>
                            <span>{formatMoney(totalPaise)}</span>
                        </div>
                        <div className="payment-secure-badge">
                            <img src="images/icons/checkout-lock-icon.png" alt="Secure" />
                            <span>Powered by Razorpay Secure</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

