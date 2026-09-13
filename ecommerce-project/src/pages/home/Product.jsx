import { useState } from 'react';
import { formatMoney } from '../../utils/money';
import { cartApi } from '../../api/cart';

export function Product({ product, loadCart }) {
    const [quantity, setQuantity] = useState(1);
    const [added, setAdded] = useState(false);
    const [loading, setLoading] = useState(false);

    const addToCart = async () => {
        try {
            setLoading(true);
            await cartApi.addItem({
                productId: product.id,
                quantity
            });
            if (loadCart) {
                await loadCart();
            }
            setAdded(true);
            setTimeout(() => setAdded(false), 2000);
        } catch (err) {
            console.error('Failed to add item to cart:', err);
        } finally {
            setLoading(false);
        }
    };

    const selectQuantity = (e) => {
        const quantitySelected = Number(e.target.value);
        setQuantity(quantitySelected);
    };

    const ratingStars = product.rating?.stars ?? 4.5;
    const ratingCount = product.rating?.count ?? 0;
    const pricePaise = product.pricePaise ?? product.price_paise ?? product.priceCents ?? 0;

    return (
        <div className="product-container" data-testid="product-container">
            <div className="product-image-container">
                <img className="product-image"
                    data-testid="product-image"
                    src={product.image || product.imageUrl}
                    alt={product.name} />
            </div>

            <div className="product-name limit-text-to-2-lines">
                {product.name}
            </div>

            <div className="product-rating-container">
                <img className="product-rating-stars"
                    data-testid="product-rating-stars-image"
                    src={`images/ratings/rating-${Math.round(ratingStars * 10)}.png`}
                    alt={`${ratingStars} stars`} />
                <div className="product-rating-count link-primary">
                    {ratingCount}
                </div>
            </div>

            <div className="product-price">
                {formatMoney(pricePaise)}
            </div>

            <div className="product-quantity-container">
                <select data-testid="quantity-selector" value={quantity} onChange={selectQuantity}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                </select>
            </div>

            <div className="product-spacer"></div>

            <div className="added-to-cart" style={{ opacity: added ? 1 : 0 }}>
                <img src="images/icons/checkmark.png" alt="Added" />
                Added
            </div>

            <button
                className="add-to-cart-button button-primary"
                data-testid="add-to-cart-button"
                onClick={addToCart}
                disabled={loading}
            >
                {loading ? 'Adding...' : 'Add to Cart'}
            </button>
        </div>
    );
}