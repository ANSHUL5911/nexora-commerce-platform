import { Modal } from '../../../components/ui/Modal.jsx';

/**
 * AuditLogDetailModal Component (Phase 07.26B)
 * Modal for securely inspecting the immutable details and metadata of an audit log entry.
 * Read-only presentation; does not execute or interpret JSON.
 */
export function AuditLogDetailModal({ isOpen, onClose, log }) {
  if (!isOpen || !log) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Audit Record #${log.id}`}
      maxWidth="640px"
      ariaLabel="Audit Log Record Details Modal"
    >
      <div className="nx-admin-modal-content">
        <div className="nx-admin-grid-2col">
          <div className="nx-admin-field">
            <span className="nx-admin-field-label">Action</span>
            <span className="nx-admin-action-pill">{log.action}</span>
          </div>

          <div className="nx-admin-field">
            <span className="nx-admin-field-label">Timestamp</span>
            <span className="nx-admin-mono-date">{new Date(log.createdAt).toLocaleString()}</span>
          </div>

          <div className="nx-admin-field">
            <span className="nx-admin-field-label">Actor</span>
            <span className="nx-admin-field-value">
              {log.actor?.fullName || log.actor?.email || log.actorId || 'System'}
            </span>
          </div>

          <div className="nx-admin-field">
            <span className="nx-admin-field-label">IP Address</span>
            <code className="nx-admin-id-tag">{log.ipAddress || '127.0.0.1'}</code>
          </div>

          <div className="nx-admin-field">
            <span className="nx-admin-field-label">Target Resource</span>
            <span className="nx-admin-field-value">{log.targetResource}</span>
          </div>

          <div className="nx-admin-field">
            <span className="nx-admin-field-label">Resource ID</span>
            <code className="nx-admin-id-tag">{log.resourceId || '—'}</code>
          </div>
        </div>

        <div className="nx-admin-field-group" style={{ marginTop: '1rem' }}>
          <span className="nx-admin-form-label">Audit Payload Snapshot</span>
          {log.details ? (
            <pre className="nx-admin-json-box">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          ) : (
            <p className="nx-admin-secondary-text">No additional payload metadata recorded.</p>
          )}
        </div>

        <div className="nx-admin-modal-actions">
          <button type="button" className="button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AuditLogDetailModal;
