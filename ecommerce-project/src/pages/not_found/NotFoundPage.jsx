import { Link } from 'react-router';
import { Header } from '../../components/Header.jsx';
import { Button } from '../../components/ui/Button.jsx';
import './NotFoundPage.css';

export function NotFoundPage({ cart, currentUser, onAuthChange }) {
  return (
    <>
      <Header cart={cart} currentUser={currentUser} onAuthChange={onAuthChange} />
      <main className="not-found-page" id="main-content" tabIndex="-1">
        <div className="not-found-content">
          <div className="not-found-code">404</div>
          <h1 className="not-found-title">Uncharted Coordinate</h1>
          <p className="not-found-message">
            The referenced specimen does not exist in the collection index. Return to the primary archive.
          </p>
          <div className="not-found-actions">
            {currentUser?.role === 'admin' ? (
              <Link to="/admin">
                <Button variant="primary">Return to Operations Console</Button>
              </Link>
            ) : (
              <>
                <Link to="/">
                  <Button variant="primary">Return to Primary Archive</Button>
                </Link>
                <Link to="/orders">
                  <Button variant="secondary">Inspect Order Ledger</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
