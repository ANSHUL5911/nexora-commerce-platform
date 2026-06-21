import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { Header } from '../../components/Header';
import { formatMoney } from '../../utils/money';
import './PaymentPage.css';

export function PaymentPage({ cart, loadCart }) {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        cardholderName: '',
        cardNumber: '',
        expiryDate: '',
        cvv: ''
    });
    const [errors, setErrors] = useState({});
    const [paymentSummary, setPaymentSummary] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [serverError, setServerError] = useState('');

    useEffect(() => {
        const fetchPaymentSummary = async () => {
            let response = await axios.get('/api/payment-summary');
            setPaymentSummary(response.data);
        };
        fetchPaymentSummary();
    }, [cart]);

    const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

    const validate = () => {
        const newErrors = {};

        if (!formData.cardholderName.trim()) {
            newErrors.cardholderName = 'Cardholder name is required';
        }

        const cardDigits = formData.cardNumber.replace(/\s/g, '');
        if (!cardDigits) {
            newErrors.cardNumber = 'Card number is required';
        } else if (!/^\d{13,19}$/.test(cardDigits)) {
            newErrors.cardNumber = 'Enter a valid card number';
        }

        if (!formData.expiryDate) {
            newErrors.expiryDate = 'Expiry date is required';
        } else if (!/^\d{2}\/\d{2}$/.test(formData.expiryDate)) {
            newErrors.expiryDate = 'Use MM/YY format';
        } else {
            const [month, year] = formData.expiryDate.split('/').map(Number);
            if (month < 1 || month > 12) {
                newErrors.expiryDate = 'Invalid month';
            } else {
                const now = new Date();
                const currentYear = now.getFullYear() % 100;
                const currentMonth = now.getMonth() + 1;
                if (year < currentYear || (year === currentYear && month < currentMonth)) {
                    newErrors.expiryDate = 'Card has expired';
                }
            }
        }

        if (!formData.cvv) {
            newErrors.cvv = 'CVV is required';
        } else if (!/^\d{3,4}$/.test(formData.cvv)) {
            newErrors.cvv = 'Enter a valid CVV';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const formatCardNumber = (value) => {
        const digits = value.replace(/\D/g, '');
        const groups = digits.match(/.{1,4}/g);
        return groups ? groups.join(' ') : '';
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'cardNumber') {
            const digits = value.replace(/\D/g, '').slice(0, 16);
            setFormData(prev => ({ ...prev, cardNumber: formatCardNumber(digits) }));
            return;
        }

        if (name === 'expiryDate') {
            let cleaned = value.replace(/[^\d]/g, '').slice(0, 4);
            if (cleaned.length > 2) {
                cleaned = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
            }
            setFormData(prev => ({ ...prev, expiryDate: cleaned }));
            return;
        }

        if (name === 'cvv') {
            const digits = value.replace(/\D/g, '').slice(0, 4);
            setFormData(prev => ({ ...prev, cvv: digits }));
            return;
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setProcessing(true);
        setServerError('');

        try {
            await axios.post('/api/payments', {
                cardNumber: formData.cardNumber.replace(/\s/g, ''),
                cardholderName: formData.cardholderName,
                expiryDate: formData.expiryDate,
                cvv: formData.cvv
            });

            await axios.post('/api/orders');
            await loadCart();
            navigate('/orders');
        } catch (err) {
            setServerError(
                err.response?.data?.error || 'Payment failed. Please try again.'
            );
        } finally {
            setProcessing(false);
        }
    };

    return (
        <>
            <title>Payment</title>
            <link rel="icon" href="cart-favicon.png" />

            <Header cart={cart} />

            <div className="payment-page">
                <div className="payment-page-title">Payment</div>

                <div className="payment-container">
                    <div className="payment-form-section">
                        <form className="payment-form" onSubmit={handleSubmit}>
                            {serverError && (
                                <div className="payment-error-banner">{serverError}</div>
                            )}

                            <div className="payment-form-group">
                                <label htmlFor="cardholderName">Cardholder Name</label>
                                <input
                                    id="cardholderName"
                                    name="cardholderName"
                                    type="text"
                                    placeholder="John Doe"
                                    value={formData.cardholderName}
                                    onChange={handleChange}
                                    className={errors.cardholderName ? 'input-error' : ''}
                                />
                                {errors.cardholderName && (
                                    <span className="payment-field-error">{errors.cardholderName}</span>
                                )}
                            </div>

                            <div className="payment-form-group">
                                <label htmlFor="cardNumber">Card Number</label>
                                <input
                                    id="cardNumber"
                                    name="cardNumber"
                                    type="text"
                                    placeholder="1234 5678 9012 3456"
                                    value={formData.cardNumber}
                                    onChange={handleChange}
                                    className={errors.cardNumber ? 'input-error' : ''}
                                />
                                {errors.cardNumber && (
                                    <span className="payment-field-error">{errors.cardNumber}</span>
                                )}
                            </div>

                            <div className="payment-form-row">
                                <div className="payment-form-group">
                                    <label htmlFor="expiryDate">Expiry Date</label>
                                    <input
                                        id="expiryDate"
                                        name="expiryDate"
                                        type="text"
                                        placeholder="MM/YY"
                                        value={formData.expiryDate}
                                        onChange={handleChange}
                                        className={errors.expiryDate ? 'input-error' : ''}
                                    />
                                    {errors.expiryDate && (
                                        <span className="payment-field-error">{errors.expiryDate}</span>
                                    )}
                                </div>

                                <div className="payment-form-group">
                                    <label htmlFor="cvv">CVV</label>
                                    <input
                                        id="cvv"
                                        name="cvv"
                                        type="password"
                                        placeholder="123"
                                        value={formData.cvv}
                                        onChange={handleChange}
                                        className={errors.cvv ? 'input-error' : ''}
                                    />
                                    {errors.cvv && (
                                        <span className="payment-field-error">{errors.cvv}</span>
                                    )}
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="pay-button button-primary"
                                disabled={processing}
                            >
                                {processing ? 'Processing...' : `Pay ${formatMoney(paymentSummary?.totalCostCents ?? 0)}`}
                            </button>
                        </form>
                    </div>

                    <div className="payment-info-section">
                        <div className="payment-info-title">Order Summary</div>
                        {paymentSummary && (
                            <>
                                <div className="payment-info-row">
                                    <span>Items ({paymentSummary.totalItems}):</span>
                                    <span>{formatMoney(paymentSummary.productCostCents)}</span>
                                </div>
                                <div className="payment-info-row">
                                    <span>Shipping &amp; handling:</span>
                                    <span>{formatMoney(paymentSummary.shippingCostCents)}</span>
                                </div>
                                <div className="payment-info-row">
                                    <span>Total before tax:</span>
                                    <span>{formatMoney(paymentSummary.totalCostBeforeTaxCents)}</span>
                                </div>
                                <div className="payment-info-row">
                                    <span>Estimated tax (10%):</span>
                                    <span>{formatMoney(paymentSummary.taxCents)}</span>
                                </div>
                                <div className="payment-info-divider"></div>
                                <div className="payment-info-total">
                                    <span>Order total:</span>
                                    <span>{formatMoney(paymentSummary.totalCostCents)}</span>
                                </div>
                            </>
                        )}
                        <div className="payment-secure-badge">
                            <img src="images/icons/checkout-lock-icon.png" alt="Secure" />
                            <span>Secure payment</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
