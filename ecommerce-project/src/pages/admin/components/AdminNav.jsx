import { Link } from 'react-router';

/**
 * AdminNav Component (Phase 07.26B)
 * Administrative header and navigation bar adhering to Architectural Editorial Commerce.
 */
export function AdminNav({ activeTab, onSelectTab, currentUser, onLogout }) {
  const tabs = [
    { id: 'overview', label: 'Overview', path: '/admin' },
    { id: 'orders', label: 'Orders', path: '/admin/orders' },
    { id: 'inventory', label: 'Inventory', path: '/admin/inventory' },
    { id: 'products', label: 'Products', path: '/admin/products' },
    { id: 'audit', label: 'Audit Logs', path: '/admin/audit-logs' },
  ];

  return (
    <header className="nx-admin-header" role="banner">
      <div className="nx-admin-header-inner">
        <div className="nx-admin-brand-group">
          <Link to="/admin" className="nx-admin-brand-link" aria-label="Nexora Admin Home">
            <h1 className="nx-admin-wordmark">NEXORA ADMIN</h1>
          </Link>
          <span className="nx-admin-badge" role="status">Console</span>
        </div>

        <nav className="nx-admin-tabs" aria-label="Administrative Sections">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`nx-admin-tab-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => onSelectTab(tab.id, tab.path)}
                aria-current={isActive ? 'page' : undefined}
                id={`admin-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

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
              onClick={onLogout}
              aria-label="Sign out of administrative session"
            >
              Sign Out
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default AdminNav;
