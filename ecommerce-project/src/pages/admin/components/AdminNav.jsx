import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';

/**
 * AdminNav Component (Phase 07.26D)
 * Administrative header and navigation bar adhering to Architectural Editorial Commerce.
 * Features strict role separation, complete removal of storefront links, and an accessible admin profile menu.
 */
export function AdminNav({ activeTab, onSelectTab, currentUser, onLogout }) {
  const tabs = [
    { id: 'overview', label: 'Overview', path: '/admin' },
    { id: 'orders', label: 'Orders', path: '/admin/orders' },
    { id: 'inventory', label: 'Inventory', path: '/admin/inventory' },
    { id: 'products', label: 'Products', path: '/admin/products' },
    { id: 'audit', label: 'Audit Logs', path: '/admin/audit-logs' },
  ];

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isProfileOpen) {
        setIsProfileOpen(false);
      }
    };

    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    };

    if (isProfileOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

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

        <div className="nx-admin-profile-container" ref={profileMenuRef}>
          <button
            type="button"
            className={`nx-admin-profile-btn ${isProfileOpen ? 'is-active' : ''}`}
            onClick={() => setIsProfileOpen((prev) => !prev)}
            aria-expanded={isProfileOpen}
            aria-haspopup="menu"
            aria-label="Open admin profile menu"
            id="admin-profile-menu-btn"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>

          {isProfileOpen && (
            <div className="nx-admin-profile-dropdown" role="menu" aria-labelledby="admin-profile-menu-btn">
              <div className="nx-admin-profile-header">
                <div className="nx-admin-profile-name">{currentUser?.full_name || 'Administrator'}</div>
                <div className="nx-admin-profile-email">{currentUser?.email || 'admin@nexora.local'}</div>
                <div className="nx-admin-profile-role-badge">ADMIN</div>
              </div>
              <div className="nx-admin-profile-divider" role="separator" />
              <button
                type="button"
                className="nx-admin-profile-logout-btn"
                role="menuitem"
                onClick={() => {
                  setIsProfileOpen(false);
                  onLogout();
                }}
                aria-label="Sign out of administrative session"
              >
                <span>Sign Out</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AdminNav;
