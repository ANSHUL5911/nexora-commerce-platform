import { useNavigate } from 'react-router';
import { formatMoney } from '../../utils/money';

export function PaymentSummary({ paymentSummary, cart }) {
    const navigate = useNavigate();

    const goToPayment = () => {
        const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
        if (totalQuantity === 0) {
            alert('Your cart is empty. Add items before placing an order.');
            return;
        }
        navigate('/payment');
    };

    return (
        <div className="payment-summary">
            <div className="payment-summary-title">
                Payment Summary
            </div>
            {paymentSummary && (
                <>
                    <div className="payment-summary-row">
                        <div>Items ({paymentSummary.totalItems}):</div>
                        <div className="payment-summary-money">
                            {formatMoney(paymentSummary.productCostCents)}
                        </div>
                    </div>

                    <div className="payment-summary-row">
                        <div>Shipping &amp; handling:</div>
                        <div className="payment-summary-money">
                            {formatMoney(paymentSummary.shippingCostCents)}
                        </div>
                    </div>

                    <div className="payment-summary-row subtotal-row">
                        <div>Total before tax:</div>
                        <div className="payment-summary-money">
                            {formatMoney(paymentSummary.totalCostBeforeTaxCents)}
                        </div>
                    </div>

                    <div className="payment-summary-row">
                        <div>Estimated tax (10%):</div>
                        <div className="payment-summary-money">
                            {formatMoney(paymentSummary.taxCents)}
                        </div>
                    </div>

                    <div className="payment-summary-row total-row">
                        <div>Order total:</div>
                        <div className="payment-summary-money">
                            {formatMoney(paymentSummary.totalCostCents)}
                        </div>
                    </div>
                </>
            )}

            <button className="place-order-button button-primary" onClick={goToPayment}>
                Place your order
            </button>
        </div>
    );
}