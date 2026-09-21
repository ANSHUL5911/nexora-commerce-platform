import { Routes, Route } from 'react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { cartApi } from './api/cart.js';
import { authApi } from './api/auth.js';
import { productsApi } from './api/products.js';
import { getGuestCart, hydrateGuestCartItems, clearGuestCart, removeGuestCartItem } from './api/guestCart.js';
import { adaptCartItem } from './api/adapters.js';
import { HomePage } from './pages/home/HomePage.jsx';
import { ProductDetailPage } from './pages/product/ProductDetailPage.jsx';
import { CartPage } from './pages/cart/CartPage.jsx';
import { CheckoutPage } from './pages/checkout/CheckoutPage.jsx';
import { OrdersPage } from './pages/orders/OrdersPage.jsx';
import { TrackingPage } from './pages/TrackingPage.jsx';
import { PaymentPage } from './pages/payment/PaymentPage.jsx';
import { NotFoundPage } from './pages/not_found/NotFoundPage.jsx';
import { AdminRoute } from './components/auth/AdminRoute.jsx';
import { CustomerRoute } from './components/auth/CustomerRoute.jsx';
import { AdminPage } from './pages/admin/AdminPage.jsx';

function App() {
  const [cart, setCart] = useState([]);
  const [cartMeta, setCartMeta] = useState({ subtotalPaise: 0, totalQuantity: 0 });
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const loadCart = useCallback(async (userOverride) => {
    const user = userOverride !== undefined ? userOverride : currentUserRef.current;

    // Administrators must not query customer cart endpoints
    if (user?.role === 'admin') {
      setCart([]);
      setCartMeta({ subtotalPaise: 0, totalQuantity: 0 });
      return;
    }

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

  const migrateGuestCartToServer = useCallback(async (userOverride) => {
    const user = userOverride !== undefined ? userOverride : currentUserRef.current;
    // Administrators must not migrate customer guest carts
    if (user?.role === 'admin') return;

    try {
      const rawGuestItems = getGuestCart();
      if (!rawGuestItems || rawGuestItems.length === 0) return;

      for (const item of rawGuestItems) {
        try {
          await cartApi.addItem({ productId: item.productId, quantity: item.quantity });
          // Invariant: remove item locally ONLY after confirmed successful POST
          removeGuestCartItem(item.productId);
        } catch (err) {
          console.error('Failed to transfer guest cart item to server cart:', err);
          // Invariant: preserve failed/unmigrated item in localStorage
        }
      }

      const remainingItems = getGuestCart();
      if (remainingItems.length === 0) {
        clearGuestCart();
      }
    } catch (err) {
      console.error('Failed to read guest cart for transfer:', err);
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const res = await authApi.getCurrentUser();
      const user = res?.user || null;
      if (user) {
        if (user.role !== 'admin') {
          await migrateGuestCartToServer(user);
          await loadCart(user);
        } else {
          setCart([]);
          setCartMeta({ subtotalPaise: 0, totalQuantity: 0 });
        }
        setCurrentUser(user);
        currentUserRef.current = user;
      } else {
        setCurrentUser(null);
        currentUserRef.current = null;
        await loadCart(null);
      }
    } catch {
      setCurrentUser(null);
      currentUserRef.current = null;
      await loadCart(null);
    } finally {
      setAuthLoading(false);
    }
  }, [loadCart, migrateGuestCartToServer]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleAuthChange = useCallback(async (user) => {
    if (user) {
      if (user.role !== 'admin') {
        await migrateGuestCartToServer(user);
        await loadCart(user);
      } else {
        setCart([]);
        setCartMeta({ subtotalPaise: 0, totalQuantity: 0 });
      }
      setCurrentUser(user);
      currentUserRef.current = user;
    } else {
      setCurrentUser(null);
      currentUserRef.current = null;
      await loadCart(null);
    }
  }, [loadCart, migrateGuestCartToServer]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <HomePage
              cart={cart}
              loadCart={loadCart}
              currentUser={currentUser}
              authLoading={authLoading}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="product/:productId"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <ProductDetailPage
              cart={cart}
              loadCart={loadCart}
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="products/:productId"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <ProductDetailPage
              cart={cart}
              loadCart={loadCart}
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="products/*"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <ProductDetailPage
              cart={cart}
              loadCart={loadCart}
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="cart"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <CartPage
              cart={cart}
              loadCart={loadCart}
              currentUser={currentUser}
              authLoading={authLoading}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="checkout"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <CheckoutPage
              cart={cart}
              cartMeta={cartMeta}
              loadCart={loadCart}
              currentUser={currentUser}
              authLoading={authLoading}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="orders"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <OrdersPage
              cart={cart}
              loadCart={loadCart}
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="tracking/:orderId/:productId"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <TrackingPage
              cart={cart}
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="payment"
        element={
          <CustomerRoute currentUser={currentUser} authLoading={authLoading}>
            <PaymentPage
              cart={cart}
              cartMeta={cartMeta}
              loadCart={loadCart}
            />
          </CustomerRoute>
        }
      />
      <Route
        path="admin"
        element={
          <AdminRoute currentUser={currentUser} authLoading={authLoading}>
            <AdminPage
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </AdminRoute>
        }
      />
      <Route
        path="admin/*"
        element={
          <AdminRoute currentUser={currentUser} authLoading={authLoading}>
            <AdminPage
              currentUser={currentUser}
              onAuthChange={handleAuthChange}
            />
          </AdminRoute>
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

