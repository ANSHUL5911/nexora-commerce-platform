import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { productsApi } from '../../api/products.js';
import { adaptProduct } from '../../api/adapters.js';
import { bulkCacheProductMetadata } from '../../api/guestCart.js';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { ProductsGrid } from '../home/ProductsGrid.jsx';
import AnimatedTabs from '../../components/smoothui/ui/smoothui/animated-tabs/index.tsx';
import { TextReveal } from '../../components/unlumen-ui/primitives/text-reveal.tsx';
import { SEOHead } from '../../components/ui/SEOHead.jsx';
import './CatalogPage.css';
import '../home/HomePage.css';

const CATEGORIES = ['ALL', 'APPAREL', 'LIVING', 'FOOTWEAR', 'ACCESSORIES'];

const CATEGORY_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'APPAREL', label: 'Apparel' },
  { id: 'LIVING', label: 'Living' },
  { id: 'FOOTWEAR', label: 'Footwear' },
  { id: 'ACCESSORIES', label: 'Accessories' },
];

const CATEGORY_MAP = {
  ALL: undefined,
  APPAREL: 'Apparel',
  LIVING: 'Living',
  FOOTWEAR: 'Footwear',
  ACCESSORIES: 'Accessories',
};

export function CatalogPage({ cart, loadCart, currentUser, onAuthChange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') || undefined;
  const rawCatParam = searchParams.get('category')?.toUpperCase();
  const initialCategory = rawCatParam && CATEGORIES.includes(rawCatParam) ? rawCatParam : 'ALL';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const requestIdRef = useRef(0);

  // Sync selectedCategory when category URL searchParam changes (e.g., direct navigation, back/forward)
  useEffect(() => {
    const currentCatParam = searchParams.get('category')?.toUpperCase();
    if (currentCatParam && CATEGORIES.includes(currentCatParam)) {
      setSelectedCategory(currentCatParam);
    } else if (!currentCatParam) {
      setSelectedCategory('ALL');
    }
  }, [searchParams]);

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (category === 'ALL') {
        next.delete('category');
      } else {
        next.set('category', category);
      }
      return next;
    });
  };

  const fetchProducts = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const canonicalCategory = CATEGORY_MAP[selectedCategory];
      const data = await productsApi.listProducts({
        search,
        category: canonicalCategory,
      });
      // Stale-response guard: ignore response if a newer request was dispatched
      if (currentRequestId !== requestIdRef.current) return;
      const rawList = Array.isArray(data) ? data : (data?.products || data?.data?.products || []);
      bulkCacheProductMetadata(rawList);
      setProducts(rawList.map(adaptProduct));
    } catch (err) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load catalog products');
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    fetchProducts();
    return () => {
      // Invalidate pending response handling on unmount
      requestIdRef.current += 1;
    };
  }, [fetchProducts]);

  return (
    <>
      <SEOHead
        title="The Archive Registry — Product Catalog"
        description="Explore precision-crafted instruments, mechanical hardware, and utilitarian artifacts engineered for enduring performance."
        canonical="https://nexora.design/catalog"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: 'https://nexora.design/',
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Catalog',
              item: 'https://nexora.design/catalog',
            },
          ],
        }}
      />
      <Header
        cart={cart}
        currentUser={currentUser}
        onAuthChange={onAuthChange}
      />

      <main className="catalog-page" id="main-content">
        {/* Catalog Section Header */}
        <section className="catalog-hero" aria-labelledby="catalog-title">
          <div className="catalog-hero-meta-bar">
            <span className="catalog-hero-eyebrow">Collection Index</span>
            <span className="catalog-hero-count">
              {loading ? 'Scanning Archive...' : `${products.length} Objects Indexed`}
            </span>
          </div>
          <h1 id="catalog-title" className="catalog-hero-title">
            Product Catalog
          </h1>
          <TextReveal
            text="Engineered essentials, precision accessories, and disciplined apparel built for enduring utility."
            as="p"
            className="catalog-hero-subtitle"
          />
        </section>

        {/* Editorial Category Navigation (SmoothUI AnimatedTabs) */}
        <nav className="catalog-category-nav" aria-label="Product categories">
          <AnimatedTabs
            tabs={CATEGORY_TABS}
            activeTab={selectedCategory}
            onChange={handleCategorySelect}
            variant="underline"
            className="catalog-animated-tabs"
          />
        </nav>

        {/* Loading Skeletons */}
        {loading && (
          <div className="products-grid" aria-busy="true" aria-label="Loading products">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="product-card" style={{ padding: 'var(--space-4)' }}>
                <Skeleton height="260px" style={{ marginBottom: '12px' }} />
                <Skeleton width="40%" height="12px" style={{ marginBottom: '8px' }} />
                <Skeleton width="85%" height="16px" style={{ marginBottom: '12px' }} />
                <Skeleton width="30%" height="18px" />
              </div>
            ))}
          </div>
        )}

        {/* Error Callout */}
        {error && !loading && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-6)',
              backgroundColor: 'var(--color-status-error-bg)',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-status-error)',
              textAlign: 'center',
              margin: 'var(--space-8) 0',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Unable to load collection</p>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '16px' }}>{error}</p>
            <button
              type="button"
              className="button-secondary"
              onClick={fetchProducts}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && products.length === 0 && (
          <EmptyState
            preset="search"
            title="No products found"
            description={search ? `No archival items indexed under "${search}". The collection maintains strict curation; inspect adjacent disciplines or return to the complete index.` : 'No archival pieces are currently cataloged in this discipline.'}
            actionLabel="View All Products"
            onAction={() => handleCategorySelect('ALL')}
          />
        )}

        {/* Products Grid */}
        {!loading && !error && products.length > 0 && (
          <section aria-labelledby="catalog-grid-heading">
            <h2 id="catalog-grid-heading" className="sr-only">Catalog Inventory</h2>
            <ProductsGrid products={products} loadCart={loadCart} currentUser={currentUser} />
          </section>
        )}
      </main>
    </>
  );
}

export default CatalogPage;
