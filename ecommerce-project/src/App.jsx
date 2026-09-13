import { Routes, Route } from 'react-router';
import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { cartApi } from './api/cart.js';
import { authApi } from './api/auth.js';
import { adaptCartItem } from './api/adapters.js';
import { HomePage } from './pages/home/HomePage.jsx';
import { ProductDetailPage } from './pages/product/ProductDetailPage.jsx';
import { CartPage } from './pages/cart/CartPage.jsx';
import { CheckoutPage } from './pages/checkout/CheckoutPage.jsx';
import { OrdersPage } from './pages/orders/OrdersPage.jsx';
import { TrackingPage } from './pages/TrackingPage.jsx';
import { PaymentPage } from './pages/payment/PaymentPage.jsx';
import { NotFoundPage } from './pages/not_found/NotFoundPage.jsx';

function App() {
  const [cart, setCart] = useState([]);
  const [cartMeta, setCartMeta] = useState({ subtotalPaise: 0, totalQuantity: 0 });
  const [currentUser, setCurrentUser] = useState(null);

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

  const loadSession = useCallback(async () => {
    try {
      const res = await authApi.getCurrentUser();
      if (res?.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    loadCart();
    loadSession();
  }, [loadCart, loadSession]);

  const handleAuthChange = useCallback((user) => {
    setCurrentUser(user);
    loadCart();
  }, [loadCart]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <HomePage
            cart={cart}
            loadCart={loadCart}
            currentUser={currentUser}
            onAuthChange={handleAuthChange}
          />
        }
      />
      <Route
        path="product/:productId"
        element={
          <ProductDetailPage
            cart={cart}
            loadCart={loadCart}
            currentUser={currentUser}
            onAuthChange={handleAuthChange}
          />
        }
      />
      <Route
        path="cart"
        element={
          <CartPage
            cart={cart}
            loadCart={loadCart}
            currentUser={currentUser}
            onAuthChange={handleAuthChange}
          />
        }
      />
      <Route
        path="checkout"
        element={
          <CheckoutPage
            cart={cart}
            cartMeta={cartMeta}
            loadCart={loadCart}
          />
        }
      />
      <Route
        path="orders"
        element={
          <OrdersPage
            cart={cart}
            loadCart={loadCart}
            currentUser={currentUser}
            onAuthChange={handleAuthChange}
          />
        }
      />
      <Route
        path="tracking/:orderId/:productId"
        element={
          <TrackingPage
            cart={cart}
            currentUser={currentUser}
            onAuthChange={handleAuthChange}
          />
        }
      />
      <Route
        path="payment"
        element={
          <PaymentPage
            cart={cart}
            cartMeta={cartMeta}
            loadCart={loadCart}
          />
        }
      />
      <Route
        path="*"
        element={
          <NotFoundPage
            cart={cart}
            currentUser={currentUser}
            onAuthChange={handleAuthChange}
          />
        }
      />
    </Routes>
  );
}

export default App;
