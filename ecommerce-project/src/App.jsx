import axios from 'axios';
import { Routes, Route } from 'react-router';
import { useState, useEffect } from 'react';
import './App.css';
import { HomePage } from './pages/home/HomePage';
import { CheckoutPage } from './pages/checkout/CheckoutPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { TrackingPage } from './pages/TrackingPage';


function App() {
  const [cart, setCart] = useState([]);

  useEffect(() => {

    const fetchAppData = async () => {
      const cartResponse = await axios.get('/api/cart-items?expand=product')
      setCart(cartResponse.data);
    };
    fetchAppData();
  }, []);

  return (
    <Routes>
      <Route path='/' element={<HomePage cart={cart} />} />
      <Route path='checkout' element={<CheckoutPage cart={cart} />} />
      <Route path="orders" element={<OrdersPage cart={cart} />} />
      <Route path="tracking" element={<TrackingPage />} />
    </Routes>

  )
}

export default App
