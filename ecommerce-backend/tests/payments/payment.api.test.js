import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { User, Order, Product, PaymentAttempt } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import {
  createTestProduct,
  createTestOrder,
  createTestReservation,
  createTestPaymentAttempt,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';

describe('Phase 07.8 — Payment API Integration & Security Tests', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanupPaymentTables();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
    vi.restoreAllMocks();
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

  describe('1. Authentication & CSRF Protection', () => {
    it('returns 401 UNAUTHENTICATED when unauthenticated on POST /api/payments/create-order', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .send({ orderId: crypto.randomUUID() });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('returns 403 CSRF_TOKEN_MISSING when CSRF token header is missing on state-changing payment routes', async () => {
      const { cookieHeader } = await createAndLoginUser();

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', cookieHeader)
        .send({ orderId: crypto.randomUUID() });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('returns 403 CSRF_INVALID when CSRF token does not match cookie', async () => {
      const { cookieHeader } = await createAndLoginUser();

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', cookieHeader)
        .set(CSRF_HEADER_NAME, 'tampered_invalid_csrf_token')
        .send({ orderId: crypto.randomUUID() });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });
  });

  describe('2. POST /api/payments/create-order', () => {
    it('rejects unrecognized or tampered payload keys (price, amount, status)', async () => {
      const { cookieHeader, csrfToken } = await createAndLoginUser();

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', cookieHeader)
        .set(CSRF_HEADER_NAME, csrfToken)
        .send({
          orderId: crypto.randomUUID(),
          amount: 100,
          status: 'PAID',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns sanitized 404 ORDER_NOT_FOUND when customer attempts to pay another customer order', async () => {
      const userA = await createAndLoginUser({ email: 'owner@example.com' });
      const userB = await createAndLoginUser({ email: 'attacker@example.com' });

      const product = await createTestProduct();
      const orderA = await createTestOrder({ userId: userA.user.id });
      await createTestReservation({ orderId: orderA.id, productId: product.id });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', userB.cookieHeader)
        .set(CSRF_HEADER_NAME, userB.csrfToken)
        .send({ orderId: orderA.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('successfully initiates payment attempt and returns safe checkout DTO with zero leaked secrets', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ pricePaise: 299900, stockQuantity: 5, reservedQuantity: 1 });
      const order = await createTestOrder({
        userId: auth.user.id,
        totalCostPaise: 299900,
        orderStatus: 'PENDING_PAYMENT',
      });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 1 });

      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValue({
        id: 'order_rzp_mock_api_success',
        amount: 299900,
        currency: 'INR',
        status: 'created',
      });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ orderId: order.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(order.id);
      expect(res.body.data.paymentAttemptId).toBeDefined();
      expect(res.body.data.attemptNumber).toBe(1);
      expect(res.body.data.razorpayOrderId).toBe('order_rzp_mock_api_success');
      expect(res.body.data.razorpayKeyId).toBe(config.RAZORPAY_KEY_ID);
      expect(res.body.data.amountPaise).toBe(299900);
      expect(res.body.data.currency).toBe('INR');

      // Security check: Key secret is never returned in response payload
      expect(res.body.data.razorpayKeySecret).toBeUndefined();
      expect(res.body.data.key_secret).toBeUndefined();
      expect(res.text).not.toContain(config.RAZORPAY_KEY_SECRET);
    });
  });

  describe('3. POST /api/payments/retry', () => {
    it('creates attempt #2 and generates new Razorpay order ID on retry', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ pricePaise: 150000 });
      const order = await createTestOrder({
        userId: auth.user.id,
        totalCostPaise: 150000,
        orderStatus: 'PENDING_PAYMENT',
      });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 1 });

      // First attempt: FAILED
      await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        razorpayOrderId: 'order_rzp_attempt1',
        status: 'FAILED',
        failureReason: 'GATEWAY_ERROR',
      });

      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValue({
        id: 'order_rzp_attempt2_new',
        amount: 150000,
        currency: 'INR',
        status: 'created',
      });

      const res = await request(app)
        .post('/api/payments/retry')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ orderId: order.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(order.id);
      expect(res.body.data.attemptNumber).toBe(2);
      expect(res.body.data.razorpayOrderId).toBe('order_rzp_attempt2_new');

      const attemptsInDb = await PaymentAttempt.findAll({
        where: { order_id: order.id },
        order: [['attempt_number', 'ASC']],
      });
      expect(attemptsInDb).toHaveLength(2);
      expect(attemptsInDb[0].attempt_number).toBe(1);
      expect(attemptsInDb[0].status).toBe('FAILED');
      expect(attemptsInDb[1].attempt_number).toBe(2);
      expect(attemptsInDb[1].status).toBe('INITIATED');
    });
  });

  describe('4. POST /api/payments/verify', () => {
    it('rejects invalid Razorpay signatures with 400 INVALID_PAYMENT_SIGNATURE', async () => {
      const auth = await createAndLoginUser();
      const order = await createTestOrder({ userId: auth.user.id });
      const rzpOrderId = 'order_rzp_test_sig';

      await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        status: 'INITIATED',
      });

      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          orderId: order.id,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: 'pay_rzp_fake_id',
          razorpaySignature: 'invalid_fake_signature',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_SIGNATURE');
    });

    it('successfully verifies captured payment, settles order to PAID, and permanently converts stock', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ pricePaise: 400000, stockQuantity: 10, reservedQuantity: 2 });
      const order = await createTestOrder({
        userId: auth.user.id,
        totalCostPaise: 400000,
        orderStatus: 'PENDING_PAYMENT',
      });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 2 });

      const rzpOrderId = 'order_rzp_settle_success';
      const rzpPaymentId = 'pay_rzp_settle_success';

      await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        amountPaise: 400000,
        status: 'INITIATED',
      });

      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      vi.spyOn(razorpayGateway, 'fetchPayment').mockResolvedValue({
        id: rzpPaymentId,
        order_id: rzpOrderId,
        status: 'captured',
        amount: 400000,
        currency: 'INR',
        captured: true,
      });

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          orderId: order.id,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: rzpPaymentId,
          razorpaySignature: 'valid_signature_string',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(order.id);
      expect(res.body.data.orderStatus).toBe('PAID');
      expect(res.body.data.paymentStatus).toBe('SUCCESS');
      expect(res.body.data.settled).toBe(true);

      // Verify DB Order state
      const reloadedOrder = await Order.findByPk(order.id);
      expect(reloadedOrder.order_status).toBe('PAID');

      // Verify Product stock reduction (10 - 2 = 8, reserved = 0)
      const reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(8);
      expect(reloadedProduct.reserved_quantity).toBe(0);
    });
  });
});
