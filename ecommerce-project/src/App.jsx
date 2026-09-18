import { Routes, Route } from 'react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { cartApi } from './api/cart.js';
import { authApi } from './api/auth.js';
import { productsApi } from './api/products.js';
import { getGuestCart, hydrateGuestCartItems } from './api/guestCart.js';
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
  const [authLoading, setAuthLoading] = useState(true);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const loadCart = useCallback(async (userOverride) => {
    const user = userOverride !== undefined ? userOverride : currentUserRef.current;

    if (user) {
      // Authenticated customer: load from server cart
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
        setCart([]);
        setCartMeta({ subtotalPaise: 0, totalQuantity: 0 });
      }
    } else {
      // Guest customer: load from localStorage without calling server cart endpoint
      try {
        const rawGuestItems = getGuestCart();
        const adaptedItems = await hydrateGuestCartItems(rawGuestItems, productsApi.getProductById);
        setCart(adaptedItems);
        const subtotal = adaptedItems.reduce((sum, item) => sum + (item.lineTotalPaise || 0), 0);
        const totalQty = adaptedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
        setCartMeta({ subtotalPaise: subtotal, totalQuantity: totalQty });
      } catch {
        setCart([]);
        setCartMeta({ subtotalPaise: 0, totalQuantity: 0 });
      }
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const res = await authApi.getCurrentUser();
      const user = res?.user || null;
      setCurrentUser(user);
      currentUserRef.current = user;
      await loadCart(user);
    } catch {
      setCurrentUser(null);
      currentUserRef.current = null;
      await loadCart(null);
    } finally {
      setAuthLoading(false);
    }
  }, [loadCart]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleAuthChange = useCallback((user) => {
    setCurrentUser(user);
    currentUserRef.current = user;
    loadCart(user);
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
            authLoading={authLoading}
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
            currentUser={currentUser}
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
