import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useSearchParams, useNavigate, useLocation } from 'react-router';
import { AuthModal } from './auth/AuthModal.jsx';
import { authApi } from '../api/auth.js';
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

  const applySearch = useCallback(
    (rawQuery) => {
      const trimmed = rawQuery.trim();
      lastCommittedSearchRef.current = trimmed;

      if (location.pathname === '/') {
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
          navigate(`/?search=${encodeURIComponent(trimmed)}`);
        } else {
          navigate('/');
        }
      }
    },
    [location.pathname, setSearchParams, navigate]
  );

  // Synchronize searchInput when search in URL changes externally (e.g., navigation or reset)
  useEffect(() => {
    if (search !== lastCommittedSearchRef.current) {
      lastCommittedSearchRef.current = search;
      setSearchInput(search);
    }
  }, [search]);

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
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    if (onAuthChange) {
      await onAuthChange(user);
    }
    if (user?.role === 'admin') {
      navigate('/admin');
    }
  };

  return (
    <>
      <header className="nx-header" role="banner">
        <div className="nx-header-inner">
          {/* Logo / Brand */}
          <NavLink to="/" className="nx-brand-link" aria-label="Nexora Home">
            <span className="nx-brand-wordmark">NEXORA</span>
          </NavLink>

          {/* Desktop Search Bar */}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>

          {/* Desktop Navigation Links */}
          <nav className="nx-nav-links" aria-label="Main Navigation">
            <NavLink to="/" end className={({ isActive }) => `nx-nav-link ${isActive ? 'active' : ''}`}>
              Catalog
            </NavLink>

            <NavLink to="/orders" className={({ isActive }) => `nx-nav-link ${isActive ? 'active' : ''}`}>
              Orders
            </NavLink>

            <NavLink to="/cart" className={({ isActive }) => `nx-nav-link ${isActive ? 'active' : ''}`} aria-label={`Shopping cart with ${totalQuantity} items`}>
              <span>Cart</span>
              <span className="nx-cart-badge">{totalQuantity}</span>
            </NavLink>

            {currentUser?.role === 'admin' && (
              <NavLink to="/admin" className={({ isActive }) => `nx-nav-link nx-admin-link ${isActive ? 'active' : ''}`}>
                Admin
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>{currentUser.full_name?.split(' ')[0] || 'Account'}</span>
                </button>

                {isUserDropdownOpen && (
                  <div className="nx-user-dropdown" role="menu">
                    <div className="nx-user-info">
                      <div className="nx-user-name">{currentUser.full_name}</div>
                      <div className="nx-user-email">{currentUser.email}</div>
                    </div>
                    {currentUser.role === 'admin' && (
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
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="nx-mobile-drawer" role="dialog" aria-label="Mobile Navigation">
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>

          <nav className="nx-mobile-nav-list">
            <NavLink
              to="/"
              end
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

            {currentUser?.role === 'admin' && (
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
