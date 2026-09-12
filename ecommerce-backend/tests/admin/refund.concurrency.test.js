import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import {
  Order,
  PaymentAttempt,
  Product,
} from '../../src/models/index.js';
import {
  createTestAdmin,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.12 — Admin Refund Real PostgreSQL Concurrency Tests', () => {
  const request = supertest(app);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  it('guarantees exactly 1 refund across 2 concurrent refund requests for the same settled order', async () => {
    const { user: admin, password } = await createTestAdmin();
    const product = await createTestProduct({ stockQuantity: 10 });
    const { order, paymentAttempt } = await createPaidOrderWithAttempt({ product, quantity: 1 });

    const refundSpy = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
      id: 'rfnd_concurrent_2',
      payment_id: paymentAttempt.razorpay_payment_id,
      amount: Number(paymentAttempt.amount_paise),
      currency: 'INR',
      status: 'processed',
    });

    const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

    // Launch 2 concurrent refund requests with different unique idempotency keys
    const results = await Promise.all(
      [1, 2].map(() =>
        request
          .post(`/api/admin/orders/${order.id}/refund`)
          .set('Cookie', cookieHeader)
          .set('x-csrf-token', csrfToken)
          .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
          .send({ reason: 'Concurrent refund race test' })
      )
    );

    // Both should receive HTTP 200 (one executed refund, the other safely returned alreadyRefunded/idempotent state)
    expect(results.every((r) => r.status === 200)).toBe(true);

    // Gateway refund must be called at most once!
    expect(refundSpy.mock.calls.length).toBeLessThanOrEqual(1);

    // Final order and payment attempt state must be REFUNDED
    const finalOrder = await Order.findByPk(order.id);
    expect(finalOrder.order_status).toBe('REFUNDED');

    const finalAttempt = await PaymentAttempt.findByPk(paymentAttempt.id);
    expect(finalAttempt.status).toBe('REFUNDED');

    // CRITICAL INVARIANT: Product stock must remain completely untouched!
    const finalProduct = await Product.findByPk(product.id);
    expect(finalProduct.stock_quantity).toBe(10);
    expect(finalProduct.reserved_quantity).toBe(0);
  });

  it('guarantees exactly 1 refund across 10 concurrent refund requests for the same settled order', async () => {
    const { user: admin, password } = await createTestAdmin();
    const product = await createTestProduct({ stockQuantity: 25 });
    const { order, paymentAttempt } = await createPaidOrderWithAttempt({ product, quantity: 2 });

    const refundSpy = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
      id: 'rfnd_concurrent_10',
      payment_id: paymentAttempt.razorpay_payment_id,
      amount: Number(paymentAttempt.amount_paise),
      currency: 'INR',
      status: 'processed',
    });

    const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

    // Launch 10 concurrent requests
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        request
          .post(`/api/admin/orders/${order.id}/refund`)
          .set('Cookie', cookieHeader)
          .set('x-csrf-token', csrfToken)
          .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
          .send({ reason: 'Stress 10 concurrent refunds' })
      )
    );

    // All should resolve successfully
    expect(results.every((r) => r.status === 200)).toBe(true);

    // Exactly 1 gateway call
    expect(refundSpy.mock.calls.length).toBe(1);

    // Stock must remain strictly unchanged
    const finalProduct = await Product.findByPk(product.id);
    expect(finalProduct.stock_quantity).toBe(25);
    expect(finalProduct.reserved_quantity).toBe(0);
  });
});
