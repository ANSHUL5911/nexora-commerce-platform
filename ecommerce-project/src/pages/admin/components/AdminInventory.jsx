import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../../api/admin.js';
import { Badge } from '../../../components/ui/Badge.jsx';

/**
 * AdminInventory Component (Phase 07.26B)
 * Administrative inventory monitoring console.
 * Strictly adheres to backend transactional inventory: available = stock - reserved.
 */
export function AdminInventory({ onNavigateToOrders }) {
  const [inventory, setInventory] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInventory = useCallback(
    async (page = 1, isLowStock = lowStockOnly, search = searchQuery) => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page,
          limit: 10,
        };
        if (isLowStock) params.lowStockOnly = true;
        if (search.trim()) params.search = search.trim();

        const response = await adminApi.getInventory(params);
        setInventory(response?.data || []);
        setPagination(response?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      } catch (err) {
        console.error('Failed to load inventory:', err);
        setError(err.message || 'Unable to retrieve inventory overview.');
      } finally {
        setLoading(false);
      }
    },
    [lowStockOnly, searchQuery]
  );

  useEffect(() => {
    fetchInventory(1, lowStockOnly, searchQuery);
  }, [fetchInventory, lowStockOnly, searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchInventory(1, lowStockOnly, searchQuery);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchInventory(newPage, lowStockOnly, searchQuery);
    }
  };

  return (
    <div className="nx-admin-inventory-view">
      <div className="nx-admin-view-header">
        <div>
          <h2 className="nx-admin-view-title">Inventory Operations</h2>
          <p className="nx-admin-view-subtitle">
            Transactional inventory state: <code>available = stock &minus; reserved</code>
          </p>
        </div>
        <span className="nx-admin-total-indicator">
          {pagination.total} {pagination.total === 1 ? 'Product Tracked' : 'Products Tracked'}
        </span>
      </div>

      {/* Operational Restock Notice */}
      <div className="nx-admin-callout is-info">
        <span>
          <strong>Inventory Restocking:</strong> Physical stock increments occur through verified operational flows
          (such as restocking items from refunded orders).
        </span>
        {onNavigateToOrders && (
          <button
            type="button"
            className="nx-admin-inline-link"
            onClick={() => onNavigateToOrders('orders', '/admin/orders')}
          >
            Review eligible orders &rarr;
          </button>
        )}
      </div>

      {/* Toolbar: Filters, Low-Stock Toggle, Search */}
      <div className="nx-admin-toolbar">
        <form onSubmit={handleSearchSubmit} className="nx-admin-search-form">
          <input
            type="search"
            className="nx-admin-search-input"
            placeholder="Search by product name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search inventory"
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
                fetchInventory(1, lowStockOnly, '');
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="nx-admin-filter-group">
          <label className="nx-admin-checkbox-label">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
              className="nx-admin-checkbox"
            />
            <span>Low Stock Attention Only (&le; 5)</span>
          </label>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="nx-admin-loading" role="status">
          <div className="nx-admin-spinner" aria-hidden="true" />
          <p>Loading inventory metrics...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="nx-admin-error-box" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => fetchInventory(pagination.page, lowStockOnly, searchQuery)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Inventory Table */}
      {!loading && !error && (
        <>
          {inventory.length === 0 ? (
            <div className="nx-admin-empty-box">
              <p>No inventory records matched your filters.</p>
            </div>
          ) : (
            <div className="nx-admin-table-wrap">
              <table className="nx-admin-table" aria-label="Product Inventory Levels">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    <th scope="col">Total Stock</th>
                    <th scope="col">Reserved</th>
                    <th scope="col">Available</th>
                    <th scope="col">Health Status</th>
                    <th scope="col">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => {
                    const isOut = item.availableQuantity === 0;
                    const isLow = item.availableQuantity > 0 && item.availableQuantity <= 5;
                    const statusText = isOut ? 'OUT_OF_STOCK' : isLow ? 'LOW_STOCK' : 'IN_STOCK';

                    return (
                      <tr key={item.productId}>
                        <td>
                          <div className="nx-admin-cell-stacked">
                            <span className="nx-admin-primary-text">{item.name}</span>
                            <code className="nx-admin-id-tag" title={item.productId}>
                              {item.productId.slice(0, 8)}&hellip;
                            </code>
                          </div>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          <span className="nx-admin-mono-number">{item.stockQuantity}</span>
                        </td>
                        <td>
                          <span className="nx-admin-mono-number">{item.reservedQuantity}</span>
                        </td>
                        <td>
                          <span
                            className={`nx-admin-mono-number ${
                              isOut ? 'is-danger' : isLow ? 'is-warning' : 'is-success'
                            }`}
                          >
                            {item.availableQuantity}
                          </span>
                        </td>
                        <td>
                          <Badge status={statusText} />
                        </td>
                        <td>
                          <span className="nx-admin-mono-date">
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </span>
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
            <div className="nx-admin-pagination" role="navigation" aria-label="Inventory pagination">
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
    </div>
  );
}

export default AdminInventory;
