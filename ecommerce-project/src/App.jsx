import { Routes, Route } from 'react-router';
import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { cartApi } from './api/cart.js';
import { adaptCartItem } from './api/adapters.js';
import { HomePage } from './pages/home/HomePage';
import { CheckoutPage } from './pages/checkout/CheckoutPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { TrackingPage } from './pages/TrackingPage';
import { PaymentPage } from './pages/payment/PaymentPage';
import { NotFoundPage } from './pages/not_found/NotFoundPage';

function App() {
  const [cart, setCart] = useState([]);
  const [cartMeta, setCartMeta] = useState({ subtotalPaise: 0, totalQuantity: 0 });

  const loadCart = useCallback(async () => {
    try {
      const response = await cartApi.getCart();
      const rawItems = response?.cart?.items || [];
      const adaptedItems = rawItems.map(adaptCartItem);
      setCart(adaptedItems);
      setCartMeta({
        subtotalPaise: Number(response?.cart?.subtotal_paise ?? 0),
        totalQuantity: Number(response?.cart?.total_quantity ?? adaptedItems.reduce((s, i) => s + i.quantity, 0)),
      });
    } catch {
      // Unauthenticated or empty cart gracefully defaults to empty array
      setCart([]);
      setCartMeta({ subtotalPaise: 0, totalQuantity: 0 });
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  return (
    <Routes>
      <Route path="/" element={<HomePage cart={cart} loadCart={loadCart} />} />
      <Route path="checkout" element={<CheckoutPage cart={cart} cartMeta={cartMeta} loadCart={loadCart} />} />
      <Route path="orders" element={<OrdersPage cart={cart} loadCart={loadCart} />} />
      <Route path="tracking/:orderId/:productId" element={<TrackingPage cart={cart} />} />
      <Route path="payment" element={<PaymentPage cart={cart} cartMeta={cartMeta} loadCart={loadCart} />} />
      <Route path="*" element={<NotFoundPage cart={cart} />} />
    </Routes>
  );
}

export default App;
