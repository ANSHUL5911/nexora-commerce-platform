import { Link } from 'react-router';
import './CheckoutHeader.css';

export function CheckoutHeader({ cart = [] }) {
    const totalQuantity = (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

    return (
        <header className="checkout-header" role="banner">
            <div className="header-content">
                <div className="checkout-header-left-section">
                    <Link to="/" className="checkout-logo-link" aria-label="Nexora Home">
                        <span className="checkout-wordmark">NEXORA</span>
                    </Link>
                </div>

                <div className="checkout-header-middle-section">
                    <span className="checkout-title">
                        Checkout
                        <span className="checkout-item-count">
                            {' '}(<Link className="return-to-home-link" to="/">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</Link>)
                        </span>
                    </span>
                </div>

                <div className="checkout-header-right-section" aria-label="Secure Transaction">
                    <div className="secure-badge">
                        <svg className="lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span className="secure-text">Secure Checkout</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
