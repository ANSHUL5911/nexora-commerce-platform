import dayjs from 'dayjs';
import axios from 'axios';
import { CartItemDetails } from './CartItemDetails';
import { DeliveryOptions } from './DeliveryOptions';

function DeliveryDate({ deliveryOptions, cartItem }) {
    const selectedDeliveryOption = deliveryOptions.find(
        (deliveryOption) => deliveryOption.id === cartItem.deliveryOptionId
    );

    return (
        <div className="delivery-date">
            Delivery date: {dayjs(selectedDeliveryOption.estimatedDeliveryTimeMs).format('dddd, MMMM D')}
        </div>
    );
}

export function OrderSummary({ deliveryOptions, cart , loadCart}) {
    return (
        <div className="order-summary">
            {deliveryOptions.length > 0 && cart.map((cartItem) => {

                const deleteCartItem = async () => {
                    await axios.delete(`/api/cart-items/${cartItem.productId}`);
                    await loadCart();
                };

                return (
                    <div key={cartItem.productId} className="cart-item-container">
                        <DeliveryDate deliveryOptions={deliveryOptions} cartItem={cartItem} />

                        <div className="cart-item-details-grid">
                            <CartItemDetails cartItem={cartItem} deleteCartItem={deleteCartItem} loadCart={loadCart} />

                            <DeliveryOptions deliveryOptions={deliveryOptions} cartItem={cartItem} loadCart={loadCart}/>
                        </div>
                    </div>
                );
            })}

        </div>
    );
}