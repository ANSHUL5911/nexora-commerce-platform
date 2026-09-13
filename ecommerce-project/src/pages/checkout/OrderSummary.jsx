import dayjs from 'dayjs';
import { CartItemDetails } from './CartItemDetails';
import { DeliveryOptions } from './DeliveryOptions';
import { DEFAULT_DELIVERY_OPTIONS } from './deliveryOptionsData';
import { cartApi } from '../../api/cart';


function DeliveryDate({ deliveryOptions, cartItem, selectedShippingMethod = 'STANDARD' }) {
    const methodId = cartItem?.deliveryOptionId || selectedShippingMethod;
    const selectedDeliveryOption = deliveryOptions.find(
        (option) => option.id === methodId
    ) || deliveryOptions[0];

    const deliveryDate = selectedDeliveryOption?.estimatedDeliveryTimeMs
        ? dayjs(selectedDeliveryOption.estimatedDeliveryTimeMs).format('dddd, MMMM D')
        : dayjs().add(selectedDeliveryOption?.days || 5, 'day').format('dddd, MMMM D');

    return (
        <div className="delivery-date">
            Delivery date: {deliveryDate}
        </div>
    );
}

export function OrderSummary({
    deliveryOptions = DEFAULT_DELIVERY_OPTIONS,
    cart = [],
    loadCart,
    selectedShippingMethod = 'STANDARD',
    onSelectShippingMethod
}) {
    const options = (deliveryOptions && deliveryOptions.length > 0) ? deliveryOptions : DEFAULT_DELIVERY_OPTIONS;

    if (!cart || cart.length === 0) {
        return (
            <div className="order-summary empty-cart-message">
                <p>Your cart is empty.</p>
            </div>
        );
    }

    return (
        <div className="order-summary">
            {cart.map((cartItem) => {
                const itemId = cartItem.id || cartItem.productId;
                const deleteCartItem = async () => {
                    try {
                        await cartApi.removeItem(itemId);
                        if (loadCart) {
                            await loadCart();
                        }
                    } catch (err) {
                        console.error('Failed to remove cart item:', err);
                    }
                };

                return (
                    <div key={itemId} className="cart-item-container">
                        <DeliveryDate
                            deliveryOptions={options}
                            cartItem={cartItem}
                            selectedShippingMethod={selectedShippingMethod}
                        />

                        <div className="cart-item-details-grid">
                            <CartItemDetails
                                cartItem={cartItem}
                                deleteCartItem={deleteCartItem}
                                loadCart={loadCart}
                            />

                            <DeliveryOptions
                                deliveryOptions={options}
                                cartItem={cartItem}
                                selectedOptionId={cartItem.deliveryOptionId || selectedShippingMethod}
                                onSelectOption={(optionId) => {
                                    if (onSelectShippingMethod) {
                                        onSelectShippingMethod(optionId);
                                    }
                                }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}