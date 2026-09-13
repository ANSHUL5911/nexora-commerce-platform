import { it, expect, describe, vi, beforeEach } from 'vitest';
import apiClient from './client.js';
import { authApi } from './auth.js';
import { productsApi } from './products.js';
import { cartApi } from './cart.js';
import { checkoutApi } from './checkout.js';
import { paymentsApi } from './payments.js';
import { ordersApi } from './orders.js';

vi.mock('./client.js', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  return {
    default: mockClient,
    apiClient: mockClient,
    generateIdempotencyKey: () => 'test-idempotency-key',
    getCsrfToken: () => 'test-csrf-token',
  };
});

describe('API Services Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authApi', () => {
    it('calls POST /auth/login with credentials', async () => {
      apiClient.post.mockResolvedValue({ data: { user: { id: 'u-1', email: 'test@nexora.com' } } });
      const result = await authApi.login({ email: 'test@nexora.com', password: 'password123' });
      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@nexora.com',
        password: 'password123',
      });
      expect(result.user.email).toBe('test@nexora.com');
    });

    it('calls POST /auth/logout', async () => {
      apiClient.post.mockResolvedValue({ data: { message: 'Logged out successfully' } });
      const result = await authApi.logout();
      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('productsApi', () => {
    it('calls GET /products with query parameters', async () => {
      apiClient.get.mockResolvedValue({ data: { products: [], pagination: {} } });
      await productsApi.listProducts({ search: 'socks', page: 1, limit: 10 });
      expect(apiClient.get).toHaveBeenCalledWith('/products', {
        params: { search: 'socks', page: 1, limit: 10 },
      });
    });

    it('calls GET /products/:id', async () => {
      apiClient.get.mockResolvedValue({ data: { product: { id: 'p-1' } } });
      const result = await productsApi.getProductById('p-1');
      expect(apiClient.get).toHaveBeenCalledWith('/products/p-1');
      expect(result.product.id).toBe('p-1');
    });
  });

  describe('cartApi', () => {
    it('calls GET /cart', async () => {
      apiClient.get.mockResolvedValue({ data: { items: [], subtotal_paise: 0 } });
      await cartApi.getCart();
      expect(apiClient.get).toHaveBeenCalledWith('/cart');
    });

    it('calls POST /cart/items to add an item', async () => {
      apiClient.post.mockResolvedValue({ data: { item: { id: 'item-1', product_id: 'p-1', quantity: 2 } } });
      await cartApi.addItem({ productId: 'p-1', quantity: 2 });
      expect(apiClient.post).toHaveBeenCalledWith('/cart/items', {
        productId: 'p-1',
        quantity: 2,
      });
    });

    it('calls PATCH /cart/items/:itemId to update quantity', async () => {
      apiClient.patch.mockResolvedValue({ data: { item: { id: 'item-1', quantity: 3 } } });
      await cartApi.updateItem('item-1', { quantity: 3 });
      expect(apiClient.patch).toHaveBeenCalledWith('/cart/items/item-1', {
        quantity: 3,
      });
    });

    it('calls DELETE /cart/items/:itemId to remove an item', async () => {
      apiClient.delete.mockResolvedValue({ data: { message: 'Item removed' } });
      await cartApi.removeItem('item-1');
      expect(apiClient.delete).toHaveBeenCalledWith('/cart/items/item-1');
    });
  });

  describe('checkoutApi', () => {
    it('calls POST /checkout/initiate with shipping info and returns order & optional guestToken', async () => {
      apiClient.post.mockResolvedValue({
        data: {
          order: { id: 'order-123', order_status: 'PENDING_PAYMENT', total_cost_paise: 50000 },
          guestToken: 'guest-jwt-token',
        },
      });

      const payload = {
        shippingAddress: {
          fullName: 'John Doe',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          phone: '9876543210',
        },
        shippingMethod: 'STANDARD',
      };

      const result = await checkoutApi.initiateCheckout(payload);
      expect(apiClient.post).toHaveBeenCalledWith('/checkout/initiate', payload, {
        headers: { 'Idempotency-Key': 'test-idempotency-key' },
      });
      expect(result.order.id).toBe('order-123');
      expect(result.guestToken).toBe('guest-jwt-token');
    });
  });

  describe('paymentsApi', () => {
    it('calls POST /payments/create-order with orderId and optional X-Guest-Token header', async () => {
      apiClient.post.mockResolvedValue({
        data: {
          razorpayOrderId: 'order_rzp_1',
          amount: 50000,
          currency: 'INR',
          keyId: 'rzp_test_key',
        },
      });

      const result = await paymentsApi.createPaymentOrder({
        orderId: 'order-123',
        guestToken: 'guest-token-xyz',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/payments/create-order',
        { orderId: 'order-123' },
        {
          headers: {
            'Idempotency-Key': 'test-idempotency-key',
            'X-Guest-Token': 'guest-token-xyz',
          },
        }
      );
      expect(result.razorpayOrderId).toBe('order_rzp_1');
    });

    it('calls POST /payments/retry with orderId', async () => {
      apiClient.post.mockResolvedValue({
        data: {
          razorpayOrderId: 'order_rzp_2',
          amount: 50000,
          currency: 'INR',
        },
      });

      await paymentsApi.retryPayment({
        orderId: 'order-123',
        guestToken: 'guest-token-xyz',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/payments/retry',
        { orderId: 'order-123' },
        {
          headers: {
            'Idempotency-Key': 'test-idempotency-key',
            'X-Guest-Token': 'guest-token-xyz',
          },
        }
      );
    });

    it('calls POST /payments/verify with signature and payment ID', async () => {
      apiClient.post.mockResolvedValue({
        data: {
          status: 'SUCCESS',
          message: 'Payment verified',
        },
      });

      await paymentsApi.verifyPayment({
        orderId: 'order-123',
        razorpayPaymentId: 'pay_123',
        razorpayOrderId: 'order_rzp_1',
        razorpaySignature: 'sig_abc',
        guestToken: 'guest-token-xyz',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/payments/verify',
        {
          orderId: 'order-123',
          razorpayPaymentId: 'pay_123',
          razorpayOrderId: 'order_rzp_1',
          razorpaySignature: 'sig_abc',
        },
        {
          headers: {
            'Idempotency-Key': 'test-idempotency-key',
            'X-Guest-Token': 'guest-token-xyz',
          },
        }
      );
    });
  });

  describe('ordersApi', () => {
    it('calls GET /orders', async () => {
      apiClient.get.mockResolvedValue({ data: { orders: [], pagination: {} } });
      await ordersApi.listOrders();
      expect(apiClient.get).toHaveBeenCalledWith('/orders', { params: {} });
    });

    it('calls canonical GET /orders/:id with X-Guest-Token header if guest', async () => {
      apiClient.get.mockResolvedValue({ data: { order: { id: 'ord-1' } } });
      await ordersApi.getOrder('ord-1', { guestToken: 'guest-tok' });
      expect(apiClient.get).toHaveBeenCalledWith('/orders/ord-1', {
        headers: { 'X-Guest-Token': 'guest-tok' },
      });
    });
  });
});
