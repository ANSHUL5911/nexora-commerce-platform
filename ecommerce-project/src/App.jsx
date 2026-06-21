import axios from 'axios';
window.axios = axios;
import { Routes, Route } from 'react-router';
import { useState, useEffect } from 'react';
import './App.css';
import { HomePage } from './pages/home/HomePage';
import { CheckoutPage } from './pages/checkout/CheckoutPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { TrackingPage } from './pages/TrackingPage';
import { NotFoundPage } from './pages/not_found/NotFoundPage';


function App() {
  const [cart, setCart] = useState([]);

  const loadCart = async () => {
    const cartResponse = await axios.get('/api/cart-items?expand=product')
    setCart(cartResponse.data);
  };

  useEffect(() => {
    loadCart();
  }, []);

  return (
    <Routes>
      <Route path='/' element={<HomePage cart={cart} loadCart={loadCart} />} />
      <Route path='checkout' element={<CheckoutPage cart={cart} loadCart={loadCart} />} />
      <Route path="orders" element={<OrdersPage cart={cart} loadCart={loadCart} />} />
      <Route path="tracking/:orderId/:productId" element={<TrackingPage cart={cart} />} />
      <Route path="*" element={<NotFoundPage cart={cart} />} />
    </Routes>

  )
}

export default App
