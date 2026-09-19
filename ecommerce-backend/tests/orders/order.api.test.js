import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import {
  createTestProduct,
  createTestCart,
  createTestCartItem,
  createTestOrder,
  createTestOrderItem,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.7 — Order API Integration & Security Tests', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanupOrderTables();
  });

  afterAll(async () => {
    await cleanupOrderTables();
  });

  // Helper to create and authenticate a test user
  async function createAndLoginUser({
    email,
    password = 'Password123!',
    fullName = 'Test Customer',
    role = 'customer',
  } = {}) {
    const userEmail = email || `user-${crypto.randomUUID()}@example.com`;
    const password_hash = await hashPassword(password);
    const user = await User.create({
      id: crypto.randomUUID(),
      email: userEmail.toLowerCase(),
      password_hash,
      full_name: fullName,
      role,
      is_active: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
      .send({ email: userEmail, password });

    const cookies = res.headers['set-cookie'] || [];
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

    const sid = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
    const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

    return {
      user,
      sid,
      csrfToken,
      cookieHeader: [`${SESSION_COOKIE_NAME}=${sid}`, `${CSRF_COOKIE_NAME}=${csrfToken}`].join('; '),
    };
  }

  const validAddress = {
    fullName: 'Jane Doe',
    addressLine1: '123 Tech Park Way',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    phone: '9876543210',
  };

  describe('1. Authentication Enforcement (401)', () => {
    it('returns 401 UNAUTHENTICATED on unauthenticated POST /api/orders', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 401 UNAUTHENTICATED on unauthenticated GET /api/orders', async () => {
      const res = await request(app).get('/api/orders');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 401 UNAUTHENTICATED on unauthenticated GET /api/orders/:orderId', async () => {
      const res = await request(app).get(`/api/orders/${crypto.randomUUID()}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('2. CSRF Protection (403)', () => {
    it('returns 403 CSRF_TOKEN_MISSING when CSRF token header is missing on POST /api/orders', async () => {
      const auth = await createAndLoginUser();

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${auth.sid}`)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('returns 403 CSRF_INVALID when CSRF token is mismatched on POST /api/orders', async () => {
      const auth = await createAndLoginUser();

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, 'invalid_csrf_token_value_here_1234567890')
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  describe('3. Strict Zod Validation & Parameter Tampering Defenses', () => {
    it('rejects client attempts to pass price, totalCostPaise, status, or userId', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct();
      const cart = await createTestCart({ userId: auth.user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
          totalCostPaise: 100, // Malicious client override
          order_status: 'PAID', // Malicious status override
          userId: crypto.randomUUID(), // Malicious user override
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid shipping address pincode format', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct();
      const cart = await createTestCart({ userId: auth.user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          shippingAddress: {
            ...validAddress,
            pincode: '000123', // Invalid Indian pincode (starts with 0)
          },
          shippingMethod: 'STANDARD',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid or unknown shipping method', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct();
      const cart = await createTestCart({ userId: auth.user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'INVALID_SPEED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('4. Anti-IDOR Authorization Defenses', () => {
    it('returns sanitized 404 ORDER_NOT_FOUND when User B attempts to access User A order', async () => {
      const userA = await createAndLoginUser();
      const userB = await createAndLoginUser();

      const product = await createTestProduct();
      const order = await createTestOrder({ userId: userA.user.id });
      await createTestOrderItem({ orderId: order.id, productId: product.id });

      // User A can access own order
      const resA = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Cookie', userA.cookieHeader);

      expect(resA.status).toBe(200);
      expect(resA.body.data.id).toBe(order.id);

      // User B receives sanitized 404 (no existence leak)
      const resB = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Cookie', userB.cookieHeader);

      expect(resB.status).toBe(404);
      expect(resB.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('order listing is strictly scoped to the authenticated customer', async () => {
      const userA = await createAndLoginUser();
      const userB = await createAndLoginUser();

      await createTestOrder({ userId: userA.user.id });
      await createTestOrder({ userId: userA.user.id });

      const resB = await request(app)
        .get('/api/orders')
        .set('Cookie', userB.cookieHeader);

      expect(resB.status).toBe(200);
      expect(resB.body.data).toHaveLength(0);
      expect(resB.body.pagination.totalItems).toBe(0);

      const resA = await request(app)
        .get('/api/orders')
        .set('Cookie', userA.cookieHeader);

      expect(resA.status).toBe(200);
      expect(resA.body.data).toHaveLength(2);
      expect(resA.body.pagination.totalItems).toBe(2);
    });
  });

  describe('5. Payment Boundary Verification', () => {
    it('successful order creation leaves order in PENDING_PAYMENT without Razorpay calls or secrets', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ pricePaise: 50000 });
      const cart = await createTestCart({ userId: auth.user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', `order_key_${crypto.randomUUID()}`)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING_PAYMENT');
      expect(res.body.data.orderStatus).toBe('PENDING_PAYMENT');

      // Check that no payment secrets, card numbers, or foreign structures leak
      expect(res.body.data.razorpayOrderId).toBeUndefined();
      expect(res.body.data.razorpaySignature).toBeUndefined();
      expect(res.body.data.cardNumber).toBeUndefined();
      expect(res.body.data.cvv).toBeUndefined();
    });
  });

  describe('6. Order Item Product Association and Image URL Eager Loading', () => {
    it('GET /api/orders returns imageUrl on each order item matching Product.image_url', async () => {
      const auth = await createAndLoginUser();
      const product1 = await createTestProduct({
        name: 'Linen Canvas Utility Overshirt',
        imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=80',
      });
      const product2 = await createTestProduct({
        name: 'Polarized Titanium Aviator Sunglasses',
        imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
      });

      const order = await createTestOrder({ userId: auth.user.id });
      await createTestOrderItem({
        orderId: order.id,
        productId: product1.id,
        productNameSnapshot: product1.name,
      });
      await createTestOrderItem({
        orderId: order.id,
        productId: product2.id,
        productNameSnapshot: product2.name,
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);

      const items = res.body.data[0].items;
      expect(items).toHaveLength(2);

      const item1 = items.find((i) => i.productId === product1.id);
      expect(item1).toBeDefined();
      expect(item1.productName).toBe('Linen Canvas Utility Overshirt');
      expect(item1.imageUrl).toBe(product1.image_url);

      const item2 = items.find((i) => i.productId === product2.id);
      expect(item2).toBeDefined();
      expect(item2.productName).toBe('Polarized Titanium Aviator Sunglasses');
      expect(item2.imageUrl).toBe(product2.image_url);
    });

    it('GET /api/orders/:orderId also returns imageUrl for each order item', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({
        name: 'Monolith Architectural Coat',
        imageUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce667883?auto=format&fit=crop&w=800&q=80',
      });

      const order = await createTestOrder({ userId: auth.user.id });
      await createTestOrderItem({
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: product.name,
      });

      const res = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].imageUrl).toBe(product.image_url);
    });
  });
});
