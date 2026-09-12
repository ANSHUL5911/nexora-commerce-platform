import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { Order, OrderItem, InventoryReservation, User } from '../../src/models/index.js';
import { hashGuestToken } from '../../src/modules/orders/guestToken.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import {
  createTestProduct,
  createTestOrder,
  createTestOrderItem,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.11 — Guest Checkout API, Anti-IDOR & Order Lifecycle Tests', () => {
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

  const validAddress = {
    fullName: 'Rohan Sharma',
    addressLine1: '42 MG Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    phone: '+919876543210',
  };

  function getCsrfPair() {
    const token = crypto.randomBytes(32).toString('hex');
    return {
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      token,
    };
  }

  async function createAuthenticatedUser({
    email = `user-${crypto.randomUUID()}@example.com`,
    password = 'Password123!',
    role = 'customer',
  } = {}) {
    const password_hash = await hashPassword(password);
    const user = await User.create({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      password_hash,
      full_name: 'Auth Customer',
      role,
      is_active: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
      .send({ email, password });

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

  describe('1. Unified Checkout Initiation for Guests (POST /api/checkout/initiate)', () => {
    it('creates a real Order, OrderItems, InventoryReservation and returns raw guestToken once', async () => {
      const product = await createTestProduct({
        pricePaise: 299900,
        stockQuantity: 10,
        reservedQuantity: 0,
      });

      const idempotencyKey = crypto.randomUUID();
      const ip = '192.168.1.101';
      const csrf = getCsrfPair();

      const res = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', ip)
        .set('Idempotency-Key', idempotencyKey)
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 2 }],
          shippingAddress: validAddress,
          shippingMethod: 'EXPRESS',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const orderData = res.body.data;
      expect(orderData.id).toBeDefined();
      expect(orderData.orderStatus).toBe('PENDING_PAYMENT');
      expect(orderData.userId).toBeNull();
      expect(orderData.subtotalPaise).toBe(599800); // 299900 * 2
      expect(orderData.shippingFeePaise).toBe(10000); // EXPRESS = ₹100
      expect(orderData.totalCostPaise).toBe(609800);
      expect(orderData.guestToken).toBeDefined();
      expect(orderData.guestToken).toHaveLength(64);

      // Verify PostgreSQL database invariants
      const dbOrder = await Order.findByPk(orderData.id);
      expect(dbOrder).not.toBeNull();
      expect(dbOrder.user_id).toBeNull();
      expect(dbOrder.guest_token_hash).toBeDefined();
      expect(dbOrder.guest_token_hash).toHaveLength(64);
      // Raw token is NEVER stored in database
      expect(dbOrder.guest_token_hash).not.toBe(orderData.guestToken);
      // Stored hash equals SHA-256 of raw token
      expect(dbOrder.guest_token_hash).toBe(hashGuestToken(orderData.guestToken));

      // Verify OrderItem snapshot
      const dbItems = await OrderItem.findAll({ where: { order_id: dbOrder.id } });
      expect(dbItems).toHaveLength(1);
      expect(dbItems[0].product_id).toBe(product.id);
      expect(dbItems[0].product_name_snapshot).toBe(product.name);
      expect(Number(dbItems[0].unit_price_paise)).toBe(299900);
      expect(dbItems[0].quantity).toBe(2);

      // Verify InventoryReservation
      const dbReservations = await InventoryReservation.findAll({ where: { order_id: dbOrder.id } });
      expect(dbReservations).toHaveLength(1);
      expect(dbReservations[0].product_id).toBe(product.id);
      expect(dbReservations[0].quantity).toBe(2);
      expect(dbReservations[0].status).toBe('ACTIVE');

      // Verify Product reserved_quantity incremented
      await product.reload();
      expect(product.reserved_quantity).toBe(2);
    });

    it('rejects guest checkout when requested quantity exceeds available stock', async () => {
      const product = await createTestProduct({
        stockQuantity: 2,
        reservedQuantity: 1, // Available = 1
      });

      const csrf = getCsrfPair();
      const res = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.102')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 2 }], // Exceeds available 1
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Assert no orphaned Order was created
      const orderCount = await Order.count();
      expect(orderCount).toBe(0);
    });
  });

  describe('2. Guest Order Tracking & Retrieval (GET /api/orders/guest/:orderId)', () => {
    it('returns sanitized OrderDTO when canonical X-Guest-Token is valid', async () => {
      const product = await createTestProduct();
      const csrf = getCsrfPair();
      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.103')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const orderId = checkoutRes.body.data.id;
      const rawGuestToken = checkoutRes.body.data.guestToken;

      const trackRes = await request(app)
        .get(`/api/orders/guest/${orderId}`)
        .set('X-Forwarded-For', '192.168.1.103')
        .set('X-Guest-Token', rawGuestToken);

      expect(trackRes.status).toBe(200);
      expect(trackRes.body.success).toBe(true);

      const order = trackRes.body.data;
      expect(order.id).toBe(orderId);
      expect(order.orderStatus).toBe('PENDING_PAYMENT');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].productName).toBe(product.name);
      expect(order.shippingAddress.fullName).toBe(validAddress.fullName);

      // Security Check: token hash and raw token are NOT present in GET response
      expect(order.guest_token_hash).toBeUndefined();
      expect(order.guestToken).toBeUndefined();
      expect(trackRes.body.guestToken).toBeUndefined();
    });

    it('returns sanitized 404 ORDER_NOT_FOUND when X-Guest-Token is mismatched or invalid', async () => {
      const product = await createTestProduct();
      const csrf = getCsrfPair();
      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.104')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const orderId = checkoutRes.body.data.id;
      const wrongGuestToken = crypto.randomBytes(32).toString('hex');

      const trackRes = await request(app)
        .get(`/api/orders/guest/${orderId}`)
        .set('X-Forwarded-For', '192.168.1.104')
        .set('X-Guest-Token', wrongGuestToken);

      expect(trackRes.status).toBe(404);
      expect(trackRes.body.error.code).toBe('ORDER_NOT_FOUND');
      expect(trackRes.body.error.message).toBe('Order was not found.');
    });

    it('returns sanitized 404 ORDER_NOT_FOUND when X-Guest-Token header is missing', async () => {
      const product = await createTestProduct();
      const csrf = getCsrfPair();
      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.105')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const orderId = checkoutRes.body.data.id;

      const trackRes = await request(app)
        .get(`/api/orders/guest/${orderId}`)
        .set('X-Forwarded-For', '192.168.1.105');

      expect(trackRes.status).toBe(404);
      expect(trackRes.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('returns sanitized 404 ORDER_NOT_FOUND when guest token is expired (> 30 days)', async () => {
      const rawGuestToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashGuestToken(rawGuestToken);

      // Create an order created 35 days ago
      const expiredCreatedAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const order = await createTestOrder({
        userId: null,
        guestTokenHash: tokenHash,
      });

      // Update created_at in PostgreSQL
      await Order.update(
        { created_at: expiredCreatedAt },
        { where: { id: order.id }, silent: true }
      );

      const trackRes = await request(app)
        .get(`/api/orders/guest/${order.id}`)
        .set('X-Forwarded-For', '192.168.1.106')
        .set('X-Guest-Token', rawGuestToken);

      expect(trackRes.status).toBe(404);
      expect(trackRes.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('3. Strict Anti-IDOR & Boundary Isolation', () => {
    it('Anti-IDOR: Guest A token cannot access Guest B order (returns sanitized 404)', async () => {
      const product = await createTestProduct();
      const csrfA = getCsrfPair();
      const csrfB = getCsrfPair();

      // Guest A checkout
      const resA = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.110')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrfA.cookie)
        .set(CSRF_HEADER_NAME, csrfA.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: { ...validAddress, fullName: 'Guest A' },
          shippingMethod: 'STANDARD',
        });

      // Guest B checkout
      const resB = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.111')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrfB.cookie)
        .set(CSRF_HEADER_NAME, csrfB.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: { ...validAddress, fullName: 'Guest B' },
          shippingMethod: 'STANDARD',
        });

      const orderIdB = resB.body.data.id;
      const guestTokenA = resA.body.data.guestToken;

      // Guest A attempts to access Guest B's order
      const idorRes = await request(app)
        .get(`/api/orders/guest/${orderIdB}`)
        .set('X-Forwarded-For', '192.168.1.110')
        .set('X-Guest-Token', guestTokenA);

      expect(idorRes.status).toBe(404);
      expect(idorRes.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('Authenticated Boundary: Guest token cannot access authenticated user order', async () => {
      const { user } = await createAuthenticatedUser();
      const product = await createTestProduct();

      const userOrder = await createTestOrder({
        userId: user.id,
        guestTokenHash: null,
      });
      await createTestOrderItem({ orderId: userOrder.id, productId: product.id });

      const randomGuestToken = crypto.randomBytes(32).toString('hex');

      const res = await request(app)
        .get(`/api/orders/guest/${userOrder.id}`)
        .set('X-Forwarded-For', '192.168.1.112')
        .set('X-Guest-Token', randomGuestToken);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('Authenticated Boundary: Authenticated customer without guest token cannot access guest order', async () => {
      const { cookieHeader, csrfToken } = await createAuthenticatedUser();
      const product = await createTestProduct();
      const csrf = getCsrfPair();

      const guestCheckoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.113')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const guestOrderId = guestCheckoutRes.body.data.id;

      // Authenticated customer queries GET /api/orders/:orderId without X-Guest-Token
      const res = await request(app)
        .get(`/api/orders/${guestOrderId}`)
        .set('Cookie', cookieHeader)
        .set(CSRF_HEADER_NAME, csrfToken)
        .set('X-Forwarded-For', '192.168.1.114');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('4. Generic GET /api/orders/:orderId with X-Guest-Token', () => {
    it('allows guest order retrieval via GET /api/orders/:orderId with X-Guest-Token header', async () => {
      const product = await createTestProduct();
      const csrf = getCsrfPair();
      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.1.115')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf.cookie)
        .set(CSRF_HEADER_NAME, csrf.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const orderId = checkoutRes.body.data.id;
      const rawGuestToken = checkoutRes.body.data.guestToken;

      const res = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('X-Forwarded-For', '192.168.1.115')
        .set('X-Guest-Token', rawGuestToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.guest_token_hash).toBeUndefined();
    });
  });
});
