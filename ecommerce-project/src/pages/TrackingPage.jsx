import { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router';
import dayjs from 'dayjs';
import { Header } from '../components/Header';
import { ordersApi } from '../api/orders';
import { adaptOrder } from '../api/adapters';
import './TrackingPage.css';

export function TrackingPage({ cart }) {
    const { orderId, productId } = useParams();
    const location = useLocation();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const fetchOrder = async () => {
            setLoading(true);
            setError(null);
            try {
                const guestToken = location.state?.guestToken || null;

                const response = await ordersApi.getOrder(orderId, { guestToken });
                const rawOrder = response.order || response.data?.order || response;
                if (isMounted) {
                    setOrder(adaptOrder(rawOrder));
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message || 'Failed to load order tracking details');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        if (orderId) {
            fetchOrder();
        }
        return () => { isMounted = false; };
    }, [orderId, location.state]);


    if (loading) {
        return (
            <>
                <Header cart={cart} />
                <div className="tracking-page">
                    <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                        Loading tracking information...
                    </div>
                </div>
            </>
        );
    }

    if (error || !order) {
        return (
            <>
                <Header cart={cart} />
                <div className="tracking-page">
                    <div style={{ padding: '32px', textAlign: 'center', color: '#c00' }}>
                        <p>{error || 'Order not found.'}</p>
                        <Link to="/orders" className="link-primary" style={{ marginTop: '12px', display: 'inline-block' }}>
                            View all orders
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    const items = order.items || [];
    const item = items.find((p) => p.productId === productId || p.id === productId) || items[0] || {};

    const status = (order.status || 'PROCESSING').toUpperCase();
    const isCancelled = status === 'CANCELLED';
    const isDelivered = status === 'DELIVERED';
    const isShipped = status === 'SHIPPED';
    const isPreparing = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'CONFIRMED'].includes(status);

    let progressPercent = 33;
    if (isDelivered) {
        progressPercent = 100;
    } else if (isShipped) {
        progressPercent = 66;
    } else if (isCancelled) {
        progressPercent = 0;
    }

    const deliveryDate = dayjs(order.createdAt).add(5, 'day').format('dddd, MMMM D');

    return (
        <>
            <title>Tracking - Nexora</title>
            <link rel="icon" href="tracking-favicon.png" />

            <Header cart={cart} />

            <div className="tracking-page">
                <div className="order-tracking">
                    <Link className="back-to-orders-link link-primary" to="/orders">
                        View all orders
                    </Link>

                    <div className="delivery-date">
                        {isDelivered ? 'Delivered on' : 'Estimated Delivery:'} {deliveryDate}
                    </div>

                    <div className="product-info" style={{ fontWeight: 600 }}>
                        {item.productName || item.name || 'Order Item'}
                    </div>

                    <div className="product-info">
                        Quantity: {item.quantity || 1}
                    </div>

                    <img
                        className="product-image"
                        src={item.image || item.imageUrl || 'images/products/athletic-cotton-socks-6-pairs.jpg'}
                        alt={item.productName || 'Product'}
                    />

                    <div className="progress-labels-container">
                        <div className={`progress-label ${isPreparing ? 'current-status' : ''}`}>
                            Preparing
                        </div>
                        <div className={`progress-label ${isShipped ? 'current-status' : ''}`}>
                            Shipped
                        </div>
                        <div className={`progress-label ${isDelivered ? 'current-status' : ''}`}>
                            Delivered
                        </div>
                    </div>

                    <div className="progress-bar-container">
                        <div
                            className="progress-bar"
                            style={{
                                width: `${progressPercent}%`,
                                backgroundColor: isCancelled ? '#dc3545' : '#0063FF'
                            }}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}