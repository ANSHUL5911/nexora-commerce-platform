import dayjs from 'dayjs';
import axios from 'axios';
import { formatMoney } from '../../utils/money';
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

function CartItemDetails({ cartItem, deleteCartItem }) {
    return (
        <>
            <img className="product-image"
                src={cartItem.product.image} />

            <div className="cart-item-details">
                <div className="product-name">
                    {cartItem.product.name}
                </div>
                <div className="product-price">
                    {formatMoney(cartItem.product.priceCents)}
                </div>
                <div className="product-quantity">
                    <span>
                        Quantity: <span className="quantity-label">{cartItem.quantity}</span>
                    </span>
                    <span className="update-quantity-link link-primary">
                        Update
                    </span>
                    <span className="delete-quantity-link link-primary" onClick={deleteCartItem}>
                        Delete
                    </span>
                </div>
            </div>
        </>
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
                            <CartItemDetails cartItem={cartItem} deleteCartItem={deleteCartItem} />

                            <DeliveryOptions deliveryOptions={deliveryOptions} cartItem={cartItem} loadCart={loadCart}/>
                        </div>
                    </div>
                );
            })}

        </div>
    );
}