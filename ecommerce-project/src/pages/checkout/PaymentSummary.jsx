import { useNavigate } from 'react-router';
import { formatMoney } from '../../utils/money';

export function PaymentSummary({
    cart = [],
    selectedShippingMethod = 'STANDARD'
}) {
    const navigate = useNavigate();

    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotalPaise = cart.reduce((sum, item) => {
        const itemPrice = item.pricePaise ?? item.product?.pricePaise ?? item.product?.priceCents ?? 0;
        return sum + (itemPrice * (item.quantity || 1));
    }, 0);

    const shippingFeePaise = selectedShippingMethod === 'OVERNIGHT'
        ? 30000
        : (selectedShippingMethod === 'EXPRESS' ? 10000 : 0);

    const totalPaise = subtotalPaise + shippingFeePaise;

    const goToPayment = () => {
        if (totalItems === 0) {
            alert('Your cart is empty. Add items before placing an order.');
            return;
        }
        navigate('/payment', {
            state: {
                shippingMethod: selectedShippingMethod
            }
        });
    };

    return (
        <div className="payment-summary">
            <div className="payment-summary-title">
                Payment Summary
            </div>

            <div className="payment-summary-row">
                <div>Items ({totalItems}):</div>
                <div className="payment-summary-money">
                    {formatMoney(subtotalPaise)}
                </div>
            </div>

            <div className="payment-summary-row">
                <div>Shipping &amp; handling:</div>
                <div className="payment-summary-money">
                    {formatMoney(shippingFeePaise)}
                </div>
            </div>

            <div className="payment-summary-row total-row">
                <div>Order total:</div>
                <div className="payment-summary-money">
                    {formatMoney(totalPaise)}
                </div>
            </div>

            <button
                className="place-order-button button-primary"
                onClick={goToPayment}
                disabled={totalItems === 0}
            >
                Proceed to Payment
            </button>
        </div>
    );
}