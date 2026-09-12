import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { Order, PaymentAttempt } from '../../src/models/index.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import {
  createTestProduct,
  cleanupOrderTables,
} from '../orders/helpers/orderTestFixtures.js';

describe('Phase 07.11 — Guest Payment Authorization Chain & Settlement Tests', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanupOrderTables();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupOrderTables();
  });

  const validAddress = {
    fullName: 'Ananya Roy',
    addressLine1: '78 Park Street',
    city: 'Kolkata',
    state: 'West Bengal',
    pincode: '700016',
    phone: '+919830012345',
  };

  function getCsrfPair() {
    const token = crypto.randomBytes(32).toString('hex');
    return {
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      token,
    };
  }

  describe('1. Payment Initiation & Retry via X-Guest-Token', () => {
    it('initiates a PaymentAttempt for a guest order when valid X-Guest-Token is provided', async () => {
      const product = await createTestProduct({ pricePaise: 400000 });

      // Mock Razorpay gateway order creation
      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValue({
        id: 'order_rzp_mock_guest_001',
        amount: 400000,
        currency: 'INR',
        status: 'created',
      });

      const csrf1 = getCsrfPair();
      // 1. Guest checkout
      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.2.1')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf1.cookie)
        .set(CSRF_HEADER_NAME, csrf1.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      expect(checkoutRes.status).toBe(201);
      const orderId = checkoutRes.body.data.id;
      const rawGuestToken = checkoutRes.body.data.guestToken;

      const csrf2 = getCsrfPair();
      // 2. Guest initiates payment
      const payRes = await request(app)
        .post('/api/payments/create-order')
        .set('X-Forwarded-For', '192.168.2.1')
        .set('X-Guest-Token', rawGuestToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf2.cookie)
        .set(CSRF_HEADER_NAME, csrf2.token)
        .send({ orderId });

      expect(payRes.status).toBe(201);
      expect(payRes.body.success).toBe(true);
      expect(payRes.body.data.razorpayOrderId).toBe('order_rzp_mock_guest_001');

      // Verify PaymentAttempt in database
      const attempt = await PaymentAttempt.findOne({ where: { order_id: orderId } });
      expect(attempt).not.toBeNull();
      expect(attempt.attempt_number).toBe(1);
      expect(attempt.status).toBe('INITIATED');
      expect(attempt.razorpay_order_id).toBe('order_rzp_mock_guest_001');
    });

    it('retries payment on a guest order with a new PaymentAttempt without creating duplicate orders', async () => {
      const product = await createTestProduct({ pricePaise: 400000 });

      vi.spyOn(razorpayGateway, 'createOrder')
        .mockResolvedValueOnce({
          id: 'order_rzp_attempt1',
          amount: 400000,
          currency: 'INR',
          status: 'created',
        })
        .mockResolvedValueOnce({
          id: 'order_rzp_attempt2',
          amount: 400000,
          currency: 'INR',
          status: 'created',
        });

      const csrf1 = getCsrfPair();
      // 1. Guest checkout
      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.2.2')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf1.cookie)
        .set(CSRF_HEADER_NAME, csrf1.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const orderId = checkoutRes.body.data.id;
      const rawGuestToken = checkoutRes.body.data.guestToken;

      const csrf2 = getCsrfPair();
      // 2. First payment attempt
      await request(app)
        .post('/api/payments/create-order')
        .set('X-Forwarded-For', '192.168.2.2')
        .set('X-Guest-Token', rawGuestToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf2.cookie)
        .set(CSRF_HEADER_NAME, csrf2.token)
        .send({ orderId });

      const csrf3 = getCsrfPair();
      // 3. Retry payment attempt
      const retryRes = await request(app)
        .post('/api/payments/retry')
        .set('X-Forwarded-For', '192.168.2.2')
        .set('X-Guest-Token', rawGuestToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf3.cookie)
        .set(CSRF_HEADER_NAME, csrf3.token)
        .send({ orderId });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.attemptNumber).toBe(2);
      expect(retryRes.body.data.razorpayOrderId).toBe('order_rzp_attempt2');

      // Assert total orders remains exactly 1
      const orderCount = await Order.count();
      expect(orderCount).toBe(1);

      // Assert two attempts exist on the same order
      const attempts = await PaymentAttempt.findAll({ where: { order_id: orderId }, order: [['attempt_number', 'ASC']] });
      expect(attempts).toHaveLength(2);
      expect(attempts[0].attempt_number).toBe(1);
      expect(attempts[1].attempt_number).toBe(2);
    });

    it('rejects payment retry with sanitized 404 when X-Guest-Token is mismatched or missing', async () => {
      const product = await createTestProduct({ pricePaise: 400000 });
      const csrf1 = getCsrfPair();

      const checkoutRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.2.3')
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf1.cookie)
        .set(CSRF_HEADER_NAME, csrf1.token)
        .send({
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        });

      const orderId = checkoutRes.body.data.id;
      const wrongGuestToken = crypto.randomBytes(32).toString('hex');
      const csrf2 = getCsrfPair();

      // Attempt payment with wrong guest token
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('X-Forwarded-For', '192.168.2.3')
        .set('X-Guest-Token', wrongGuestToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('Cookie', csrf2.cookie)
        .set(CSRF_HEADER_NAME, csrf2.token)
        .send({ orderId });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });
});
