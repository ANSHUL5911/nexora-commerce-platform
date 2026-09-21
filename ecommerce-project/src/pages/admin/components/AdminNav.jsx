import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Icon } from '../../../components/ui/Icon.jsx';
import { springs, useReducedMotion, withReducedMotion } from '../../../lib/motion.js';

/**
 * AdminNav Component (Phase 07.26D & Phase 2 Motion System)
 * Administrative header and navigation bar adhering to Architectural Editorial Commerce.
 * Features strict role separation, complete removal of storefront links, and an accessible admin profile menu.
 * Enhanced with shared layoutId indicator for active tab transitions.
 */
export function AdminNav({ activeTab, onSelectTab, currentUser, onLogout }) {
  const shouldReduceMotion = useReducedMotion();
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
                style={{ position: 'relative' }}
              >
                <span style={{ position: 'relative', zIndex: 2 }}>{tab.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="nx-admin-active-tab-line"
                    className="nx-admin-active-tab-line"
                    transition={withReducedMotion(springs.tabIndicator, shouldReduceMotion)}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '2px',
                      backgroundColor: 'var(--color-accent-primary, #121212)',
                      zIndex: 3,
                    }}
                  />
                )}
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
            <Icon name="User" size={18} aria-hidden="true" />
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
                <Icon name="LogOut" size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AdminNav;
