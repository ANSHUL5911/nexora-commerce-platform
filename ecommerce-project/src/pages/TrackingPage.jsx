import { Header } from '../components/Header';
import './TrackingPage.css';
import { Link, useParams } from 'react-router';
import axios from 'axios';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';


export function TrackingPage({ cart }) {
    const { orderId, productId } = useParams();
    const [tracking, setTracking] = useState(null);

    useEffect(() => {
        axios.get(`/api/tracking/${orderId}`)
            .then((response) => {
                const product = response.data.products.find(p => p.productId === productId);
                setTracking(product || response.data.products[0]);
            });
    }, [orderId, productId]);

    if (!tracking) {
        return (
            <>
                <title>Tracking</title>
                <link rel="icon" href="tracking-favicon.png" />
                <Header cart={cart} />
                <div className="tracking-page">Loading...</div>
            </>
        );
    }

    const statuses = ['Preparing', 'Shipped', 'Delivered'];
    const currentStatusIndex = statuses.indexOf(tracking.status);

    return (
        <>
            <title>Tracking</title>
            <link rel="icon" href="tracking-favicon.png" />

            <Header cart={cart} />

            <div className="tracking-page">
                <div className="order-tracking">
                    <Link className="back-to-orders-link link-primary" to="/orders">
                        View all orders
                    </Link>

                    <div className="delivery-date">
                        Arriving on {dayjs(tracking.estimatedDeliveryTimeMs).format('dddd, MMMM D')}
                    </div>

                    <div className="product-info">
                        {tracking.product?.name}
                    </div>

                    <div className="product-info">
                        Quantity: {tracking.quantity}
                    </div>

                    <img className="product-image" src={tracking.product?.image} />

                    <div className="progress-labels-container">
                        {statuses.map((status, index) => (
                            <div key={status} className={`progress-label ${index === currentStatusIndex ? 'current-status' : ''}`}>
                                {status}
                            </div>
                        ))}
                    </div>

                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{ width: `${tracking.progress}%` }}></div>
                    </div>
                </div>
            </div>
        </>
    );
}