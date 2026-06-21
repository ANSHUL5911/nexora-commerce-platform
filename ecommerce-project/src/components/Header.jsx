import { NavLink, useSearchParams } from 'react-router';
import './Header.css';

export function Header({ cart = [] }) {
    let totalQuantity = 0;

    cart.forEach((cartItem) => {
        totalQuantity += cartItem.quantity;
    });

    const [searchParams, setSearchParams] = useSearchParams();
    const search = searchParams.get('search') || '';

    return (
        <div className="header">
            <div className="left-section">
                <NavLink to="/" className="header-link">
                    <img className="logo" src="images/logo2.png" />
                    <span className="site-name">Nexora</span>
                </NavLink>
            </div>

            <div className="middle-section">
                <input
                    className="search-bar"
                    type="text"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearchParams({ search: e.target.value }, { replace: true })}
                />

                <button
                    className="search-button"
                    onClick={() => setSearchParams({ search }, { replace: true })}
                >
                    <img className="search-icon" src="images/icons/search-icon.png" />
                </button>
            </div>

            <div className="right-section">
                <NavLink className="orders-link header-link" to="/orders">
                    <span className="orders-text">Orders</span>
                </NavLink>

                <NavLink className="cart-link header-link" to="/checkout">
                    <img className="cart-icon" src="images/icons/cart-icon.png" />
                    <div className="cart-quantity">{totalQuantity}</div>
                    <div className="cart-text">Cart</div>
                </NavLink>
            </div>
        </div>
    );
}

