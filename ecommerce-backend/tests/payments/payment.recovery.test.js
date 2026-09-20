import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import {
  User,
  Order,
  PaymentAttempt,
  InventoryReservation,
  IdempotencyRecord,
} from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import {
  createTestProduct,
  createTestOrder,
  createTestOrderItem,
  createTestReservation,
  createTestPaymentAttempt,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';

describe('Phase 07.10 — Payment Recovery & Ambiguous Gateway Outcome Tests', () => {
  let app;

  beforeAll(async () => {
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

  describe('Test A — Persisted razorpay_order_id Recovery Reuses Existing ID', () => {
    it('reuses existing razorpay_order_id and does NOT call createOrder() again on retry/recovery', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: auth.user.id, totalCostPaise: 500000 });
      await createTestOrderItem({ orderId: order.id, productId: product.id });
      await createTestReservation({ orderId: order.id, productId: product.id });

      const idempotencyKey = `pay_key_${crypto.randomUUID()}`;

      // Spy on gateway createOrder
      const createOrderSpy = vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValueOnce({
        id: 'order_rzp_first_call_111',
        amount: 500000,
        currency: 'INR',
        status: 'created',
      });

      // First Request
      const res1 = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order.id });

      expect(res1.status).toBe(201);
      expect(res1.body.data.razorpayOrderId).toBe('order_rzp_first_call_111');
      expect(createOrderSpy).toHaveBeenCalledTimes(1);

      // Second Request (Identical retry)
      const res2 = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order.id });

      expect(res2.status).toBe(201);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      expect(res2.body.data.razorpayOrderId).toBe('order_rzp_first_call_111');

      // createOrder() was NOT called a second time
      expect(createOrderSpy).toHaveBeenCalledTimes(1);

      // Exactly 1 PaymentAttempt in DB
      const totalAttempts = await PaymentAttempt.count({ where: { order_id: order.id } });
      expect(totalAttempts).toBe(1);
    });
  });

  describe('Test B — Ambiguous createOrder() Timeout Handling', () => {
    it('marks PaymentAttempt GATEWAY_ERROR and IdempotencyRecord FAILED_RETRYABLE without blind re-creation', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: auth.user.id, totalCostPaise: 500000 });
      await createTestOrderItem({ orderId: order.id, productId: product.id });
      await createTestReservation({ orderId: order.id, productId: product.id });

      const idempotencyKey = `timeout_key_${crypto.randomUUID()}`;

      // Simulate gateway timeout
      vi.spyOn(razorpayGateway, 'createOrder').mockRejectedValueOnce(
        new Error('ETIMEDOUT: Gateway network timeout')
      );

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order.id });

      expect(res.status).toBe(502);

      // PaymentAttempt is recorded as FAILED with GATEWAY_ERROR
      const attempt = await PaymentAttempt.findOne({ where: { order_id: order.id } });
      expect(attempt).toBeDefined();
      expect(attempt.status).toBe('FAILED');
      expect(attempt.failure_reason).toBe('GATEWAY_ERROR');
      expect(attempt.razorpay_order_id).toBeNull();

      // Idempotency record is in FAILED_RETRYABLE status
      const record = await IdempotencyRecord.findOne({
        where: { idempotency_key: idempotencyKey, request_path: '/api/payments/create-order' },
      });
      expect(record).toBeDefined();
      expect(record.status).toBe('FAILED_RETRYABLE');

      // Order remains PENDING_PAYMENT and inventory remains reserved
      await order.reload();
      expect(order.order_status).toBe('PENDING_PAYMENT');
      const reservation = await InventoryReservation.findOne({ where: { order_id: order.id } });
      expect(reservation.status).toBe('ACTIVE');
    });
  });

  describe('Test C — Legitimate Payment Retry Semantics', () => {
    it('creates PaymentAttempt #2 and new Razorpay Order on same Order without duplicate ecommerce orders', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: auth.user.id, totalCostPaise: 500000 });
      await createTestOrderItem({ orderId: order.id, productId: product.id });
      await createTestReservation({ orderId: order.id, productId: product.id });

      // First attempt failed
      await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        status: 'FAILED',
        failureReason: 'PAYMENT_CANCELLED_BY_USER',
      });

      const retryKey = `retry_pay_key_${crypto.randomUUID()}`;

      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValueOnce({
        id: 'order_rzp_retry_222',
        amount: 500000,
        currency: 'INR',
        status: 'created',
      });

      // Call POST /api/payments/retry
      const res = await request(app)
        .post('/api/payments/retry')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', retryKey)
        .send({ orderId: order.id });

      expect(res.status).toBe(200);
      expect(res.body.data.attemptNumber).toBe(2);
      expect(res.body.data.razorpayOrderId).toBe('order_rzp_retry_222');

      // Verify DB: Exactly 1 Order row exists
      const totalOrders = await Order.count({ where: { user_id: auth.user.id } });
      expect(totalOrders).toBe(1);

      // Exactly 2 PaymentAttempts exist (#1 FAILED, #2 INITIATED)
      const attempts = await PaymentAttempt.findAll({
        where: { order_id: order.id },
        order: [['attempt_number', 'ASC']],
      });
      expect(attempts.length).toBe(2);
      expect(attempts[0].attempt_number).toBe(1);
      expect(attempts[0].status).toBe('FAILED');
      expect(attempts[1].attempt_number).toBe(2);
      expect(attempts[1].status).toBe('INITIATED');
      expect(attempts[1].razorpay_order_id).toBe('order_rzp_retry_222');
    });
  });

  describe('Test D — Payment Verification Idempotency', () => {
    it('10 concurrent POST /api/payments/verify with same idempotency key execute exactly 1 settlement', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 1 });
      const order = await createTestOrder({ userId: auth.user.id, totalCostPaise: 500000 });
      await createTestOrderItem({ orderId: order.id, productId: product.id });
      await createTestReservation({ orderId: order.id, productId: product.id });
      await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        razorpayOrderId: 'order_rzp_verify_123',
        status: 'INITIATED',
        amountPaise: 500000,
      });

      // Mock gateway fetchPayment & verifySignature
      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      vi.spyOn(razorpayGateway, 'fetchPayment').mockResolvedValue({
        id: 'pay_rzp_test_123',
        order_id: 'order_rzp_verify_123',
        status: 'captured',
        amount: 500000,
        currency: 'INR',
        captured: true,
      });

      const verifyKey = `verify_idemp_${crypto.randomUUID()}`;
      const payload = {
        orderId: order.id,
        razorpayOrderId: 'order_rzp_verify_123',
        razorpayPaymentId: 'pay_rzp_test_123',
        razorpaySignature: 'valid_mock_signature',
      };

      // 10 concurrent requests with same idempotency key
      const promises = Array.from({ length: 10 }).map((_, i) =>
        request(app)
          .post('/api/payments/verify')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .set('Idempotency-Key', verifyKey)
          .set('X-Forwarded-For', `10.0.1.${i + 1}`)
          .send(payload)
      );

      const responses = await Promise.all(promises);

      const successResponses = responses.filter((r) => r.status === 200);
      const inProgressResponses = responses.filter((r) => r.status === 409);

      expect(successResponses.length).toBeGreaterThanOrEqual(1);
      expect(successResponses.length + inProgressResponses.length).toBe(10);

      // Verify DB State
      await order.reload();
      expect(order.order_status).toBe('PAID');

      const attempt = await PaymentAttempt.findOne({ where: { order_id: order.id } });
      expect(attempt.status).toBe('SUCCESS');
      expect(attempt.razorpay_payment_id).toBe('pay_rzp_test_123');

      // Verify inventory converted exactly once
      await product.reload();
      expect(product.stock_quantity).toBe(9);
      expect(product.reserved_quantity).toBe(0);
    });
  });

  describe('Test E — Payment Retry Rejection on Expired Inventory Reservation', () => {
    it('rejects payment retry with HTTP 409 and code RESERVATION_EXPIRED when reservation has expired, creating 0 attempts, 0 gateway calls, and 0 reservations', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({
        userId: auth.user.id,
        totalCostPaise: 500000,
        reservationExpiresAt: new Date(Date.now() - 60000), // Expired 1m ago
      });
      await createTestOrderItem({ orderId: order.id, productId: product.id });
      await createTestReservation({
        orderId: order.id,
        productId: product.id,
        expiresAt: new Date(Date.now() - 60000),
      });

      const gatewaySpy = vi.spyOn(razorpayGateway, 'createOrder');

      const res = await request(app)
        .post('/api/payments/retry')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .set('Idempotency-Key', `retry_expired_${crypto.randomUUID()}`)
        .send({ orderId: order.id });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESERVATION_EXPIRED');
      expect(res.body.error.message).toBe('Inventory reservation for this order has expired. Please place a new order.');

      // Invariant: Gateway was NEVER called
      expect(gatewaySpy).not.toHaveBeenCalled();

      // Invariant: Exactly 0 PaymentAttempts were created
      const attemptsCount = await PaymentAttempt.count({ where: { order_id: order.id } });
      expect(attemptsCount).toBe(0);

      // Invariant: Exactly 1 Order row exists
      const ordersCount = await Order.count({ where: { user_id: auth.user.id } });
      expect(ordersCount).toBe(1);

      // Invariant: Exactly 1 reservation row exists (no new reservation)
      const reservationsCount = await InventoryReservation.count({ where: { order_id: order.id } });
      expect(reservationsCount).toBe(1);
    });
  });
});
