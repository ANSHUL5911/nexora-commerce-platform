import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { motion } from 'motion/react';
import { Header } from '../../components/Header.jsx';
import { productsApi } from '../../api/products.js';
import { adaptProduct } from '../../api/adapters.js';
import { cartApi } from '../../api/cart.js';
import { addGuestCartItem } from '../../api/guestCart.js';
import { formatMoney } from '../../utils/money.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { SafeImage } from '../../components/ui/SafeImage.jsx';
import { normalizeProductImage } from '../../utils/media.js';
import { springs, useReducedMotion, withReducedMotion } from '../../lib/motion.js';
import { MagneticButton } from '../../components/unlumen-ui/primitives/magnetic-button.tsx';
import ImageMetadataPreview from '../../components/smoothui/ui/smoothui/image-metadata-preview/index.tsx';
import { SEOHead } from '../../components/ui/SEOHead.jsx';
import './ProductDetailPage.css';

export function ProductDetailPage({ cart, loadCart, currentUser, onAuthChange }) {
  const shouldReduceMotion = useReducedMotion();
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [showSpecPreview, setShowSpecPreview] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(false);

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
      if (currentUser === null) {
        addGuestCartItem(product.id, quantity, availableQty, product);
      } else {
        await cartApi.addItem({
          productId: product.id,
          quantity,
        });
      }
      if (loadCart) {
        await loadCart();
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    } catch (err) {
      console.error('Failed to acquire piece:', err);
    } finally {
      setAdding(false);
    }
  };

  const pricePaise = product?.pricePaise ?? product?.price_paise ?? 0;
  const availableQty = product?.available_quantity ?? product?.availableQuantity;

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: product?.name || 'Nexora Object',
        url: window.location.href,
      }).catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setShareFeedback(true);
      setTimeout(() => setShareFeedback(false), 2000);
    }
  };

  const authenticMetadata = {
    by: product?.category || 'General',
    created: product?.createdAt
      ? new Date(product.createdAt).toISOString().split('T')[0]
      : 'Active Record',
    source: product?.id || 'ARCHIVE',
    updated: product?.updatedAt
      ? new Date(product.updatedAt).toISOString().split('T')[0]
      : (product?.createdAt ? new Date(product.createdAt).toISOString().split('T')[0] : 'Active Record'),
  };

  const productSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.image || product.imageUrl,
    description: product.description || 'Precision industrial specimen archived by Nexora.',
    category: product.category,
    offers: {
      '@type': 'Offer',
      price: (pricePaise / 100).toFixed(2),
      priceCurrency: 'INR',
      availability: (product.available_quantity ?? product.availableQuantity ?? 1) > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
    ...(product.rating?.stars ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating.stars,
        reviewCount: product.rating.count || 1,
      },
    } : {}),
  } : null;

  return (
    <>
      <SEOHead
        title={product ? `${product.name} — Technical Specification` : 'Specimen Dossier'}
        description={product?.description || 'Precision industrial specimen archived by Nexora.'}
        canonical={product ? `https://nexora.design/product/${product.id}` : undefined}
        jsonLd={productSchema}
      />
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />

      <main className="pdp-container" id="main-content" tabIndex="-1">
        <nav className="pdp-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Catalog</Link>
          <span aria-hidden="true">/</span>
          <span>{product?.category || 'Collection'}</span>
          <span aria-hidden="true">/</span>
          <span style={{ color: 'var(--color-text-primary)' }}>{product?.name || 'Product'}</span>
        </nav>

        {loading && (
          <div className="pdp-layout" aria-busy="true">
            <Skeleton height="560px" style={{ aspectRatio: '4/5' }} />
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
          <>
            <div className="pdp-layout">
              {/* Left Column: Image Gallery & Spec Preview Trigger */}
              <div className="pdp-media-column">
                <motion.div
                  className="pdp-image-wrap"
                  layoutId={shouldReduceMotion ? undefined : `product-image-${product.id}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={withReducedMotion(springs.specimenMorph, shouldReduceMotion)}
                >
                  <SafeImage
                    className="pdp-image"
                    src={product.image || product.imageUrl}
                    category={product.category}
                    alt={product.name}
                    width={560}
                    height={700}
                    decoding="async"
                  />
                </motion.div>

                <div className="pdp-media-actions">
                  <button
                    type="button"
                    className="pdp-action-toggle-btn"
                    onClick={() => setShowSpecPreview(!showSpecPreview)}
                    aria-expanded={showSpecPreview}
                  >
                    <span className="pdp-toggle-icon">{showSpecPreview ? '−' : '+'}</span>
                    <span>{showSpecPreview ? 'Hide Technical Metadata Inspector' : 'Inspect Technical Specifications & Catalog Metadata'}</span>
                  </button>
                  {shareFeedback && (
                    <span className="pdp-copied-toast" role="status">Link copied to clipboard</span>
                  )}
                </div>
              </div>

              {/* Right Column: Spec Sheet & Purchasing */}
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

                  {/* Real Unlumen MagneticButton for the primary Acquire Piece CTA */}
                  <MagneticButton
                    className="pdp-add-btn"
                    onClick={handleAddToCart}
                    disabled={availableQty === 0 || adding}
                  >
                    {availableQty === 0 ? 'Sold Out' : adding ? 'Acquiring...' : 'Acquire Piece'}
                  </MagneticButton>
                </div>

                {added && (
                  <div className="product-added-notice" role="status" style={{ justifyContent: 'flex-start' }}>
                    <span>✓ Piece acquired. Ready for review or checkout.</span>
                  </div>
                )}

                <div className="pdp-details-list">
                  <div className="pdp-detail-item">
                    <span className="pdp-detail-label">Availability</span>
                    <span className="pdp-detail-value">{availableQty > 0 ? `${availableQty} units available` : 'Out of stock'}</span>
                  </div>
                  <div className="pdp-detail-item">
                    <span className="pdp-detail-label">Shipping</span>
                    <span className="pdp-detail-value">Standard (3–5 business days) or Express</span>
                  </div>
                  <div className="pdp-detail-item">
                    <span className="pdp-detail-label">Product ID</span>
                    <span className="pdp-detail-value pdp-mono-id">{product.id}</span>
                  </div>
                  <div className="pdp-detail-item">
                    <span className="pdp-detail-label">Category Archive</span>
                    <span className="pdp-detail-value">{product.category || 'General'}</span>
                  </div>
                </div>
              </section>
            </div>

            {/* Real SmoothUI ImageMetadataPreview for material provenance inspection */}
            {showSpecPreview && (
              <section className="pdp-curatorial-inspector" aria-label="Technical Metadata Inspector">
                <div className="pdp-inspector-header">
                  <span className="pdp-inspector-eyebrow">Archival Record Data</span>
                  <h3 className="pdp-inspector-title">Specifications &amp; Catalog Metadata</h3>
                  <p className="pdp-inspector-subtitle">
                    Verified system catalog metadata. Tap the indicator below to inspect product record timestamps, category index, and SKU identifier.
                  </p>
                </div>
                <div className="pdp-inspector-stage">
                  <ImageMetadataPreview
                    imageSrc={normalizeProductImage(product.image || product.imageUrl, product.category)}
                    alt={product.name}
                    filename={`${product.id}.nexora`}
                    description={product.name}
                    metadata={authenticMetadata}
                    onShare={handleShare}
                  />
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
