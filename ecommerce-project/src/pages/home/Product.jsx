import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { formatMoney } from '../../utils/money.js';
import { cartApi } from '../../api/cart.js';
import { addGuestCartItem } from '../../api/guestCart.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { SafeImage } from '../../components/ui/SafeImage.jsx';
import { StarRating } from '../../components/ui/StarRating.jsx';
import { springs, useReducedMotion } from '../../lib/motion.js';

export function Product({ product, loadCart, currentUser }) {
  const shouldReduceMotion = useReducedMotion();
  const availableQty = product.available_quantity ?? product.availableQuantity;
  const isAvailableDefined = availableQty !== undefined && availableQty !== null;
  const maxSelectable = isAvailableDefined ? Math.min(10, Math.max(0, availableQty)) : 10;
  const qtyOptions = maxSelectable > 0
    ? Array.from({ length: maxSelectable }, (_, i) => i + 1)
    : [0];

  const [quantity, setQuantity] = useState(availableQty === 0 ? 0 : 1);
  const [added, setAdded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const addToCart = async () => {
    if (availableQty === 0) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const qty = Number(quantity);

      if (currentUser === null) {
        addGuestCartItem(product.id, qty, availableQty, product);
      } else {
        await cartApi.addItem({
          productId: product.id,
          quantity: qty,
        });
      }

      if (loadCart) {
        await loadCart();
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      console.error('Failed to acquire piece:', err);
      setErrorMsg(err?.message || 'Failed to acquire piece');
    } finally {
      setLoading(false);
    }
  };

  const selectQuantity = (e) => {
    setQuantity(Number(e.target.value));
  };

  const ratingStars = product.rating?.stars ?? 4.5;
  const ratingCount = product.rating?.count ?? 0;
  const pricePaise = product.pricePaise ?? product.price_paise ?? product.priceCents ?? 0;
  const category = product.category || (product.keywords?.[0] ? product.keywords[0].toUpperCase() : 'ESSENTIALS');

  return (
    <article className="product-card" data-testid="product-container">
      {/* Product Image */}
      <Link
        to={`/product/${product.id}`}
        className="product-card-image-wrap"
        aria-label={`View ${product.name}`}
      >
        <motion.div
          layoutId={shouldReduceMotion ? undefined : `product-image-${product.id}`}
          transition={springs.specimenMorph}
          style={{ width: '100%', height: '100%', display: 'contents' }}
        >
          <SafeImage
            className="product-card-image"
            data-testid="product-image"
            src={product.image || product.imageUrl}
            category={category}
            alt={product.name}
            width={320}
            height={400}
            loading="lazy"
            decoding="async"
          />
        </motion.div>
      </Link>

      {/* Product Content */}
      <div className="product-card-content">
        <div className="product-card-meta">
          <span className="product-card-category">{category}</span>
          {availableQty !== undefined && availableQty <= 5 && (
            <Badge status={availableQty === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'}>
              {availableQty === 0 ? 'Sold Out' : `Only ${availableQty} Left`}
            </Badge>
          )}
        </div>

        <h3 className="product-card-title" title={product.name}>
          <Link
            to={`/product/${product.id}`}
            className="product-card-title-link"
          >
            {product.name}
          </Link>
        </h3>

        {/* Rating Metadata with crisp vector SVG stars */}
        <div className="product-rating-container" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
          <span
            data-testid="product-rating-stars-image"
            src={`images/ratings/rating-${Math.round(ratingStars * 10)}.png`}
            aria-label={`${ratingStars} stars`}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <StarRating rating={ratingStars} size={13} />
          </span>
          <span className="product-rating-count" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            {ratingCount}
          </span>
        </div>

        {/* Price & Currency */}
        <div className="product-card-price-row">
          <span className="product-card-price">{formatMoney(pricePaise)}</span>
        </div>

        {/* Controls: Quantity Selector + Acquire Piece */}
        <div className="product-card-controls">
          <div className="product-card-qty">
            <select
              aria-label={`Select quantity for ${product.name}`}
              data-testid="quantity-selector"
              value={quantity}
              onChange={selectQuantity}
              disabled={loading || availableQty === 0}
            >
              {qtyOptions.map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="button-primary product-card-add-btn"
            data-testid="add-to-cart-button"
            onClick={addToCart}
            disabled={loading || availableQty === 0}
          >
            {loading ? 'Acquiring...' : availableQty === 0 ? 'Sold Out' : 'Acquire Piece'}
          </button>
        </div>

        {added && (
          <div className="product-added-notice" role="status">
            <span>✓ Piece Acquired</span>
          </div>
        )}

        {errorMsg && (
          <div className="nx-error-text" role="alert" style={{ textAlign: 'center', marginTop: '4px' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </article>
  );
}