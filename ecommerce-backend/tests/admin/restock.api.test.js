import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import {
  Order,
  OrderItem,
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

describe('Phase 07.12 — Admin Restock API & Domain Integration Tests', () => {
  const request = supertest(app);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupAdminTables();
  });

  describe('1. Access Control & Authorization', () => {
    it('allows authenticated admin with valid CSRF and Idempotency-Key to restock a REFUNDED order', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct({ stockQuantity: 8, reservedQuantity: 0 });
      const { order } = await createPaidOrderWithAttempt({
        product,
        quantity: 2,
        orderStatus: 'REFUNDED',
        paymentAttemptStatus: 'REFUNDED',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);
      const idempotencyKey = `idemp_${crypto.randomUUID()}`;

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Physically inspected returned items in good condition' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(order.id);
      expect(res.body.data.totalQuantityRestocked).toBe(2);
      expect(res.body.data.restockedItems).toHaveLength(1);
      expect(res.body.data.restockedItems[0].productId).toBe(product.id);
      expect(res.body.data.restockedItems[0].quantityRestocked).toBe(2);

      // Verify Product stock incremented exactly by 2 (8 + 2 = 10)
      const reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(10);
      expect(reloadedProduct.reserved_quantity).toBe(0);

      // Verify StockRestockLog created
      const restockLog = await StockRestockLog.findOne({
        where: { order_id: order.id, product_id: product.id },
      });
      expect(restockLog).toBeDefined();
      expect(restockLog.quantity_restocked).toBe(2);
      expect(restockLog.initiated_by).toBe(admin.id);
      expect(restockLog.reason).toBe('Physically inspected returned items in good condition');

      // Verify AuditLog created
      const auditLog = await AuditLog.findOne({
        where: { resource_id: order.id, action: 'RESTOCK_ORDER' },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.actor_id).toBe(admin.id);
    });

    it('rejects regular customer from calling restock endpoint with 403 INSUFFICIENT_PERMISSIONS', async () => {
      const { user: customer, password } = await createTestCustomer();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'REFUNDED',
        paymentAttemptStatus: 'REFUNDED',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(customer, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Unauthorized customer restock' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects unauthenticated restock request with 401 UNAUTHENTICATED', async () => {
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'REFUNDED',
      });

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Unauthenticated' });

      expect(res.status).toBe(401);
    });
  });

  describe('2. Order Eligibility & Order Lifecycle Restrictions', () => {
    it('rejects restocking for a PAID (non-refunded) order with 422 ORDER_NOT_RESTOCKABLE', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'PAID',
        paymentAttemptStatus: 'SUCCESS',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Trying to restock paid order' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ORDER_NOT_RESTOCKABLE');
    });

    it('rejects restocking for a PENDING_PAYMENT order with 422 ORDER_NOT_RESTOCKABLE', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct();
      const { order } = await createPaidOrderWithAttempt({
        product,
        orderStatus: 'PENDING_PAYMENT',
        paymentAttemptStatus: 'INITIATED',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Trying to restock pending order' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ORDER_NOT_RESTOCKABLE');
    });
  });

  describe('3. Restock Quantity Bounds & Anti-Double-Restock Mathematics', () => {
    it('supports partial restocking and prevents exceeding original ordered quantity', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product = await createTestProduct({ stockQuantity: 5 });
      const { order } = await createPaidOrderWithAttempt({
        product,
        quantity: 3, // Ordered 3
        orderStatus: 'REFUNDED',
        paymentAttemptStatus: 'REFUNDED',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      // Step 1: Restock 2 items (partial)
      const res1 = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({
          reason: 'Received partial batch (2 units)',
          items: [{ productId: product.id, quantity: 2 }],
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data.totalQuantityRestocked).toBe(2);

      let p = await Product.findByPk(product.id);
      expect(p.stock_quantity).toBe(7); // 5 + 2 = 7

      // Step 2: Attempt to restock 2 items again (which would total 4 > ordered 3) -> Rejection!
      const res2 = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({
          reason: 'Attempting to restock 2 more units (overshoot)',
          items: [{ productId: product.id, quantity: 2 }],
        });

      expect(res2.status).toBe(422);
      expect(res2.body.error.code).toBe('RESTOCK_QUANTITY_EXCEEDED');

      // Step 3: Restock remaining 1 eligible item
      const res3 = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({
          reason: 'Received final 1 unit',
          items: [{ productId: product.id, quantity: 1 }],
        });

      expect(res3.status).toBe(200);
      expect(res3.body.data.totalQuantityRestocked).toBe(1);

      p = await Product.findByPk(product.id);
      expect(p.stock_quantity).toBe(8); // 7 + 1 = 8

      // Step 4: Any further restock attempt rejected because remaining is 0
      const res4 = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({
          reason: 'Trying to restock again when all units already restocked',
        });

      expect(res4.status).toBe(422);
      expect(res4.body.error.code).toBe('RESTOCK_QUANTITY_EXCEEDED');
    });

    it('rejects foreign product IDs not present in the order with 400 RESTOCK_NOT_ALLOWED', async () => {
      const { user: admin, password } = await createTestAdmin();
      const product1 = await createTestProduct({ name: 'Product 1' });
      const product2 = await createTestProduct({ name: 'Product 2 (Foreign)' });
      const { order } = await createPaidOrderWithAttempt({
        product: product1,
        orderStatus: 'REFUNDED',
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({
          reason: 'Attempting to inject foreign product',
          items: [{ productId: product2.id, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('RESTOCK_NOT_ALLOWED');
    });
  });

  describe('4. Multi-Product Atomicity & Rollback', () => {
    it('restocks multiple products in ascending UUID order atomically in a single transaction', async () => {
      const { user: admin, password } = await createTestAdmin();
      const p1 = await createTestProduct({ name: 'Keyboard', stockQuantity: 10, pricePaise: 100000 });
      const p2 = await createTestProduct({ name: 'Mouse', stockQuantity: 20, pricePaise: 50000 });

      // Create multi-item refunded order
      const order = await Order.create({
        id: crypto.randomUUID(),
        user_id: admin.id,
        order_status: 'REFUNDED',
        total_cost_paise: 200000,
        shipping_fee_paise: 0,
        shipping_full_name: 'Buyer',
        shipping_address_line1: '123 St',
        shipping_city: 'BLR',
        shipping_state: 'KA',
        shipping_pincode: '560001',
        shipping_phone: '9876543210',
        reservation_expires_at: new Date(),
      });

      await OrderItem.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: p1.id,
        product_name_snapshot: p1.name,
        quantity: 1,
        unit_price_paise: 100000,
      });

      await OrderItem.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: p2.id,
        product_name_snapshot: p2.name,
        quantity: 2,
        unit_price_paise: 50000,
      });

      const { cookieHeader, csrfToken } = await getAuthSession(admin, password);

      const res = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('Idempotency-Key', `idemp_${crypto.randomUUID()}`)
        .send({ reason: 'Returned bundle received' });

      expect(res.status).toBe(200);
      expect(res.body.data.totalQuantityRestocked).toBe(3);
      expect(res.body.data.restockedItems).toHaveLength(2);

      const reloadedP1 = await Product.findByPk(p1.id);
      expect(reloadedP1.stock_quantity).toBe(11); // 10 + 1 = 11

      const reloadedP2 = await Product.findByPk(p2.id);
      expect(reloadedP2.stock_quantity).toBe(22); // 20 + 2 = 22

      const logs = await StockRestockLog.findAll({ where: { order_id: order.id } });
      expect(logs).toHaveLength(2);
    });
  });
});
