import { useState } from 'react';
import axios from 'axios';
import { formatMoney } from '../../utils/money';

export function CartItemDetails({ cartItem, deleteCartItem, loadCart }) {
    const [isUpdating, setIsUpdating] = useState(false);
    const [quantity, setQuantity] = useState(cartItem.quantity);

    const updateQuantity = async () => {
        await axios.put(`/api/cart-items/${cartItem.productId}`, { quantity: Number(quantity) });
        await loadCart();
        setIsUpdating(false);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            updateQuantity();
        } else if (event.key === 'Escape') {
            setQuantity(cartItem.quantity);
            setIsUpdating(false);
        }
    };

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
                        Quantity:{' '}
                        {isUpdating ? (
                            <input type="text" className="quantity-input" value={quantity} onChange={(event) => setQuantity(event.target.value)} onKeyDown={handleKeyDown} />
                        ) : (
                            <span className="quantity-label">{cartItem.quantity}</span>
                        )}
                    </span>
                    <button className="update-quantity-link link-primary" onClick={() => {
                        if (isUpdating) {
                            updateQuantity();
                        } else {
                            setIsUpdating(true);
                        }
                    }}>
                        Update
                    </button>
                    <button className="delete-quantity-link link-primary" onClick={deleteCartItem}>
                        Delete
                    </button>
                </div>
            </div>
        </>
    );
}
