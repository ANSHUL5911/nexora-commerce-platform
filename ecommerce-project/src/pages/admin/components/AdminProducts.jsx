import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../../api/admin.js';
import { formatMoney } from '../../../utils/money.js';
import { Badge } from '../../../components/ui/Badge.jsx';
import { ProductFormModal } from './ProductFormModal.jsx';
import { ProductDeleteModal } from './ProductDeleteModal.jsx';

/**
 * AdminProducts Component (Phase 07.26B)
 * Administrative catalog management view supporting filterable product listings,
 * creation of new products with initial stock, editing of catalog attributes,
 * and confirmation-gated soft deletion.
 */
export function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(null);

  const fetchProducts = useCallback(
    async (page = 1, status = statusFilter, search = searchQuery) => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page,
          limit: 10,
          status,
        };
        if (search.trim()) params.search = search.trim();

        const response = await adminApi.listProducts(params);
        setProducts(response?.data || []);
        setPagination(response?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      } catch (err) {
        console.error('Failed to list products:', err);
        setError(err.message || 'Unable to retrieve catalog products.');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, searchQuery]
  );

  useEffect(() => {
    fetchProducts(1, statusFilter, searchQuery);
  }, [fetchProducts, statusFilter, searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProducts(1, statusFilter, searchQuery);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchProducts(newPage, statusFilter, searchQuery);
    }
  };

  const handleProductSaved = () => {
    fetchProducts(pagination.page, statusFilter, searchQuery);
  };

  const handleProductDeleted = () => {
    fetchProducts(pagination.page, statusFilter, searchQuery);
  };

  return (
    <div className="nx-admin-products-view">
      <div className="nx-admin-view-header">
        <div>
          <h2 className="nx-admin-view-title">Catalog Management</h2>
          <p className="nx-admin-view-subtitle">Manage products, pricing, and catalog presentation</p>
        </div>
        <div className="nx-admin-header-actions">
          <span className="nx-admin-total-indicator">
            {pagination.total} {pagination.total === 1 ? 'Product' : 'Products'}
          </span>
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              setEditingProduct(null);
              setIsFormOpen(true);
            }}
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Toolbar: Search and Status Filter */}
      <div className="nx-admin-toolbar">
        <form onSubmit={handleSearchSubmit} className="nx-admin-search-form">
          <input
            type="search"
            className="nx-admin-search-input"
            placeholder="Search by product name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search products"
          />
          <button type="submit" className="button-secondary">
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              className="button-tertiary"
              onClick={() => {
                setSearchQuery('');
                fetchProducts(1, statusFilter, '');
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="nx-admin-filter-group">
          <label htmlFor="product-status-filter" className="nx-admin-filter-label">
            Filter Status:
          </label>
          <select
            id="product-status-filter"
            className="nx-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Products</option>
            <option value="active">Active Only</option>
            <option value="deleted">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="nx-admin-loading" role="status">
          <div className="nx-admin-spinner" aria-hidden="true" />
          <p>Loading catalog products...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="nx-admin-error-box" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => fetchProducts(pagination.page, statusFilter, searchQuery)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Products Table */}
      {!loading && !error && (
        <>
          {products.length === 0 ? (
            <div className="nx-admin-empty-box">
              <p>No products matched your filters.</p>
            </div>
          ) : (
            <div className="nx-admin-table-wrap">
              <table className="nx-admin-table" aria-label="Catalog Products">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Reserved</th>
                    <th scope="col">Available</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="nx-text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const pricePaise = p.price_paise ?? p.pricePaise ?? 0;
                    const stock = p.stock_quantity ?? p.stockQuantity ?? 0;
                    const reserved = p.reserved_quantity ?? p.reservedQuantity ?? 0;
                    const available = p.available_quantity ?? p.availableQuantity ?? 0;
                    const isDeleted = Boolean(p.is_deleted ?? p.isDeleted);

                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="nx-admin-product-cell">
                            <img
                              src={p.image_url || p.imageUrl}
                              alt=""
                              className="nx-admin-thumb"
                              loading="lazy"
                            />
                            <div className="nx-admin-cell-stacked">
                              <span className="nx-admin-primary-text">{p.name}</span>
                              <code className="nx-admin-id-tag" title={p.id}>
                                {p.id.slice(0, 8)}&hellip;
                              </code>
                            </div>
                          </div>
                        </td>
                        <td>{p.category}</td>
                        <td>
                          <span className="nx-admin-mono-number">{formatMoney(pricePaise)}</span>
                        </td>
                        <td className="nx-admin-mono-number">{stock}</td>
                        <td className="nx-admin-mono-number">{reserved}</td>
                        <td>
                          <span
                            className={`nx-admin-mono-number ${
                              available === 0 ? 'is-danger' : available <= 5 ? 'is-warning' : 'is-success'
                            }`}
                          >
                            {available}
                          </span>
                        </td>
                        <td>
                          <Badge status={isDeleted ? 'CANCELLED' : 'ACTIVE'}>
                            {isDeleted ? 'Deactivated' : 'Active'}
                          </Badge>
                        </td>
                        <td>
                          <span className="nx-admin-mono-date">
                            {new Date(p.created_at || p.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="nx-text-right">
                          <div className="nx-admin-action-row">
                            <button
                              type="button"
                              className="nx-admin-table-btn"
                              onClick={() => {
                                setEditingProduct(p);
                                setIsFormOpen(true);
                              }}
                              aria-label={`Edit product ${p.name}`}
                            >
                              Edit
                            </button>
                            {!isDeleted && (
                              <button
                                type="button"
                                className="nx-admin-table-btn-danger"
                                onClick={() => setDeletingProduct(p)}
                                aria-label={`Deactivate product ${p.name}`}
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="nx-admin-pagination" role="navigation" aria-label="Products pagination">
              <button
                type="button"
                className="button-secondary"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                &larr; Previous
              </button>
              <span className="nx-admin-page-indicator">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}

      {/* Form Modal (Create / Edit) */}
      <ProductFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        onProductSaved={handleProductSaved}
      />

      {/* Soft Delete Confirmation Modal */}
      <ProductDeleteModal
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        product={deletingProduct}
        onProductDeleted={handleProductDeleted}
      />
    </div>
  );
}

export default AdminProducts;
