import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { Footer } from '../../components/Footer.jsx';
import { productsApi } from '../../api/products.js';
import { adaptProduct } from '../../api/adapters.js';
import { bulkCacheProductMetadata } from '../../api/guestCart.js';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { EditorialObjectCard } from './components/EditorialObjectCard.jsx';
import { normalizeProductImage } from '../../utils/media.js';

// Real Library Components (Unlumen UI & SmoothUI)
import { MagneticButton } from '../../components/unlumen-ui/primitives/magnetic-button';
import { TextReveal } from '../../components/unlumen-ui/primitives/text-reveal';
import AnimatedTabs from '../../components/smoothui/ui/smoothui/animated-tabs';
import ImageMetadataPreview from '../../components/smoothui/ui/smoothui/image-metadata-preview';

import './HomePage.css';

const FEATURED_CATEGORIES = [
  {
    name: 'Apparel',
    slug: 'APPAREL',
    index: '01',
    description: 'Disciplined silhouettes, organic heavy cottons, and architectural tailoring.',
  },
  {
    name: 'Living',
    slug: 'LIVING',
    index: '02',
    description: 'Enduring everyday objects engineered for intentional, mindful environments.',
  },
  {
    name: 'Footwear',
    slug: 'FOOTWEAR',
    index: '03',
    description: 'Resilient foundations, ergonomic contours, and uncompromising material craft.',
  },
  {
    name: 'Accessories',
    slug: 'ACCESSORIES',
    index: '04',
    description: 'Minimalist carry, precision hardware, and structured leather essentials.',
  },
];

const CATEGORY_TABS = [
  { id: 'ALL', label: 'All Disciplines' },
  { id: 'APPAREL', label: '01 Apparel' },
  { id: 'LIVING', label: '02 Living' },
  { id: 'FOOTWEAR', label: '03 Footwear' },
  { id: 'ACCESSORIES', label: '04 Accessories' },
];

export function HomePage({ cart, loadCart, currentUser, onAuthChange }) {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState('ALL');
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);

  const fetchFeaturedProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await productsApi.listProducts({ limit: 6 });
      const rawList = Array.isArray(data) ? data : (data?.products || data?.data?.products || []);
      const curatedSubset = rawList.slice(0, 6);
      bulkCacheProductMetadata(curatedSubset);
      setFeaturedProducts(curatedSubset.map(adaptProduct));
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.message || 'Unable to load featured collection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeaturedProducts();
  }, [fetchFeaturedProducts]);

  const highlightProduct = featuredProducts[0] || null;

  // Filtered preview based on AnimatedTabs selection
  const filteredProducts = activeCategoryTab === 'ALL'
    ? featuredProducts
    : featuredProducts.filter((p) => {
        const cat = (p.category || (p.keywords?.[0] || '')).toUpperCase();
        return cat.includes(activeCategoryTab);
      });

  const displayProducts = filteredProducts.length > 0 ? filteredProducts : featuredProducts;

  return (
    <div className="nx-home-root">
      {/* 01 HEADER */}
      <Header
        cart={cart}
        loadCart={loadCart}
        currentUser={currentUser}
        onAuthChange={onAuthChange}
      />

      <main className="home-page" id="main-content">
        {/* 02 HERO SECTION */}
        <section className="nx-home-hero" aria-labelledby="hero-headline">
          <div className="nx-home-hero-container">
            <div className="nx-hero-left">
              <div className="nx-home-hero-eyebrow">Autumn / Winter Edition</div>
              <h1 id="hero-headline" className="nx-home-hero-title">
                Architectural essentials, engineered for enduring utility.
              </h1>
              <p className="nx-home-hero-subtitle">
                A restrained collection of everyday objects, footwear, and apparel crafted with disciplined material standards and uncompromising craft.
              </p>
              <div className="nx-home-hero-actions">
                {/* Real Library Component: Unlumen Magnetic Button */}
                <MagneticButton
                  asChild
                  radius={120}
                  strength={0.35}
                  className="nx-cta-primary nx-hero-magnetic-btn"
                >
                  <Link to="/catalog" aria-label="Explore the collection in the catalog">
                    <span>Explore Collection</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </MagneticButton>

                <a href="#editorial-narrative" className="nx-cta-secondary">
                  Brand Editorial
                </a>
              </div>
            </div>

            <div className="nx-hero-right" aria-hidden="true">
              <div className="nx-hero-visual-frame">
                <img
                  src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80"
                  alt="Editorial campaign still"
                  className="nx-hero-visual-img"
                  loading="eager"
                />
                <div className="nx-hero-tag">
                  <span className="nx-hero-tag-index">01</span>
                  <span className="nx-hero-tag-text">SERIES 01 // PERMANENCE</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 03 COLLECTION INTRODUCTION */}
        <section className="nx-collection-intro" aria-label="Collection Statement">
          <div className="nx-intro-divider" />
          <div className="nx-intro-grid">
            <div className="nx-intro-meta">
              <span className="nx-mono-eyebrow">The Collection</span>
              <span className="nx-intro-serial">EDITION 2026</span>
            </div>
            <div className="nx-intro-statement">
              <p className="nx-intro-large-quote">
                Objects designed around material, proportion and everyday utility.
              </p>
              <div className="nx-intro-spec-row">
                <div className="nx-spec-pill">Reductionist Silhouette</div>
                <div className="nx-spec-pill">Monochrome Restraint</div>
                <div className="nx-spec-pill">Standard A Verification</div>
              </div>
            </div>
          </div>
        </section>

        {/* 04 EDITORIAL FEATURE (Material Before Ornament) */}
        <section id="editorial-narrative" className="nx-editorial-showcase" aria-labelledby="showcase-title">
          <div className="nx-showcase-container">
            <div className="nx-showcase-content">
              <div className="nx-showcase-label">Collection 01</div>
              
              {/* Real Library Component: Unlumen Text Reveal */}
              <TextReveal
                text="Material before ornament."
                as="h2"
                className="nx-showcase-title"
                staggerDelay={0.05}
                duration={0.4}
              />

              <p className="nx-showcase-description">
                Every garment and physical artifact is formulated through reduction. We eliminate decorative excess to emphasize silhouette, tactile integrity, and engineered durability.
              </p>

              <div className="nx-showcase-meta-grid">
                <div className="nx-meta-item">
                  <div className="nx-meta-item-label">Philosophy</div>
                  <div className="nx-meta-item-value">Architectural</div>
                </div>
                <div className="nx-meta-item">
                  <div className="nx-meta-item-label">Standard</div>
                  <div className="nx-meta-item-value">Uncompromising</div>
                </div>
                <div className="nx-meta-item">
                  <div className="nx-meta-item-label">Lifetime</div>
                  <div className="nx-meta-item-value">Enduring</div>
                </div>
              </div>

              <div className="nx-showcase-actions">
                <Link to="/catalog" className="nx-cta-primary" aria-label="Explore collection">
                  Explore Collection <span aria-hidden="true">→</span>
                </Link>

                {highlightProduct && (
                  <button
                    type="button"
                    className="nx-cta-secondary"
                    onClick={() => setMetadataModalOpen(true)}
                    aria-label="Inspect architectural provenance preview"
                  >
                    Inspect Provenance ↗
                  </button>
                )}
              </div>
            </div>

            <div className="nx-showcase-aside">
              <div className="nx-aside-card">
                <div className="nx-aside-header">
                  <span className="nx-aside-series">Series 01 — Edition Catalog</span>
                  <span className="nx-aside-badge">Verified</span>
                </div>
                <h3 className="nx-aside-title">Curated Everyday Objects</h3>
                <p className="nx-aside-body">
                  Explore the comprehensive catalog featuring garments, accessories, and objects designed with singular precision.
                </p>
                <Link to="/catalog" className="nx-aside-btn" aria-label="Shop catalog collection">
                  <span>Shop Collection</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 05 SHOP BY CATEGORY (Editorial Taxonomy + Real SmoothUI AnimatedTabs) */}
        <section className="nx-home-section" aria-labelledby="category-section-title">
          <div className="nx-section-header">
            <div>
              <div className="nx-section-eyebrow">Taxonomy</div>
              <h2 id="category-section-title" className="nx-section-title">
                Shop by Category
              </h2>
            </div>
            <Link to="/catalog" className="nx-section-link">
              Browse All Categories <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Real Library Component: SmoothUI Animated Tabs */}
          <div className="nx-animated-tabs-bar" role="region" aria-label="Category discipline selector">
            <AnimatedTabs
              tabs={CATEGORY_TABS}
              activeTab={activeCategoryTab}
              onChange={(tabId) => setActiveCategoryTab(tabId)}
              variant="underline"
              className="nx-category-smooth-tabs"
            />
          </div>

          <div className="nx-category-grid">
            {FEATURED_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/catalog?category=${cat.slug}`}
                className={`nx-category-card ${activeCategoryTab === cat.slug ? 'nx-category-card-active' : ''}`}
                aria-label={`Shop ${cat.name} category`}
              >
                <div className="nx-category-index">{cat.index}</div>
                <div className="nx-category-card-content">
                  <h3 className="nx-category-name">{cat.name}</h3>
                  <p className="nx-category-desc">{cat.description}</p>
                </div>
                <div className="nx-category-card-footer">
                  <span>Explore</span>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 06 SELECTED OBJECTS (3-col Desktop, 2-col Tablet, 1-col Mobile, Zero Overflow) */}
        <section className="nx-home-section" aria-labelledby="products-section-title">
          <div className="nx-section-header">
            <div>
              <div className="nx-section-eyebrow">Curated Selection</div>
              <h2 id="products-section-title" className="nx-section-title">
                Selected Objects
              </h2>
              <p className="nx-section-subtitle">A considered selection from the current collection.</p>
            </div>
            <Link to="/catalog" className="nx-section-link">
              View Catalog <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Skeletons on loading */}
          {loading && (
            <div className="nx-selected-objects-grid" aria-busy="true" aria-label="Loading selected objects">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="nx-object-skeleton-card">
                  <Skeleton height="360px" style={{ marginBottom: '16px', borderRadius: 'var(--radius-xs)' }} />
                  <Skeleton width="40%" height="12px" style={{ marginBottom: '8px' }} />
                  <Skeleton width="85%" height="18px" style={{ marginBottom: '8px' }} />
                  <Skeleton width="30%" height="16px" />
                </div>
              ))}
            </div>
          )}

          {/* Graceful Error Notice with Retry */}
          {error && !loading && (
            <div role="alert" className="nx-error-card">
              <p className="nx-error-title">Unable to load selected objects</p>
              <p className="nx-error-message">{error}</p>
              <button
                type="button"
                className="button-secondary"
                onClick={fetchFeaturedProducts}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && displayProducts.length === 0 && (
            <div className="nx-empty-card">
              <p>No products currently available in this edition.</p>
              <Link to="/catalog" className="nx-cta-secondary" style={{ marginTop: 'var(--space-4)' }}>
                View All Products
              </Link>
            </div>
          )}

          {/* Selected Objects Grid */}
          {!loading && !error && displayProducts.length > 0 && (
            <>
              <div className="nx-selected-objects-grid">
                {displayProducts.map((product, index) => (
                  <EditorialObjectCard
                    key={product.id}
                    product={product}
                    index={index}
                  />
                ))}
              </div>

              <div className="nx-selected-products-footer">
                <Link to="/catalog" className="nx-cta-primary" aria-label="View all products in catalog">
                  View All Products
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </>
          )}
        </section>

        {/* Real Library Component: SmoothUI Image Metadata Preview Modal */}
        {metadataModalOpen && highlightProduct && (
          <div
            className="nx-metadata-backdrop"
            onClick={() => setMetadataModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Product Provenance Metadata"
          >
            <div className="nx-metadata-container" onClick={(e) => e.stopPropagation()}>
              <div className="nx-metadata-header-bar">
                <span className="nx-metadata-title">ARCHITECTURAL PROVENANCE</span>
                <button
                  type="button"
                  className="nx-metadata-close-trigger"
                  onClick={() => setMetadataModalOpen(false)}
                  aria-label="Close provenance modal"
                >
                  ✕ Close
                </button>
              </div>

              <div className="nx-metadata-content-wrap">
                <ImageMetadataPreview
                  imageSrc={normalizeProductImage(highlightProduct.image || highlightProduct.imageUrl, highlightProduct.category)}
                  alt={highlightProduct.name}
                  filename={`${highlightProduct.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`}
                  description={highlightProduct.description || 'Crafted with disciplined material standards and architectural proportion.'}
                  metadata={{
                    by: 'Nexora Atelier',
                    created: 'Edition 2026',
                    source: highlightProduct.category || 'Curated Archive',
                    updated: 'Verified Grade A',
                  }}
                  onShare={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(window.location.href);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 07 BRAND PHILOSOPHY */}
        <section className="nx-philosophy-section" aria-labelledby="philosophy-title">
          <div className="nx-philosophy-container">
            <div className="nx-philosophy-eyebrow">Nexora Philosophy</div>
            <blockquote id="philosophy-title" className="nx-philosophy-quote">
              &ldquo;Design is not an embellishment; it is the discipline of stripping away until only purpose remains.&rdquo;
            </blockquote>
            
            <div className="nx-philosophy-pillars">
              <div className="nx-pillar">
                <span className="nx-pillar-num">01</span>
                <h4 className="nx-pillar-title">Tactile Permanence</h4>
                <p className="nx-pillar-text">
                  High-density organic weaves, full-grain vegetable tanned leathers, and precision-milled hardware engineered to gain character over decades.
                </p>
              </div>

              <div className="nx-pillar">
                <span className="nx-pillar-num">02</span>
                <h4 className="nx-pillar-title">Proportional Restraint</h4>
                <p className="nx-pillar-text">
                  Every curve and seam is governed by architectural harmony. Free from ephemeral trend noise, loud monograms, or superficial decoration.
                </p>
              </div>

              <div className="nx-pillar">
                <span className="nx-pillar-num">03</span>
                <h4 className="nx-pillar-title">Ethical Provenance</h4>
                <p className="nx-pillar-text">
                  Transparent supply chains, audited artisan workshops, and closed-loop material cycles meeting Standard Grade A certification.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 08 FOOTER */}
      <Footer />
    </div>
  );
}

export default HomePage;
