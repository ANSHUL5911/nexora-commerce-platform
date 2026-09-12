import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import { RazorpayGatewayError } from '../../src/modules/payments/payment.errors.js';
import {
  Order,
  PaymentAttempt,
  Product,
  AuditLog,
} from '../../src/models/index.js';
import {
  createTestAdmin,
  createTestCustomer,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.12 — Admin Refund API & Domain Integration Tests', () => {
  const request = supertest(app);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  describe('1. RBAC & Access Control', () => {
    it('allows authenticated admin with valid CSRF and Idempotency-Key to refund a settled order', async () => {
      const { user: admin, password: adminPassword } = await createTestAdmin();
      const { user: customer } = await createTestCustomer();
      const product = await createTestProduct({ stockQuantity: 10, pricePaise: 250000 });
      const { order, paymentAttempt } = await createPaidOrderWithAttempt({
        userId: customer.id,
        product,
        quantity: 2,
      });

      const refundMock = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
        id: 'rfnd_mock123456',
        payment_id: paymentAttempt.razorpay_payment_id,
        amount: 500000,
        currency: 'INR',
        status: 'processed',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, adminPassword);
      const idempotencyKey = `idemp_${crypto.randomUUID()}`;

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Customer requested return' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(order.id);
      expect(res.body.data.orderStatus).toBe('REFUNDED');
      expect(res.body.data.paymentStatus).toBe('REFUNDED');
      expect(res.body.data.refundId).toBe('rfnd_mock123456');
      expect(res.body.data.amountPaise).toBe(500000);
      expect(res.body.data.currency).toBe('INR');

      expect(refundMock).toHaveBeenCalledTimes(1);

      // Verify DB state
      const updatedOrder = await Order.findByPk(order.id);
      expect(updatedOrder.order_status).toBe('REFUNDED');

      const updatedAttempt = await PaymentAttempt.findByPk(paymentAttempt.id);
      expect(updatedAttempt.status).toBe('REFUNDED');
      expect(updatedAttempt.razorpay_refund_id).toBe('rfnd_mock123456');

      // CRITICAL INVARIANT: Product stock and reserved MUST be unchanged!
      const reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(10);
      expect(reloadedProduct.reserved_quantity).toBe(0);

      // Verify AuditLog creation
      const auditLog = await AuditLog.findOne({
        where: { resource_id: order.id, action: 'REFUND_ORDER' },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.actor_id).toBe(admin.id);
      expect(auditLog.details_json.amountPaise).toBe(500000);
      expect(auditLog.details_json.razorpayRefundId).toBe('rfnd_mock123456');
    });

    it('rejects regular customer from initiating refund with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const { user: customer, password } = await createTestCustomer();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ userId: customer.id, product });

      const { cookieHeader, csrfToken } = await getAuthSession(customer, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Self refund' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ product });

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({});

      expect(res.status).toBe(401);
    });

    it('rejects request missing CSRF token with 403 CSRF_TOKEN_MISSING', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ product });
      const { sessionCookie } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', sessionCookie)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('rejects request missing Idempotency-Key header with 400 MISSING_IDEMPOTENCY_KEY', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ product });
      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });
  });

  describe('2. Authoritative Derivation & Input Validation', () => {
    it('rejects client attempts to inject custom refund amounts or currency', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ product });
      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ amountPaise: 100, currency: 'USD' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects refund on an order with status PENDING_PAYMENT with 422 ORDER_NOT_REFUNDABLE', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'PENDING_PAYMENT',
        paymentAttemptStatus: 'INITIATED',
      });
      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ORDER_NOT_REFUNDABLE');
    });

    it('rejects refund when no settled SUCCESS payment attempt exists with 422 NO_SETTLED_PAYMENT', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'PAID',
        paymentAttemptStatus: 'FAILED',
      });
      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('NO_SETTLED_PAYMENT');
    });
  });

  describe('3. Idempotency & Replay', () => {
    it('replays identical cached response on duplicate request with same Idempotency-Key without second gateway call', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order, paymentAttempt } = await createPaidOrderWithAttempt({ product });

      const refundMock = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
        id: 'rfnd_replay_111',
        payment_id: paymentAttempt.razorpay_payment_id,
        amount: Number(paymentAttempt.amount_paise),
        currency: 'INR',
        status: 'processed',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);
      const idempotencyKey = `idemp_${crypto.randomUUID()}`;

      // First call
      const res1 = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Duplicate test' });

      expect(res1.status).toBe(200);
      expect(refundMock).toHaveBeenCalledTimes(1);

      // Second call with same idempotency key
      const res2 = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Duplicate test' });

      expect(res2.status).toBe(200);
      expect(res2.headers['x-idempotent-replay']).toBe('true');
      expect(res2.body.data.refundId).toBe('rfnd_replay_111');
      expect(refundMock).toHaveBeenCalledTimes(1); // Gateway NOT called again!
    });

    it('returns already refunded state without calling Razorpay if order is already REFUNDED under new idempotency key', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order, paymentAttempt } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'REFUNDED',
        paymentAttemptStatus: 'REFUNDED',
      });
      await paymentAttempt.update({ razorpay_refund_id: 'rfnd_existing_999' });

      const refundMock = vi.spyOn(razorpayGateway, 'refundPayment');
      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Subsequent refund attempt' });

      expect(res.status).toBe(200);
      expect(res.body.data.alreadyRefunded).toBe(true);
      expect(res.body.data.refundId).toBe('rfnd_existing_999');
      expect(refundMock).not.toHaveBeenCalled();
    });

    it('rejects conflicting payload with same Idempotency-Key with 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ product });

      vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
        id: 'rfnd_mock_mismatch',
        status: 'processed',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);
      const idempotencyKey = `idemp_${crypto.randomUUID()}`;

      // 1. Initial request
      await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Original reason' });

      // 2. Conflicting request with modified body
      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Modified reason' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    });
  });

  describe('4. Gateway Failure Handling', () => {
    it('does not transition order or payment to REFUNDED if Razorpay returns an error', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct({ stockQuantity: 10 });
      const { order, paymentAttempt } = await createPaidOrderWithAttempt({ product });

      vi.spyOn(razorpayGateway, 'refundPayment').mockRejectedValue(
        new RazorpayGatewayError('Gateway connection timeout')
      );

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Failed refund test' });

      expect(res.status).toBe(502);

      // Verify DB remains PAID/SUCCESS and stock unchanged
      const reloadedOrder = await Order.findByPk(order.id);
      expect(reloadedOrder.order_status).toBe('PAID');

      const reloadedAttempt = await PaymentAttempt.findByPk(paymentAttempt.id);
      expect(reloadedAttempt.status).toBe('SUCCESS');
      expect(reloadedAttempt.razorpay_refund_id).toBeNull();

      const reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(10);
    });
  });
});
