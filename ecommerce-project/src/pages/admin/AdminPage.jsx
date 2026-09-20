import { Link, useNavigate } from 'react-router';
import { authApi } from '../../api/auth.js';
import './AdminPage.css';

/**
 * AdminPage Component (Phase 07.26)
 * Minimal administrative shell that proves admin routing and authorization.
 */
export function AdminPage({ currentUser, onAuthChange }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      if (onAuthChange) {
        await onAuthChange(null);
      }
      navigate('/');
    }
  };

  return (
    <div className="nx-admin-layout">
      <header className="nx-admin-header" role="banner">
        <div className="nx-admin-header-inner">
          <div className="nx-admin-brand">
            <span className="nx-admin-wordmark">NEXORA ADMIN</span>
            <span className="nx-admin-badge" role="status">Phase 07.26</span>
          </div>

          <div className="nx-admin-user-bar">
            <div className="nx-admin-user-info">
              <span className="nx-admin-user-name">{currentUser?.full_name || 'Administrator'}</span>
              <span className="nx-admin-role-tag">role: {currentUser?.role || 'admin'}</span>
            </div>

            <nav className="nx-admin-header-nav" aria-label="Administrative header navigation">
              <Link to="/" className="nx-admin-nav-link" aria-label="Return to Storefront Catalog">
                Storefront
              </Link>
              <button
                type="button"
                className="nx-admin-logout-btn"
                onClick={handleLogout}
                aria-label="Sign out of administrative session"
              >
                Sign Out
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="nx-admin-main" id="admin-main-content">
        <div className="nx-admin-container">
          <section className="nx-admin-hero">
            <h1 className="nx-admin-title">Nexora Admin</h1>
            <p className="nx-admin-subtitle">
              Administrative authorization and routing verified for {currentUser?.full_name || 'System Administrator'}.
            </p>
          </section>

          <section className="nx-admin-overview" aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="nx-admin-section-title">System &amp; Authorization Overview</h2>
            
            <div className="nx-admin-cards-grid">
              <div className="nx-admin-card">
                <div className="nx-admin-card-header">
                  <span className="nx-admin-card-label">Session Authentication</span>
                  <span className="nx-status-pill is-active">Active</span>
                </div>
                <div className="nx-admin-card-body">
                  <div className="nx-admin-field">
                    <span className="nx-admin-field-label">User ID</span>
                    <code className="nx-admin-field-value">{currentUser?.id || '—'}</code>
                  </div>
                  <div className="nx-admin-field">
                    <span className="nx-admin-field-label">Email</span>
                    <span className="nx-admin-field-value">{currentUser?.email || '—'}</span>
                  </div>
                  <div className="nx-admin-field">
                    <span className="nx-admin-field-label">Verified Role</span>
                    <span className="nx-admin-field-value nx-role-accent">{currentUser?.role || 'admin'}</span>
                  </div>
                </div>
              </div>

              <div className="nx-admin-card">
                <div className="nx-admin-card-header">
                  <span className="nx-admin-card-label">Security &amp; RBAC Controls</span>
                  <span className="nx-status-pill is-enforced">Enforced</span>
                </div>
                <div className="nx-admin-card-body">
                  <ul className="nx-admin-checklist">
                    <li>Backend Session Cookie (HttpOnly)</li>
                    <li>Double-Submit CSRF Verification</li>
                    <li>Backend Router requireAdmin RBAC</li>
                    <li>Fail-Closed Route Authorization</li>
                  </ul>
                </div>
              </div>

              <div className="nx-admin-card">
                <div className="nx-admin-card-header">
                  <span className="nx-admin-card-label">Backend Operations Services</span>
                  <span className="nx-status-pill is-ready">Ready</span>
                </div>
                <div className="nx-admin-card-body">
                  <p className="nx-admin-card-text">
                    Core administrative API endpoints are verified and ready for management UI consumption:
                  </p>
                  <div className="nx-admin-endpoints-list">
                    <code>/api/admin/products</code>
                    <code>/api/admin/inventory</code>
                    <code>/api/admin/orders</code>
                    <code>/api/admin/audit-logs</code>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default AdminPage;
