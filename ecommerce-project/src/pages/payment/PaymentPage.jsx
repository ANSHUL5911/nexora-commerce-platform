import { CheckoutPage } from '../checkout/CheckoutPage';

export function PaymentPage({ cart = [], loadCart }) {
    return <CheckoutPage cart={cart} loadCart={loadCart} />;
}
