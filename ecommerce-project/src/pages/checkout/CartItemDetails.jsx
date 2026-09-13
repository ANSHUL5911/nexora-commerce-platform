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

    return (
        <>
            <img
                className="product-image"
                src={productImage}
                alt={productName}
            />

            <div className="cart-item-details">
                <div className="product-name">
                    {productName}
                </div>
                <div className="product-price">
                    {formatMoney(pricePaise)}
                </div>
                <div className="product-quantity">
                    <span>
                        Quantity:{' '}
                        {isUpdating ? (
                            <input
                                type="number"
                                min="1"
                                max="99"
                                className="quantity-input"
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                            />
                        ) : (
                            <span className="quantity-label">{cartItem.quantity}</span>
                        )}
                    </span>
                    <button
                        className="update-quantity-link link-primary"
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
                        className="delete-quantity-link link-primary"
                        disabled={loading}
                        onClick={deleteCartItem}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </>
    );
}

