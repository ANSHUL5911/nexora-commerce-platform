import { useState } from 'react';
import { OrderSummary } from './OrderSummary';
import { PaymentSummary } from './PaymentSummary';
import { CheckoutHeader } from './CheckoutHeader';
import { DEFAULT_DELIVERY_OPTIONS } from './deliveryOptionsData';
import './CheckoutPage.css';


export function CheckoutPage({ cart = [], loadCart }) {
    const [selectedShippingMethod, setSelectedShippingMethod] = useState('STANDARD');

    return (
        <>
            <title>Checkout</title>
            <link rel="icon" href="cart-favicon.png" />

            <CheckoutHeader cart={cart} />

            <div className="checkout-page">
                <div className="page-title">Review your order</div>

                <div className="checkout-grid">
                    <OrderSummary
                        deliveryOptions={DEFAULT_DELIVERY_OPTIONS}
                        cart={cart}
                        loadCart={loadCart}
                        selectedShippingMethod={selectedShippingMethod}
                        onSelectShippingMethod={setSelectedShippingMethod}
                    />

                    <PaymentSummary
                        cart={cart}
                        selectedShippingMethod={selectedShippingMethod}
                    />
                </div>
            </div>
        </>
    );
}