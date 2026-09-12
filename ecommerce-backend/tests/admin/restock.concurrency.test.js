import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import {
  Product,
  StockRestockLog,
} from '../../src/models/index.js';
import {
  createTestAdmin,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.12 — Admin Restock Real PostgreSQL Concurrency Tests', () => {
  const request = supertest(app);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  it('prevents double-increment and overshoot across 2 concurrent full restock requests', async () => {
    const { user: admin, password } = await createTestAdmin();
    const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });
    const { order } = await createPaidOrderWithAttempt({
      product,
      quantity: 4, // Ordered 4
      orderStatus: 'REFUNDED',
      paymentAttemptStatus: 'REFUNDED',
    });

    const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

    // Launch 2 concurrent restock requests for all 4 items
    const results = await Promise.all(
      [1, 2].map(() =>
        request
          .post(`/api/admin/orders/${order.id}/restock`)
          .set('Cookie', cookieHeader)
          .set('x-csrf-token', csrfToken)
          .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
          .send({ reason: 'Concurrent restock race' })
      )
    );

    const statuses = results.map((r) => r.status).sort();
    // Exactly one should succeed (200), and the other should be rejected because 0 remaining (422)
    expect(statuses).toEqual([200, 422]);

    // Stock must have increased by EXACTLY 4 (10 + 4 = 14), NEVER 18!
    const finalProduct = await Product.findByPk(product.id);
    expect(finalProduct.stock_quantity).toBe(14);
    expect(finalProduct.reserved_quantity).toBe(0);

    // StockRestockLogs must record exactly 4 items restocked
    const logs = await StockRestockLog.findAll({ where: { order_id: order.id } });
    const totalRestocked = logs.reduce((sum, l) => sum + Number(l.quantity_restocked), 0);
    expect(totalRestocked).toBe(4);
  });

  it('prevents double-increment and race conditions across 10 concurrent restock requests', async () => {
    const { user: admin, password } = await createTestAdmin();
    const product = await createTestProduct({ stockQuantity: 20, reservedQuantity: 0 });
    const { order } = await createPaidOrderWithAttempt({
      product,
      quantity: 5, // Ordered 5
      orderStatus: 'REFUNDED',
      paymentAttemptStatus: 'REFUNDED',
    });

    const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

    // Launch 10 concurrent requests
    const results = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        request
          .post(`/api/admin/orders/${order.id}/restock`)
          .set('Cookie', cookieHeader)
          .set('x-csrf-token', csrfToken)
          .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
          .send({ reason: 'Stress 10 concurrent restocks' })
      )
    );

    const successCount = results.filter((r) => r.status === 200).length;
    const errorCount = results.filter((r) => r.status === 422).length;

    expect(successCount).toBe(1);
    expect(errorCount).toBe(9);

    // Stock must have increased by EXACTLY 5 (20 + 5 = 25), never 70!
    const finalProduct = await Product.findByPk(product.id);
    expect(finalProduct.stock_quantity).toBe(25);
    expect(finalProduct.reserved_quantity).toBe(0);

    const logs = await StockRestockLog.findAll({ where: { order_id: order.id } });
    const totalRestocked = logs.reduce((sum, l) => sum + Number(l.quantity_restocked), 0);
    expect(totalRestocked).toBe(5);
  });
});
