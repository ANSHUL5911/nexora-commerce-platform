import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../../src/app.js';
import { Order, AuditLog } from '../../src/models/index.js';
import {
  createTestAdmin,
  createTestCustomer,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin Order Status Real PostgreSQL Concurrency Tests', () => {
  const request = supertest(app);
  let admin1, session1;
  let admin2, session2;
  let customerUser;

  beforeEach(async () => {
    await cleanupAdminTables();
    const fixture1 = await createTestAdmin({ email: 'admin1-order-race@example.com' });
    admin1 = fixture1.user;
    session1 = await getAuthSession(admin1, fixture1.password);

    const fixture2 = await createTestAdmin({ email: 'admin2-order-race@example.com' });
    admin2 = fixture2.user;
    session2 = await getAuthSession(admin2, fixture2.password);

    const custFixture = await createTestCustomer();
    customerUser = custFixture.user;
  });

  afterAll(async () => {
    await cleanupAdminTables();
  });

  it('safely handles concurrent competing order status transitions with database-level row locking', async () => {
    const product = await createTestProduct();
    const { order } = await createPaidOrderWithAttempt({
      userId: customerUser.id,
      product,
      orderStatus: 'PAID',
    });

    // Admin 1 and Admin 2 both concurrently attempt PAID -> PROCESSING
    const req1 = request
      .patch(`/api/admin/orders/${order.id}/status`)
      .set('Cookie', session1.cookieHeader)
      .set('X-CSRF-Token', session1.csrfToken)
      .send({ status: 'PROCESSING' });

    const req2 = request
      .patch(`/api/admin/orders/${order.id}/status`)
      .set('Cookie', session2.cookieHeader)
      .set('X-CSRF-Token', session2.csrfToken)
      .send({ status: 'PROCESSING' });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one must succeed (200), the other must be rejected as already PROCESSING (422)
    expect(statuses).toEqual([200, 422]);

    const finalOrder = await Order.findByPk(order.id);
    expect(finalOrder.order_status).toBe('PROCESSING');

    // Exactly 1 AuditLog created for the single successful transition
    const auditLogs = await AuditLog.findAll({
      where: {
        action: 'ADMIN_ORDER_STATUS_CHANGE',
        resource_id: order.id,
      },
    });
    expect(auditLogs.length).toBe(1);
  });

  it('rejects invalid transitions even under concurrent execution', async () => {
    const product = await createTestProduct();
    const { order } = await createPaidOrderWithAttempt({
      userId: customerUser.id,
      product,
      orderStatus: 'PAID',
    });

    // Admin 1 attempts valid PAID -> PROCESSING
    // Admin 2 attempts invalid DELIVERED (invalid from both PAID and PROCESSING)
    const req1 = request
      .patch(`/api/admin/orders/${order.id}/status`)
      .set('Cookie', session1.cookieHeader)
      .set('X-CSRF-Token', session1.csrfToken)
      .send({ status: 'PROCESSING' });

    const req2 = request
      .patch(`/api/admin/orders/${order.id}/status`)
      .set('Cookie', session2.cookieHeader)
      .set('X-CSRF-Token', session2.csrfToken)
      .send({ status: 'DELIVERED' });

    const [res1, res2] = await Promise.all([req1, req2]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(422);

    const finalOrder = await Order.findByPk(order.id);
    expect(finalOrder.order_status).toBe('PROCESSING');
  });
});
