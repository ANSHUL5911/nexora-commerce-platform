import { Link } from 'react-router';
import { Icon } from '../../components/ui/Icon.jsx';
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
                        <Icon name="Lock" size={14} className="lock-icon" aria-hidden="true" />
                        <span className="secure-text">Secure Checkout</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
