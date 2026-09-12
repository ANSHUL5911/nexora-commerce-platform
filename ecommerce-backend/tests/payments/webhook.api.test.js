import { describe, it, expect, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { User, PaymentEvent } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import {
  createTestProduct,
  createTestOrder,
  createTestReservation,
  createTestPaymentAttempt,
  generateWebhookSignature,
  generateCapturedWebhookPayload,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';

describe('Phase 07.9 — Webhook Ingestion API & Concurrency Race Tests', () => {
  let app;
  let product;
  let order;
  let reservation;
  let paymentAttempt;
  const orderTotalPaise = 510000;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanupPaymentTables();
    vi.restoreAllMocks();

    product = await createTestProduct({
      pricePaise: 500000,
      stockQuantity: 10,
      reservedQuantity: 1,
    });
    order = await createTestOrder({
      totalCostPaise: orderTotalPaise,
      orderStatus: 'PENDING_PAYMENT',
    });
    reservation = await createTestReservation({
      orderId: order.id,
      productId: product.id,
      quantity: 1,
      status: 'ACTIVE',
    });
    paymentAttempt = await createTestPaymentAttempt({
      orderId: order.id,
      amountPaise: orderTotalPaise,
      status: 'INITIATED',
    });
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

  describe('1. Security & Authentication Boundaries', () => {
    it('1. accepts valid webhook without customer session authentication', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        received: true,
        status: 'processed',
      });
    });

    it('2. accepts valid webhook without CSRF header / cookie', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('3. rejects webhook with missing x-razorpay-signature header with 400', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('4. rejects webhook with invalid signature with 400', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', '0'.repeat(64))
        .send(rawBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('5. handles malformed JSON body with standard 400 error', async () => {
      const malformedBody = '{"entity": "event", "broken": ';
      const signature = generateWebhookSignature(malformedBody);

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(malformedBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MALFORMED_JSON');
    });
  });

  describe('2. PostgreSQL Concurrency & Duplicate Delivery Races', () => {
    it('6. Scenario 1 — 10 concurrent identical payment.captured webhooks produce exactly 1 settlement and 1 stock deduction', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      // Fire 10 concurrent webhook requests with identical event_id
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/webhooks/razorpay')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', signature)
          .send(rawBody)
      );

      const responses = await Promise.all(requests);

      // All 10 responses must return 200 OK
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.received).toBe(true);
      }

      // Assert exactly 1 PaymentEvent was persisted for this event_id
      const events = await PaymentEvent.findAll({
        where: { event_id: payload.id },
      });
      expect(events.length).toBe(1);

      // Assert Order is PAID
      await order.reload();
      expect(order.order_status).toBe('PAID');

      // Assert PaymentAttempt is SUCCESS
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('SUCCESS');

      // Assert Reservation is CONVERTED
      await reservation.reload();
      expect(reservation.status).toBe('CONVERTED');

      // Assert exactly 1 stock deduction occurred (stock = 9, reserved = 0)
      await product.reload();
      expect(product.stock_quantity).toBe(9);
      expect(product.reserved_quantity).toBe(0);
    });

    it('7. Scenario 2 — Concurrent POST /api/payments/verify and Webhook capture race safely into a single settlement', async () => {
      const { user: authUser, cookieHeader, csrfToken } = await createAndLoginUser();
      await order.update({ user_id: authUser.id });

      const razorpayPaymentId = `pay_race_${crypto.randomBytes(4).toString('hex')}`;
      const razorpayOrderId = paymentAttempt.razorpay_order_id;

      // Mock gateway fetchPayment for backend verify
      vi.spyOn(razorpayGateway, 'fetchPayment').mockResolvedValue({
        id: razorpayPaymentId,
        order_id: razorpayOrderId,
        status: 'captured',
        amount: orderTotalPaise,
        currency: 'INR',
        captured: true,
      });

      // Generate verify signature (HMAC over order_id|payment_id using API key secret)
      const verifyPayload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const verifySignature = crypto
        .createHmac('sha256', razorpayGateway.keySecret)
        .update(verifyPayload)
        .digest('hex');

      // Generate webhook payload and signature (using Webhook secret)
      const webhookPayload = generateCapturedWebhookPayload({
        razorpayPaymentId,
        razorpayOrderId,
        amountPaise: orderTotalPaise,
      });
      const webhookRaw = JSON.stringify(webhookPayload);
      const webhookSig = generateWebhookSignature(webhookRaw);

      // Run Verify and Webhook simultaneously
      const [verifyRes, webhookRes] = await Promise.all([
        request(app)
          .post('/api/payments/verify')
          .set('Cookie', cookieHeader)
          .set(CSRF_HEADER_NAME, csrfToken)
          .send({
            orderId: order.id,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature: verifySignature,
          }),
        request(app)
          .post('/api/webhooks/razorpay')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', webhookSig)
          .send(webhookRaw),
      ]);

      expect(verifyRes.status).toBe(200);
      expect(webhookRes.status).toBe(200);

      // Assert Invariants: 1 settlement, 1 inventory deduction
      await order.reload();
      expect(order.order_status).toBe('PAID');

      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('SUCCESS');

      await reservation.reload();
      expect(reservation.status).toBe('CONVERTED');

      await product.reload();
      expect(product.stock_quantity).toBe(9);
      expect(product.reserved_quantity).toBe(0);
    });
  });
});
