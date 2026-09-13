import { useState } from 'react';
import { formatMoney } from '../../utils/money';
import { cartApi } from '../../api/cart';

export function CartItemDetails({ cartItem, deleteCartItem, loadCart }) {
    const [isUpdating, setIsUpdating] = useState(false);
    const [quantity, setQuantity] = useState(cartItem.quantity);
    const [loading, setLoading] = useState(false);

    const updateQuantity = async () => {
        const newQty = Number(quantity);
        if (isNaN(newQty) || newQty <= 0) {
            setQuantity(cartItem.quantity);
            setIsUpdating(false);
            return;
        }

        try {
            setLoading(true);
            const itemId = cartItem.id || cartItem.productId;
            await cartApi.updateItem(itemId, { quantity: newQty });
            if (loadCart) {
                await loadCart();
            }
            setIsUpdating(false);
        } catch (err) {
            console.error('Failed to update cart item quantity:', err);
            setQuantity(cartItem.quantity);
            setIsUpdating(false);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            updateQuantity();
        } else if (event.key === 'Escape') {
            setQuantity(cartItem.quantity);
            setIsUpdating(false);
        }
    };

    const productName = cartItem.name || cartItem.product?.name || 'Product';
    const productImage = cartItem.image || cartItem.imageUrl || cartItem.product?.image || cartItem.product?.imageUrl || 'images/products/athletic-cotton-socks-6-pairs.jpg';
    const pricePaise = cartItem.pricePaise ?? cartItem.product?.pricePaise ?? cartItem.product?.priceCents ?? 0;
    const availableQty = cartItem.available_quantity ?? cartItem.product?.available_quantity;

    return (
        <div className="cart-item-row">
            <div className="cart-item-image-wrapper">
                <img
                    className="cart-item-thumbnail"
                    src={productImage}
                    alt={productName}
                    loading="lazy"
                />
            </div>

            <div className="cart-item-content">
                <div className="cart-item-header">
                    <h3 className="cart-item-name">{productName}</h3>
                    <span className="cart-item-price">{formatMoney(pricePaise)}</span>
                </div>

                {availableQty !== undefined && availableQty <= 5 && availableQty > 0 && (
                    <span className="stock-notice">Only {availableQty} left</span>
                )}

                <div className="cart-item-controls">
                    <span className="quantity-indicator">
                        Qty:{' '}
                        {isUpdating ? (
                            <input
                                type="number"
                                min="1"
                                max="10"
                                className="quantity-inline-input"
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                aria-label={`Update quantity for ${productName}`}
                            />
                        ) : (
                            <span className="quantity-value">{cartItem.quantity}</span>
                        )}
                    </span>

                    <button
                        type="button"
                        className="control-text-btn update-btn"
                        disabled={loading}
                        onClick={() => {
                            if (isUpdating) {
                                updateQuantity();
                            } else {
                                setIsUpdating(true);
                            }
                        }}
                    >
                        {loading ? 'Saving...' : (isUpdating ? 'Save' : 'Update')}
                    </button>

                    <button
                        type="button"
                        className="control-text-btn delete-btn"
                        disabled={loading}
                        onClick={deleteCartItem}
                        aria-label={`Remove ${productName} from cart`}
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
    );
}
