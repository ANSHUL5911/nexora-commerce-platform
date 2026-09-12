import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import {
  PaymentAttempt,
  Product,
  StockRestockLog,
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

describe('Phase 07.12 — Refund + Restock Complete End-to-End & Separation Verification', () => {
  const request = supertest(app);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  it('verifies the complete lifecycle: PAID -> Admin Refund (stock untouched) -> Explicit Admin Restock (stock incremented)', async () => {
    const { user: admin, password: adminPassword } = await createTestAdmin();
    const { user: customer } = await createTestCustomer();

    // 1. Initial State: Product stock is 10
    const product = await createTestProduct({
      name: 'High-end Mechanical Keyboard',
      stockQuantity: 10,
      reservedQuantity: 0,
      pricePaise: 499900,
    });

    const { order, paymentAttempt } = await createPaidOrderWithAttempt({
      userId: customer.id,
      product,
      quantity: 2,
      orderStatus: 'PAID',
      paymentAttemptStatus: 'SUCCESS',
    });

    const refundMock = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
      id: 'rfnd_e2e_gateway_1',
      payment_id: paymentAttempt.razorpay_payment_id,
      amount: Number(paymentAttempt.amount_paise),
      currency: 'INR',
      status: 'processed',
    });

    const { cookieHeader, csrfToken } = await getAuthSession(admin, adminPassword);

    // 2. Admin performs full refund
    const refundRes = await request
      .post(`/api/admin/orders/${order.id}/refund`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrfToken)
      .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
      .send({ reason: 'Customer return request approved' });

    expect(refundRes.status).toBe(200);
    expect(refundRes.body.data.orderStatus).toBe('REFUNDED');
    expect(refundRes.body.data.paymentStatus).toBe('REFUNDED');
    expect(refundRes.body.data.refundId).toBe('rfnd_e2e_gateway_1');
    expect(refundRes.body.data.amountPaise).toBe(999800); // 499900 * 2
    expect(refundMock).toHaveBeenCalledTimes(1);

    // 3. VERIFY CRITICAL BUSINESS INVARIANT: REFUND != RESTOCK
    let reloadedProduct = await Product.findByPk(product.id);
    expect(reloadedProduct.stock_quantity).toBe(10); // UNCHANGED!
    expect(reloadedProduct.reserved_quantity).toBe(0); // UNCHANGED!

    let restockLogCount = await StockRestockLog.count({ where: { order_id: order.id } });
    expect(restockLogCount).toBe(0); // UNCHANGED!

    // 4. Later: Admin physically receives returned inventory and explicitly calls restock endpoint
    const restockRes = await request
      .post(`/api/admin/orders/${order.id}/restock`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrfToken)
      .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
      .send({ reason: 'Physically inspected returned goods. Restocking 2 units to inventory.' });

    expect(restockRes.status).toBe(200);
    expect(restockRes.body.data.totalQuantityRestocked).toBe(2);

    // 5. Verify stock increased by exactly 2
    reloadedProduct = await Product.findByPk(product.id);
    expect(reloadedProduct.stock_quantity).toBe(12); // 10 + 2 = 12
    expect(reloadedProduct.reserved_quantity).toBe(0);

    // 6. Verify StockRestockLog & AuditLogs recorded
    const restockLog = await StockRestockLog.findOne({ where: { order_id: order.id } });
    expect(restockLog).toBeDefined();
    expect(restockLog.quantity_restocked).toBe(2);
    expect(restockLog.product_id).toBe(product.id);

    const auditLogs = await AuditLog.findAll({ where: { resource_id: order.id } });
    const actions = auditLogs.map((a) => a.action);
    expect(actions).toContain('REFUND_ORDER');
    expect(actions).toContain('RESTOCK_ORDER');
  });

  it('enforces Anti-IDOR: only refunds the PaymentAttempt that actually belongs to the specified Order', async () => {
    const { user: admin, password } = await createTestAdmin();
    const product = await createTestProduct();
    const { order: orderA, paymentAttempt: attemptA } = await createPaidOrderWithAttempt({ product });
    const { paymentAttempt: attemptB } = await createPaidOrderWithAttempt({ product });

    const refundMock = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
      id: 'rfnd_idor_test',
      status: 'processed',
    });

    const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

    // Refund Order A
    await request
      .post(`/api/admin/orders/${orderA.id}/refund`)
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrfToken)
      .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
      .send({ reason: 'Refund A' });

    expect(refundMock).toHaveBeenCalledTimes(1);

    // Assert Attempt A was refunded and Attempt B was NOT affected
    const reloadA = await PaymentAttempt.findByPk(attemptA.id);
    expect(reloadA.status).toBe('REFUNDED');

    const reloadB = await PaymentAttempt.findByPk(attemptB.id);
    expect(reloadB.status).toBe('SUCCESS'); // Untouched!
  });
});
