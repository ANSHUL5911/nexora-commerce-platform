import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { Order, Product, InventoryReservation, AuditLog } from '../../src/models/index.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';
import {
  createTestAdmin,
  createTestCustomer,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin Order Operations & State Machine Tests', () => {
  const request = supertest(app);
  let adminUser, adminSession;
  let customerUser;

  beforeEach(async () => {
    await cleanupAdminTables();
    const adminFixture = await createTestAdmin();
    adminUser = adminFixture.user;
    adminSession = await getAuthSession(adminUser, adminFixture.password);

    const customerFixture = await createTestCustomer();
    customerUser = customerFixture.user;
  });

  afterAll(async () => {
    await cleanupAdminTables();
  });

  describe('1. GET /api/admin/orders (Order Listing)', () => {
    it('lists orders with bounded pagination and status filtering', async () => {
      const product = await createTestProduct();
      await createPaidOrderWithAttempt({ userId: customerUser.id, product, orderStatus: 'PAID' });
      await createPaidOrderWithAttempt({ userId: customerUser.id, product, orderStatus: 'PROCESSING' });
      await createPaidOrderWithAttempt({ userId: customerUser.id, product, orderStatus: 'DELIVERED' });

      const res = await request
        .get('/api/admin/orders?status=PAID&page=1&limit=10')
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].orderStatus).toBe('PAID');
      expect(res.body.pagination.total).toBe(1);
    });

    it('returns sanitized order summary without leaking guest token hash or secrets', async () => {
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({ userId: customerUser.id, product });

      const res = await request
        .get('/api/admin/orders')
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      const found = res.body.data.find((o) => o.id === order.id);
      expect(found).toBeDefined();
      expect(found.guest_token_hash).toBeUndefined();
      expect(found.guestToken).toBeUndefined();
    });
  });

  describe('2. GET /api/admin/orders/:orderId (Order Detail)', () => {
    it('retrieves full order detail with items, payments, and restock logs', async () => {
      const product = await createTestProduct({ name: 'Wireless Earbuds' });
      const { order, paymentAttempt } = await createPaidOrderWithAttempt({
        userId: customerUser.id,
        product,
        quantity: 2,
      });

      const res = await request
        .get(`/api/admin/orders/${order.id}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(order.id);
      expect(res.body.data.customer.email).toBe(customerUser.email);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].productName).toBe('Wireless Earbuds');
      expect(res.body.data.paymentAttempts.length).toBe(1);
      expect(res.body.data.paymentAttempts[0].id).toBe(paymentAttempt.id);
      expect(res.body.data.isRefundEligible).toBe(true);
      expect(res.body.data.isRestockEligible).toBe(false);

      // Verify no sensitive credentials leaked
      expect(res.body.data.guest_token_hash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('returns 404 for non-existent order ID', async () => {
      const dummyId = crypto.randomUUID();
      const res = await request
        .get(`/api/admin/orders/${dummyId}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('3. PATCH /api/admin/orders/:orderId/status (State Machine Transitions)', () => {
    it('advances order status PAID -> PROCESSING -> SHIPPED -> DELIVERED with audit trail', async () => {
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        userId: customerUser.id,
        product,
        orderStatus: 'PAID',
      });

      // 1. PAID -> PROCESSING
      const res1 = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'PROCESSING', note: 'Order sent to packaging' });

      expect(res1.status).toBe(200);
      expect(res1.body.data.orderStatus).toBe('PROCESSING');

      // 2. PROCESSING -> SHIPPED
      const res2 = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'SHIPPED', note: 'Dispatched via Express Courier' });

      expect(res2.status).toBe(200);
      expect(res2.body.data.orderStatus).toBe('SHIPPED');

      // 3. SHIPPED -> DELIVERED
      const res3 = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'DELIVERED', note: 'Customer confirmed delivery' });

      expect(res3.status).toBe(200);
      expect(res3.body.data.orderStatus).toBe('DELIVERED');

      // Verify AuditLogs created for each transition
      const auditLogs = await AuditLog.findAll({
        where: {
          action: 'ADMIN_ORDER_STATUS_CHANGE',
          resource_id: order.id,
        },
      });
      expect(auditLogs.length).toBe(3);
    });

    it('rejects invalid status transitions (e.g. DELIVERED -> PAID, REFUNDED -> PAID)', async () => {
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        userId: customerUser.id,
        product,
        orderStatus: 'DELIVERED',
      });

      const res = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'PAID' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('releases active inventory reservations via Phase 07.6 when PENDING_PAYMENT order is CANCELLED', async () => {
      const product = await createTestProduct({
        stockQuantity: 10,
        reservedQuantity: 0,
      });

      const order = await Order.create({
        id: crypto.randomUUID(),
        user_id: customerUser.id,
        order_status: 'PENDING_PAYMENT',
        total_cost_paise: 50000,
        shipping_fee_paise: 0,
        shipping_full_name: 'Pending Customer',
        shipping_address_line1: '456 Lane',
        shipping_city: 'Delhi',
        shipping_state: 'Delhi',
        shipping_pincode: '110001',
        shipping_phone: '9876543210',
        reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Create reservation via Phase 07.6 inventory service
      await inventoryService.reserveInventory(product.id, 2, {
        orderId: order.id,
        userId: customerUser.id,
      });

      // Verify product has 2 reserved units
      let reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.reserved_quantity).toBe(2);

      // Admin cancels PENDING_PAYMENT order
      const cancelRes = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'CANCELLED', note: 'Customer requested cancellation' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.orderStatus).toBe('CANCELLED');

      // Verify reservation was transitioned to RELEASED
      const reservation = await InventoryReservation.findOne({
        where: { order_id: order.id },
      });
      expect(reservation.status).toBe('RELEASED');

      // Verify product reserved_quantity was restored to 0
      reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.reserved_quantity).toBe(0);
      expect(reloadedProduct.available_quantity).toBe(10);
    });
  });
});
