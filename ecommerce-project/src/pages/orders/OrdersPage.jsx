import './OrdersPage.css';
import { Header } from '../../components/Header';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { OrdersGrid } from './OrdersGrid';


export function OrdersPage({ cart }) {

    const [orders, setOrders] = useState([]);

    useEffect(() => {
        const loadOrders = async () => {
            const response = await axios.get('/api/orders?expand=products');
            setOrders(response.data);
        };
        loadOrders();
    }, []);

    return (
        <>
            <title>Orders</title>
            <link rel="icon" href="orders-favicon.png" />

            <Header cart={cart} />

            <div className="orders-page">
                <div className="page-title">Your Orders</div>

                <OrdersGrid orders={orders} />
            </div>
        </>
    );

}