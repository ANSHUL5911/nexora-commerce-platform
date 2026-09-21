import { Link } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { Button } from '../../components/ui/Button.jsx';
import './NotFoundPage.css';

export function NotFoundPage({ cart, currentUser, onAuthChange }) {
  return (
    <>
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />
      <main className="not-found-page">
        <div className="not-found-content">
          <div className="not-found-code">404</div>
          <h1 className="not-found-title">Page Not Found</h1>
          <p className="not-found-message">
            The architectural surface or object you are attempting to access does not exist or has been relocated.
          </p>
          <div className="not-found-actions">
            {currentUser?.role === 'admin' ? (
              <Link to="/admin">
                <Button variant="primary">Return to Admin Console</Button>
              </Link>
            ) : (
              <>
                <Link to="/">
                  <Button variant="primary">Return to Catalog</Button>
                </Link>
                <Link to="/orders">
                  <Button variant="secondary">Order History</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
