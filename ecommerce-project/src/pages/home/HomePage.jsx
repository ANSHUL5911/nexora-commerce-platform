import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { productsApi } from '../../api/products.js';
import { adaptProduct } from '../../api/adapters.js';
import { bulkCacheProductMetadata } from '../../api/guestCart.js';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { ProductsGrid } from './ProductsGrid.jsx';
import './HomePage.css';

const CATEGORIES = ['ALL', 'APPAREL', 'LIVING', 'FOOTWEAR', 'ACCESSORIES'];

const CATEGORY_MAP = {
  ALL: undefined,
  APPAREL: 'Apparel',
  LIVING: 'Living',
  FOOTWEAR: 'Footwear',
  ACCESSORIES: 'Accessories',
};

export function HomePage({ cart, loadCart, currentUser, onAuthChange }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') || undefined;
  const requestIdRef = useRef(0);

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
      <Header
        cart={cart}
        currentUser={currentUser}
        onAuthChange={onAuthChange}
      />

      <main className="home-page" id="main-content">
        {/* Editorial Brand Intro Hero */}
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero-eyebrow">Autumn / Winter Edition</div>
          <h1 id="hero-title" className="home-hero-title">
            Architectural essentials, engineered for enduring utility.
          </h1>
          <p className="home-hero-subtitle">
            A restrained collection of everyday objects, footwear, and apparel crafted with disciplined material standards and uncompromising craft.
          </p>
        </section>

        {/* Editorial Category Navigation (No pill containers) */}
        <nav className="home-category-nav" aria-label="Product categories">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`home-category-tab ${selectedCategory === category ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
              aria-current={selectedCategory === category ? 'page' : undefined}
            >
              {category}
            </button>
          ))}
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
            title="No products found"
            description={search ? `No items match your search for "${search}". Try checking for spelling errors or browsing all categories.` : 'No products are currently available in this category.'}
            actionLabel="View All Products"
            onAction={() => setSelectedCategory('ALL')}
          />
        )}

        {/* Products Grid */}
        {!loading && !error && products.length > 0 && (
          <ProductsGrid products={products} loadCart={loadCart} currentUser={currentUser} />
        )}
      </main>
    </>
  );
}
