import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../../api/admin.js';
import { AuditLogDetailModal } from './AuditLogDetailModal.jsx';

/**
 * AdminAuditLogs Component (Phase 07.26B)
 * Immutable operational audit trail viewer.
 * Exclusively read-only: strictly zero mutation or deletion capabilities.
 */
export function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inspector modal
  const [inspectedLog, setInspectedLog] = useState(null);

  const fetchAuditLogs = useCallback(
    async (page = 1, action = actionFilter, targetResource = resourceFilter) => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page,
          limit: 10,
        };
        if (action.trim()) params.action = action.trim();
        if (targetResource.trim()) params.targetResource = targetResource.trim();

        const response = await adminApi.listAuditLogs(params);
        setLogs(response?.data || []);
        setPagination(response?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      } catch (err) {
        console.error('Failed to list audit logs:', err);
        setError(err.message || 'Unable to retrieve audit logs.');
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, resourceFilter]
  );

  useEffect(() => {
    fetchAuditLogs(1, actionFilter, resourceFilter);
  }, [fetchAuditLogs, actionFilter, resourceFilter]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchAuditLogs(newPage, actionFilter, resourceFilter);
    }
  };

  return (
    <div className="nx-admin-audit-view">
      <div className="nx-admin-view-header">
        <div>
          <h2 className="nx-admin-view-title">Operational Audit Trail</h2>
          <p className="nx-admin-view-subtitle">
            Immutable, append-only administrative history recorded inside database transactions
          </p>
        </div>
        <span className="nx-admin-total-indicator">
          {pagination.total} {pagination.total === 1 ? 'Event' : 'Events'}
        </span>
      </div>

      {/* Toolbar: Filters */}
      <div className="nx-admin-toolbar">
        <div className="nx-admin-filter-group">
          <label htmlFor="audit-action-filter" className="nx-admin-filter-label">
            Filter Action:
          </label>
          <select
            id="audit-action-filter"
            className="nx-admin-select"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All Actions</option>
            <option value="ADMIN_CREATE_PRODUCT">ADMIN_CREATE_PRODUCT</option>
            <option value="ADMIN_UPDATE_PRODUCT">ADMIN_UPDATE_PRODUCT</option>
            <option value="ADMIN_DELETE_PRODUCT">ADMIN_DELETE_PRODUCT</option>
            <option value="ADMIN_ORDER_STATUS_CHANGE">ADMIN_ORDER_STATUS_CHANGE</option>
            <option value="REFUND_ORDER">REFUND_ORDER</option>
            <option value="RESTOCK_ORDER">RESTOCK_ORDER</option>
          </select>
        </div>

        <div className="nx-admin-filter-group">
          <label htmlFor="audit-resource-filter" className="nx-admin-filter-label">
            Filter Resource:
          </label>
          <select
            id="audit-resource-filter"
            className="nx-admin-select"
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
          >
            <option value="">All Resources</option>
            <option value="products">products</option>
            <option value="orders">orders</option>
            <option value="order">order</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="nx-admin-loading" role="status">
          <div className="nx-admin-spinner" aria-hidden="true" />
          <p>Loading audit trail...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="nx-admin-error-box" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => fetchAuditLogs(pagination.page, actionFilter, resourceFilter)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Audit Logs Table */}
      {!loading && !error && (
        <>
          {logs.length === 0 ? (
            <div className="nx-admin-empty-box">
              <p>No audit events match your selected filters.</p>
            </div>
          ) : (
            <div className="nx-admin-table-wrap">
              <table className="nx-admin-table" aria-label="Administrative Audit Events">
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Action</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Resource</th>
                    <th scope="col">Resource ID</th>
                    <th scope="col">IP Address</th>
                    <th scope="col" className="nx-text-right">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className="nx-admin-mono-date">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span className="nx-admin-action-pill">{log.action}</span>
                      </td>
                      <td>
                        <div className="nx-admin-cell-stacked">
                          <span className="nx-admin-primary-text">
                            {log.actor?.fullName || log.actor?.email || 'System'}
                          </span>
                          <span className="nx-admin-secondary-text">
                            {log.actor?.email || log.actorId}
                          </span>
                        </div>
                      </td>
                      <td>{log.targetResource}</td>
                      <td>
                        <code className="nx-admin-id-tag">
                          {log.resourceId ? `${log.resourceId.slice(0, 8)}…` : '—'}
                        </code>
                      </td>
                      <td>
                        <code className="nx-admin-secondary-text">{log.ipAddress}</code>
                      </td>
                      <td className="nx-text-right">
                        <button
                          type="button"
                          className="nx-admin-table-btn"
                          onClick={() => setInspectedLog(log)}
                          aria-label={`Inspect audit log ${log.id}`}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="nx-admin-pagination" role="navigation" aria-label="Audit logs pagination">
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

      {/* Payload Inspection Modal */}
      <AuditLogDetailModal
        isOpen={Boolean(inspectedLog)}
        onClose={() => setInspectedLog(null)}
        log={inspectedLog}
      />
    </div>
  );
}

export default AdminAuditLogs;
