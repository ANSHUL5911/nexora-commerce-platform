import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useSearchParams, useNavigate, useLocation } from 'react-router';
import { AuthModal } from './auth/AuthModal.jsx';
import { authApi } from '../api/auth.js';
import { getAuthRedirectPath } from '../utils/authRedirect.js';
import { Icon } from './ui/Icon.jsx';
import './Header.css';

const SEARCH_DEBOUNCE_MS = 300;

export function Header({ cart = [], currentUser: propUser, onAuthChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const search = searchParams.get('search') || '';
  const [searchInput, setSearchInput] = useState(search);
  const lastCommittedSearchRef = useRef(search);
  const debounceTimerRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(propUser || null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sync propUser if passed
  useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
    }
  }, [propUser]);

  // Load session on initial mount if not passed
  useEffect(() => {
    if (propUser === undefined) {
      let isMounted = true;
      authApi.getCurrentUser()
        .then((res) => {
          if (isMounted && res?.user) {
            setCurrentUser(res.user);
            onAuthChange?.(res.user);
          }
        })
        .catch(() => {
          if (isMounted) setCurrentUser(null);
        });
      return () => { isMounted = false; };
    }
  }, [propUser, onAuthChange]);

  const totalQuantity = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
  const isAdmin = currentUser?.role === 'admin';

  const applySearch = useCallback(
    (rawQuery) => {
      const trimmed = rawQuery.trim();
      lastCommittedSearchRef.current = trimmed;

      if (location.pathname === '/catalog') {
        setSearchParams(
          (prev) => {
            const current = prev.get('search') || '';
            if (current === trimmed) {
              return prev;
            }
            const next = new URLSearchParams(prev);
            if (trimmed) {
              next.set('search', trimmed);
            } else {
              next.delete('search');
            }
            return next;
          },
          { replace: true }
        );
      } else {
        if (trimmed) {
          navigate(`/catalog?search=${encodeURIComponent(trimmed)}`);
        } else {
          navigate('/catalog');
        }
      }
    },
    [location.pathname, setSearchParams, navigate]
  );

  // Synchronize searchInput when search in URL or location changes
  useEffect(() => {
    if (location.pathname === '/catalog') {
      const currentParam = searchParams.get('search') || '';
      if (currentParam !== lastCommittedSearchRef.current) {
        lastCommittedSearchRef.current = currentParam;
        setSearchInput(currentParam);
      }
    } else {
      if (lastCommittedSearchRef.current !== '') {
        lastCommittedSearchRef.current = '';
        setSearchInput('');
      }
    }
  }, [location.pathname, searchParams]);

  // Debounced live search while user types (~300ms idle delay)
  useEffect(() => {
    const trimmed = searchInput.trim();
    const currentParam = searchParams.get('search') || '';

    // If trimmed input is already reflected in current URL param, do not schedule
    if (trimmed === currentParam) {
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      applySearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput, searchParams, applySearch]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    applySearch(searchInput);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      setCurrentUser(null);
      setIsUserDropdownOpen(false);
      onAuthChange?.(null);
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    if (onAuthChange) {
      await onAuthChange(user);
    }
    const targetPath = getAuthRedirectPath(user);
    if (targetPath) {
      navigate(targetPath);
    }
  };

  return (
    <>
      <header className="nx-header" role="banner">
        <div className="nx-header-inner">
          {/* Logo / Brand */}
          <NavLink
            to={isAdmin ? '/admin' : '/'}
            className="nx-brand-link"
            aria-label={isAdmin ? 'Nexora Admin Home' : 'Nexora Home'}
          >
            <span className="nx-brand-wordmark">NEXORA</span>
            {isAdmin && <span className="nx-admin-badge" style={{ marginLeft: '8px' }}>Console</span>}
          </NavLink>

          {/* Desktop Search Bar - Customer Only */}
          {!isAdmin && (
            <form className="nx-search-form" onSubmit={handleSearchSubmit} role="search">
              <input
                type="text"
                className="nx-search-input"
                placeholder="Search collections, essentials..."
                aria-label="Search collections and products"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" className="nx-search-btn" aria-label="Submit search">
                <Icon name="Search" size={16} aria-hidden="true" />
              </button>
            </form>
          )}

          {/* Desktop Navigation Links */}
          <nav className="nx-nav-links" aria-label={isAdmin ? 'Admin Navigation' : 'Main Navigation'}>
            {!isAdmin ? (
              <>
                <NavLink to="/catalog" className={({ isActive }) => `nx-nav-link ${isActive ? 'active' : ''}`}>
                  Catalog
                </NavLink>

                <NavLink to="/orders" className={({ isActive }) => `nx-nav-link ${isActive ? 'active' : ''}`}>
                  Orders
                </NavLink>

                <NavLink to="/cart" className={({ isActive }) => `nx-nav-link ${isActive ? 'active' : ''}`} aria-label={`Shopping cart with ${totalQuantity} items`}>
                  <span>Cart</span>
                  <span className="nx-cart-badge">{totalQuantity}</span>
                </NavLink>
              </>
            ) : (
              <NavLink to="/admin" className={({ isActive }) => `nx-nav-link nx-admin-link ${isActive ? 'active' : ''}`}>
                Admin Dashboard
              </NavLink>
            )}

            {/* Account / Authentication Trigger */}
            {currentUser ? (
              <div className="nx-user-menu">
                <button
                  type="button"
                  className="nx-user-btn"
                  onClick={() => setIsUserDropdownOpen((prev) => !prev)}
                  aria-expanded={isUserDropdownOpen}
                  aria-haspopup="true"
                >
                  <Icon name="User" size={14} aria-hidden="true" />
                  <span>{currentUser.full_name?.split(' ')[0] || 'Account'}</span>
                </button>

                {isUserDropdownOpen && (
                  <div className="nx-user-dropdown" role="menu">
                    <div className="nx-user-info">
                      <div className="nx-user-name">{currentUser.full_name}</div>
                      <div className="nx-user-email">{currentUser.email}</div>
                    </div>
                    {isAdmin && (
                      <NavLink
                        to="/admin"
                        className="nx-dropdown-item nx-dropdown-admin-item"
                        role="menuitem"
                        onClick={() => setIsUserDropdownOpen(false)}
                      >
                        Admin Dashboard
                      </NavLink>
                    )}
                    <button
                      type="button"
                      className="nx-dropdown-item"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="nx-nav-link"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onClick={() => setIsAuthModalOpen(true)}
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            className="nx-mobile-toggle"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            <Icon name={isMobileMenuOpen ? 'X' : 'Menu'} size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="nx-mobile-drawer" role="dialog" aria-label="Mobile Navigation">
          {!isAdmin && (
            <form className="nx-search-form" onSubmit={handleSearchSubmit} role="search">
              <input
                type="text"
                className="nx-search-input"
                placeholder="Search products..."
                aria-label="Search collections and products"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" className="nx-search-btn" aria-label="Submit search">
                <Icon name="Search" size={16} aria-hidden="true" />
              </button>
            </form>
          )}

          <nav className="nx-mobile-nav-list">
            {!isAdmin ? (
              <>
                <NavLink
                  to="/catalog"
                  className="nx-mobile-nav-link"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>Catalog</span>
                </NavLink>

                <NavLink
                  to="/orders"
                  className="nx-mobile-nav-link"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>Orders</span>
                </NavLink>

                <NavLink
                  to="/cart"
                  className="nx-mobile-nav-link"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>Cart</span>
                  <span className="nx-cart-badge">{totalQuantity}</span>
                </NavLink>
              </>
            ) : (
              <NavLink
                to="/admin"
                className="nx-mobile-nav-link nx-admin-link"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span>Admin Dashboard</span>
              </NavLink>
            )}

            {currentUser ? (
              <div style={{ paddingTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                  Signed in as {currentUser.full_name} ({currentUser.email})
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div style={{ paddingTop: 'var(--space-4)' }}>
                <button
                  type="button"
                  className="button-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    setIsAuthModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  Sign In / Register
                </button>
              </div>
            )}
          </nav>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
}
