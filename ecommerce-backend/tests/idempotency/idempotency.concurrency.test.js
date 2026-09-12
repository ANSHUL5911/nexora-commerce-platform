import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { User, Order, InventoryReservation, Cart, CartItem } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import {
  createTestProduct,
  cleanupPaymentTables,
} from '../payments/helpers/paymentTestFixtures.js';

describe('Phase 07.10 — Real PostgreSQL Idempotency Concurrency Tests', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanupPaymentTables();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

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

  describe('TEST 1 — 10 simultaneous identical order requests', () => {
    it('results in exactly 1 Order, 1 inventory reservation, 1 cart clear, with zero duplicate orders or overselling', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, pricePaise: 100000 });

      // Setup user's cart with 2 units of product
      const cart = await Cart.create({ id: crypto.randomUUID(), user_id: auth.user.id });
      await CartItem.create({ id: crypto.randomUUID(), cart_id: cart.id, product_id: product.id, quantity: 2 });

      const idempotencyKey = `order_key_${crypto.randomUUID()}`;
      const payload = {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      };

      // Fire 10 simultaneous identical POST /api/orders requests
      const promises = Array.from({ length: 10 }).map((_, i) =>
        request(app)
          .post('/api/orders')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .set('Idempotency-Key', idempotencyKey)
          .set('X-Forwarded-For', `192.168.1.${10 + i}`)
          .send(payload)
      );

      const responses = await Promise.all(promises);

      // Exactly 1 request succeeds with 201 Created (or receives replayed 201)
      const successResponses = responses.filter((r) => r.status === 201);
      const inProgressResponses = responses.filter((r) => r.status === 409);

      expect(successResponses.length).toBeGreaterThanOrEqual(1);
      expect(successResponses.length + inProgressResponses.length).toBe(10);

      // Verify that all successful/replayed responses reference the exact same order ID
      const orderIds = successResponses.map((r) => r.body.data?.id || r.body.id);
      const uniqueOrderIds = [...new Set(orderIds)];
      expect(uniqueOrderIds.length).toBe(1);

      // Verify Database: Exactly 1 Order row exists
      const totalOrders = await Order.count({ where: { user_id: auth.user.id } });
      expect(totalOrders).toBe(1);

      // Verify Database: Exactly 1 InventoryReservation exists for 2 units
      const reservations = await InventoryReservation.findAll({ where: { order_id: uniqueOrderIds[0] } });
      expect(reservations.length).toBe(1);
      expect(reservations[0].quantity).toBe(2);

      // Verify Database: Stock and reserved counters
      await product.reload();
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(2);

      // Verify Database: Cart items cleared
      const remainingCartItems = await CartItem.count({ where: { cart_id: cart.id } });
      expect(remainingCartItems).toBe(0);
    });
  });

  describe('TEST 2 — Same Key, Different Request Body', () => {
    it('allows Request A to succeed and rejects Request B with 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });

      const cart = await Cart.create({ id: crypto.randomUUID(), user_id: auth.user.id });
      await CartItem.create({ id: crypto.randomUUID(), cart_id: cart.id, product_id: product.id, quantity: 1 });

      const sharedKey = `shared_key_${crypto.randomUUID()}`;

      // Request A
      const resA = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', sharedKey)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(resA.status).toBe(201);
      expect(resA.body.data.id).toBeDefined();

      // Request B: Same key, different shipping method (EXPRESS)
      const resB = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', sharedKey)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'EXPRESS',
        });

      expect(resB.status).toBe(409);
      expect(resB.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');

      // Zero additional orders created
      const totalOrders = await Order.count({ where: { user_id: auth.user.id } });
      expect(totalOrders).toBe(1);
    });
  });

  describe('TEST 3 — Two Different Users, Same Idempotency Key', () => {
    it('isolates idempotency scoping across users and prevents cross-user response leakage', async () => {
      const userA = await createAndLoginUser();
      const userB = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });

      // User A cart
      const cartA = await Cart.create({ id: crypto.randomUUID(), user_id: userA.user.id });
      await CartItem.create({ id: crypto.randomUUID(), cart_id: cartA.id, product_id: product.id, quantity: 1 });

      // User B cart
      const cartB = await Cart.create({ id: crypto.randomUUID(), user_id: userB.user.id });
      await CartItem.create({ id: crypto.randomUUID(), cart_id: cartB.id, product_id: product.id, quantity: 1 });

      const sameKey = `collision_key_${crypto.randomUUID()}`;

      // User A creates order with sameKey
      const resA = await request(app)
        .post('/api/orders')
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken)
        .set('Idempotency-Key', sameKey)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(resA.status).toBe(201);
      const orderAId = resA.body.data.id;

      // User B submits same key on same endpoint
      // Because actor identity is embedded in request_hash, User B encounters payload mismatch / conflict
      const resB = await request(app)
        .post('/api/orders')
        .set('Cookie', userB.cookieHeader)
        .set(CSRF_HEADER_NAME, userB.csrfToken)
        .set('Idempotency-Key', sameKey)
        .send({
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(resB.status).toBe(409);
      expect(resB.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      expect(resB.body).not.toEqual(resA.body);

      // User B's cart remains intact and untouched
      const cartBItems = await CartItem.count({ where: { cart_id: cartB.id } });
      expect(cartBItems).toBe(1);

      // Verify User B did not get User A's order ID
      expect(JSON.stringify(resB.body)).not.toContain(orderAId);
    });
  });

  describe('TEST 4 — Completed Response Replay', () => {
    it('returns exact same response on duplicate identical request without DB mutation', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });

      const cart = await Cart.create({ id: crypto.randomUUID(), user_id: auth.user.id });
      await CartItem.create({ id: crypto.randomUUID(), cart_id: cart.id, product_id: product.id, quantity: 1 });

      const key = `replay_order_key_${crypto.randomUUID()}`;
      const payload = {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      };

      // Request 1
      const res1 = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res1.status).toBe(201);
      const orderId1 = res1.body.data.id;

      // Request 2 (Identical retry)
      const res2 = await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      expect(res2.body.data.id).toBe(orderId1);

      // Exactly 1 order in database
      const totalOrders = await Order.count({ where: { user_id: auth.user.id } });
      expect(totalOrders).toBe(1);
    });
  });
});
