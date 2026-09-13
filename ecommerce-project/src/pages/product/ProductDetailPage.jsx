import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { productsApi } from '../../api/products.js';
import { adaptProduct } from '../../api/adapters.js';
import { cartApi } from '../../api/cart.js';
import { formatMoney } from '../../utils/money.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import './ProductDetailPage.css';

export function ProductDetailPage({ cart, loadCart, currentUser, onAuthChange }) {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await productsApi.getProductById(productId);
        const raw = data?.product || data;
        if (isMounted) {
          setProduct(adaptProduct(raw));
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.response?.data?.error?.message || err?.message || 'Product not found');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (productId) {
      fetchProduct();
    }
    return () => { isMounted = false; };
  }, [productId]);

  const handleAddToCart = async () => {
    if (!product) return;
    try {
      setAdding(true);
      await cartApi.addItem({
        productId: product.id,
        quantity,
      });
      if (loadCart) {
        await loadCart();
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    } catch (err) {
      console.error('Failed to add to cart:', err);
    } finally {
      setAdding(false);
    }
  };

  const pricePaise = product?.pricePaise ?? product?.price_paise ?? 0;
  const availableQty = product?.available_quantity ?? product?.availableQuantity;

  return (
    <>
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />

      <main className="pdp-container">
        <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Catalog</Link>
          <span>/</span>
          <span>{product?.category || 'Collection'}</span>
          <span>/</span>
          <span style={{ color: 'var(--color-text-primary)' }}>{product?.name || 'Product'}</span>
        </nav>

        {loading && (
          <div className="pdp-layout" aria-busy="true">
            <Skeleton height="500px" style={{ aspectRatio: '4/5' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Skeleton width="30%" height="16px" />
              <Skeleton width="80%" height="36px" />
              <Skeleton width="25%" height="28px" />
              <Skeleton height="100px" />
              <Skeleton height="48px" />
            </div>
          </div>
        )}

        {error && !loading && (
          <div style={{ textAlign: 'center', padding: 'var(--space-12) 0' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Product Unavailable</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>{error}</p>
            <Link to="/">
              <Button variant="secondary">Return to Catalog</Button>
            </Link>
          </div>
        )}

        {!loading && !error && product && (
          <div className="pdp-layout">
            <div className="pdp-image-wrap">
              <img
                className="pdp-image"
                src={product.image || product.imageUrl}
                alt={product.name}
              />
            </div>

            <section className="pdp-info" aria-labelledby="product-title">
              <div className="pdp-meta-top">
                <span className="product-card-category">{product.category || 'ESSENTIALS'}</span>
                {availableQty !== undefined && (
                  <Badge status={availableQty === 0 ? 'OUT_OF_STOCK' : availableQty <= 5 ? 'LOW_STOCK' : 'IN_STOCK'}>
                    {availableQty === 0 ? 'Sold Out' : availableQty <= 5 ? `Only ${availableQty} left` : 'In Stock'}
                  </Badge>
                )}
              </div>

              <h1 id="product-title" className="pdp-title">{product.name}</h1>

              <div className="pdp-price">{formatMoney(pricePaise)}</div>

              <p className="pdp-description">
                {product.description || 'Crafted with premium materials and disciplined attention to architectural proportion.'}
              </p>

              <div className="pdp-actions">
                <div className="pdp-quantity-wrap">
                  <select
                    aria-label="Select quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    disabled={availableQty === 0}
                    style={{ width: '100%', height: '48px' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="primary"
                  className="pdp-add-btn"
                  onClick={handleAddToCart}
                  loading={adding}
                  disabled={availableQty === 0}
                >
                  {availableQty === 0 ? 'Sold Out' : 'Add to Cart'}
                </Button>
              </div>

              {added && (
                <div className="product-added-notice" role="status" style={{ justifyContent: 'flex-start' }}>
                  <span>✓ Added to cart. Ready for review or checkout.</span>
                </div>
              )}

              <div className="pdp-details-list">
                <div className="pdp-detail-item">
                  <span className="pdp-detail-label">Availability</span>
                  <span className="pdp-detail-value">{availableQty > 0 ? 'Ready to ship' : 'Backorder unavailable'}</span>
                </div>
                <div className="pdp-detail-item">
                  <span className="pdp-detail-label">Shipping</span>
                  <span className="pdp-detail-value">Standard (3–5 business days) or Express</span>
                </div>
                <div className="pdp-detail-item">
                  <span className="pdp-detail-label">Product ID</span>
                  <span className="pdp-detail-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{product.id}</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
