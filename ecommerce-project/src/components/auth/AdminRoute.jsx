import { Navigate, Link } from 'react-router';
import { Icon } from '../ui/Icon.jsx';
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
            <Icon name="Lock" size={40} strokeWidth={1.5} />
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
