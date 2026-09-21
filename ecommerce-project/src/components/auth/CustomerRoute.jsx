import { Navigate } from 'react-router';
import './CustomerRoute.css';

/**
 * CustomerRoute Guard (Phase 07.26C)
 * Enforces role-based customer storefront isolation.
 * 
 * Rules:
 * - While authLoading is true: render accessible loading skeleton (prevent flash / race condition)
 * - If authenticated as admin (role === 'admin'): redirect to /admin
 * - If unauthenticated (guest) or customer: render children (customer experience)
 */
export function CustomerRoute({ currentUser, authLoading, children }) {
  if (authLoading) {
    return (
      <main className="nx-customer-loading-screen" role="status" aria-live="polite">
        <div className="nx-customer-loading-card">
          <div className="nx-customer-spinner" aria-hidden="true" />
          <h2 className="nx-customer-loading-title">Verifying Session</h2>
          <p className="nx-customer-loading-text">Validating customer session...</p>
        </div>
      </main>
    );
  }

  // Strict role isolation: authenticated admin accounts must NOT access the customer storefront
  if (currentUser?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

export default CustomerRoute;
