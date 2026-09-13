import { Fragment } from 'react';
import { Link } from 'react-router';
import dayjs from 'dayjs';
import { formatMoney } from '../../utils/money';
import { cartApi } from '../../api/cart';

function OrderHeader({ order }) {
    const totalPaise = order.totalPaise ?? order.totalCostPaise ?? order.totalCostCents ?? 0;
    const orderDate = order.createdAt || order.orderTimeMs;

    return (
        <div className="order-header">
            <div className="order-header-left-section">
                <div className="order-date">
                    <div className="order-header-label">Order Placed:</div>
                    <div>{orderDate ? dayjs(orderDate).format('MMMM D, YYYY') : 'Recent'}</div>
                </div>
                <div className="order-total">
                    <div className="order-header-label">Total:</div>
                    <div>{formatMoney(totalPaise)}</div>
                </div>
                {order.status && (
                    <div className="order-status-badge" style={{ marginLeft: '12px', fontSize: '13px', fontWeight: 600, color: '#0063FF' }}>
                        <span className="order-header-label">Status: </span>
                        <span>{order.status}</span>
                    </div>
                )}
            </div>

            <div className="order-header-right-section">
                <div className="order-header-label">Order ID:</div>
                <div>{order.id}</div>
            </div>
        </div>
    );
}

function OrderDetailsGrid({ order, loadCart }) {
    const items = order.items || order.products || [];

    const addToCart = async (productId) => {
        try {
            await cartApi.addItem({
                productId,
                quantity: 1
            });
            if (loadCart) {
                await loadCart();
            }
        } catch (err) {
            console.error('Failed to add item to cart:', err);
        }
    };

    return (
        <div className="order-details-grid">
            {items.map((item, idx) => {
                const productId = item.productId || item.product_id || item.product?.id || item.id;
                const productName = item.productName || item.product_name || item.name || item.product?.name || 'Product';
                const productImage = item.image || item.imageUrl || item.image_url || item.product?.image || 'images/products/athletic-cotton-socks-6-pairs.jpg';
                const itemKey = item.id || `${order.id}-${productId}-${idx}`;

                return (
                    <Fragment key={itemKey}>
                        <div className="product-image-container">
                            <img src={productImage} alt={productName} />
                        </div>

                        <div className="product-details">
                            <div className="product-name">
                                {productName}
                            </div>
                            <div className="product-delivery-date">
                                Status: {order.status || 'PROCESSING'}
                            </div>
                            <div className="product-quantity">
                                Quantity: {item.quantity}
                            </div>
                            {item.unitPricePaise ? (
                                <div className="product-price" style={{ fontSize: '14px', color: '#555', marginTop: '4px' }}>
                                    Price: {formatMoney(item.unitPricePaise)}
                                </div>
                            ) : null}
                            <button
                                className="buy-again-button button-primary"
                                onClick={() => addToCart(productId)}
                            >
                                <img className="buy-again-icon" src="images/icons/buy-again.png" alt="" />
                                <span className="buy-again-message">Add to Cart</span>
                            </button>
                        </div>

                        <div className="product-actions">
                            <Link to={`/tracking/${order.id}/${productId}`} state={{ guestToken: order.guestToken }}>
                                <button className="track-package-button button-secondary">
                                    Track package
                                </button>
                            </Link>
                        </div>
                    </Fragment>

                );
            })}
        </div>
    );
}

export function OrdersGrid({ orders = [], loadCart }) {
    if (!orders || orders.length === 0) {
        return (
            <div className="no-orders-message" style={{ padding: '32px 0', textAlign: 'center', color: '#777' }}>
                <p>You have no placed orders yet.</p>
                <Link to="/" className="link-primary" style={{ marginTop: '8px', display: 'inline-block' }}>
                    Start shopping
                </Link>
            </div>
        );
    }

    return (
        <div className="orders-grid">
            {orders.map((order) => {
                return (
                    <div key={order.id} className="order-container">
                        <OrderHeader order={order} />
                        <OrderDetailsGrid order={order} loadCart={loadCart} />
                    </div>
                );
            })}
        </div>
    );
}

