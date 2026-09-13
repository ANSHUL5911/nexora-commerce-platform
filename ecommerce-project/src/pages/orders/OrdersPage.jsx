import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Header } from '../../components/Header';
import { ordersApi } from '../../api/orders';
import { adaptOrder } from '../../api/adapters';
import { OrdersGrid } from './OrdersGrid';
import './OrdersPage.css';

export function OrdersPage({ cart, loadCart }) {
    const location = useLocation();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const loadOrders = async () => {
            setLoading(true);
            setError(null);
            try {
                // If in-memory guestToken and orderId were passed from guest checkout
                const inMemoryGuestToken = location.state?.guestToken;
                const inMemoryOrderId = location.state?.orderId;

                if (inMemoryGuestToken && inMemoryOrderId) {
                    const gOrderRes = await ordersApi.getOrder(inMemoryOrderId, { guestToken: inMemoryGuestToken });
                    const gOrder = gOrderRes.order || gOrderRes.data?.order || gOrderRes;
                    if (isMounted && gOrder) {
                        const adapted = adaptOrder(gOrder);
                        adapted.guestToken = inMemoryGuestToken;
                        setOrders([adapted]);
                        return;
                    }
                }

                const response = await ordersApi.listOrders();
                const rawOrders = Array.isArray(response)
                    ? response
                    : (response?.orders || response?.data?.orders || []);

                if (isMounted) {
                    setOrders(rawOrders.map(adaptOrder));
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message || 'Failed to load orders');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };
        loadOrders();
        return () => { isMounted = false; };
    }, [location.state]);


    return (
        <>
            <title>Orders</title>
            <link rel="icon" href="orders-favicon.png" />

            <Header cart={cart} />

            <div className="orders-page">
                <div className="page-title">Your Orders</div>

                {error && (
                    <div style={{ padding: '16px', color: '#c00', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '24px 0', color: '#666' }}>Loading orders...</div>
                ) : (
                    <OrdersGrid orders={orders} loadCart={loadCart} />
                )}
            </div>
        </>
    );
}
