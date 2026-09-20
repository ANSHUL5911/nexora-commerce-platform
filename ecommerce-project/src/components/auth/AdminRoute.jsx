import { Navigate, Link } from 'react-router';
import './AdminRoute.css';

/**
 * AdminRoute Guard (Phase 07.26)
 * Enforces role-based access control for administrative routes.
 * 
 * Rules:
 * - While authLoading is true: render accessible loading skeleton (prevent flash / incorrect redirect)
 * - If unauthenticated (no user): redirect to storefront catalog (/)
 * - If authenticated customer / non-admin: fail-closed with 403 Access Denied screen
 * - If role === 'admin': render children
 * - Fail closed on missing/malformed role
 */
export function AdminRoute({ currentUser, authLoading, children }) {
  if (authLoading) {
    return (
      <main className="nx-admin-loading-screen" role="status" aria-live="polite">
        <div className="nx-admin-loading-card">
          <div className="nx-admin-spinner" aria-hidden="true" />
          <h2 className="nx-admin-loading-title">Verifying Session</h2>
          <p className="nx-admin-loading-text">Validating administrative authorization...</p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  // Strict RBAC check - fail closed for any missing, unknown, or non-admin role
  if (currentUser.role !== 'admin') {
    return (
      <main className="nx-admin-denied-screen" role="alert">
        <div className="nx-admin-denied-card">
          <div className="nx-admin-denied-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="nx-admin-denied-title">Access Denied</h1>
          <p className="nx-admin-denied-message">
            Administrator privileges are required to view this interface. Your account ({currentUser.email || 'Current account'}) does not have administrative access.
          </p>
          <div className="nx-admin-denied-actions">
            <Link to="/" className="button-primary">
              Return to Storefront
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return children;
}

export default AdminRoute;
