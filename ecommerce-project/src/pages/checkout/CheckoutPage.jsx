import axios from 'axios';
import { OrderSummary } from './OrderSummary';
import { useEffect, useState } from 'react';
import './CheckoutPage.css';
import { PaymentSummary } from './PaymentSummary';
import { CheckoutHeader } from './CheckoutHeader';


export function CheckoutPage({ cart, loadCart }) {
    const [deliveryOptions, setDeliveryOptions] = useState([]);
    const [paymentSummary, setPaymentSummary] = useState(null);

    useEffect(() => {

        const fetchDeliveryOptions = async () => {
            let response = await axios.get('/api/delivery-options?expand=estimatedDeliveryTime');
            setDeliveryOptions(response.data);
        };
        fetchDeliveryOptions();

    }, []);

    useEffect(() => {

        const fetchPaymentSummary = async () => {
            let response = await axios.get('/api/payment-summary');
            setPaymentSummary(response.data);
        };
        fetchPaymentSummary();

    }, [cart]);

    return (
        <>
            <title>Checkout</title>
            <link rel="icon" href="cart-favicon.png" />

            <CheckoutHeader cart={cart} />


            <div className="checkout-page">
                <div className="page-title">Review your order</div>

                <div className="checkout-grid">
                    <OrderSummary deliveryOptions={deliveryOptions} cart={cart} loadCart={loadCart} />

                    <PaymentSummary paymentSummary={paymentSummary} cart={cart} />
                </div>
            </div>
        </>
    );
}