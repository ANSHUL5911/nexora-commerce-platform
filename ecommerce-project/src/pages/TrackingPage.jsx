import { Header } from '../components/Header';
import './TrackingPage.css';
import { Link, useParams } from 'react-router';
import axios from 'axios';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';


export function TrackingPage({ cart }) {
    const { orderId, productId } = useParams();
    const [order, setOrder] = useState(null);

    useEffect(() => {
        axios.get(`/api/orders/${orderId}?expand=products`)
            .then((response) => {
                setOrder(response.data);
            });
    }, [orderId]);

    if (!order) {
        return null;
    }

    const product = order.products.find(p => p.productId === productId);

    const totalDeliveryTimeMs = product.estimatedDeliveryTimeMs - order.orderTimeMs;
    const timePassedMs = dayjs().valueOf() - order.orderTimeMs;
    let deliveryPercent = (timePassedMs / totalDeliveryTimeMs) * 100;
    if (deliveryPercent > 100) {
        deliveryPercent = 100;
    }

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
                        Arriving on {dayjs(product.estimatedDeliveryTimeMs).format('dddd, MMMM D')}
                    </div>

                    <div className="product-info">
                        {product.product?.name}
                    </div>

                    <div className="product-info">
                        Quantity: {product.quantity}
                    </div>

                    <img className="product-image" src={product.product?.image} />

                    <div className="progress-labels-container">
                        <div className="current-status">Preparing</div>
                        <div>Shipped</div>
                        <div>Delivered</div>
                    </div>

                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{width: `${deliveryPercent}%`}}></div>
                    </div>
                </div>
            </div>
        </>
    );
}