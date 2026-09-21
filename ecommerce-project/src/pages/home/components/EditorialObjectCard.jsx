import { Link } from 'react-router';
import { formatMoney } from '../../../utils/money.js';
import { normalizeProductImage, handleImageError } from '../../../utils/media.js';

export function EditorialObjectCard({ product, index }) {
  const pricePaise = product.pricePaise ?? product.price_paise ?? product.priceCents ?? 0;
  const category = product.category || (product.keywords?.[0] ? product.keywords[0].toUpperCase() : 'OBJECT');
  const indexStr = String(index + 1).padStart(2, '0');
  const imageUrl = normalizeProductImage(product.image || product.imageUrl, category);

  return (
    <article className="nx-object-card" data-testid="product-container">
      <div data-testid="selected-object-card" style={{ display: 'contents' }}>
      <Link
        to={`/product/${product.id}`}
        className="nx-object-card-link"
        aria-label={`View ${product.name} - ${category} - ${formatMoney(pricePaise)}`}
      >
        <div className="nx-object-image-stage">
          <span className="nx-object-index" aria-hidden="true">{indexStr}</span>
          <img
            className="nx-object-image"
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            onError={(e) => handleImageError(e, category)}
          />
          <div className="nx-object-image-overlay" aria-hidden="true" />
        </div>

        <div className="nx-object-info">
          <div className="nx-object-meta-line">
            <span className="nx-object-category">{category}</span>
            <span className="nx-object-price">{formatMoney(pricePaise)}</span>
          </div>
          <h3 className="nx-object-title">{product.name}</h3>
        </div>
      </Link>
      </div>
    </article>
  );
}
