import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { Product, StockRestockLog } from '../../src/models/index.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import {
  createTestAdmin,
  createTestCustomer,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin Operations End-to-End Lifecycles', () => {
  const request = supertest(app);
  let adminUser, adminSession;
  let customerUser, customerSession;

  beforeEach(async () => {
    await cleanupAdminTables();
    const adminFixture = await createTestAdmin();
    adminUser = adminFixture.user;
    adminSession = await getAuthSession(adminUser, adminFixture.password);

    const customerFixture = await createTestCustomer();
    customerUser = customerFixture.user;
    customerSession = await getAuthSession(customerUser, customerFixture.password);
  });

  afterAll(async () => {
    await cleanupAdminTables();
  });

  describe('E2E A — Admin Catalog Lifecycle (Create -> Read -> Update -> Soft Delete -> Audit)', () => {
    it('executes full administrative product lifecycle and preserves auditability', async () => {
      // 1. Admin creates product
      const createRes = await request
        .post('/api/admin/products')
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          name: 'Mechanical Gaming Keyboard RGB',
          description: 'Custom mechanical keyboard with hot-swappable switches',
          price_paise: 749900,
          category: 'Keyboards',
          image_url: 'https://images.unsplash.com/keyboard-rgb.jpg',
          stock_quantity: 50,
        });

      expect(createRes.status).toBe(201);
      const productId = createRes.body.data.id;
      expect(createRes.body.data.stock_quantity).toBe(50);
      expect(createRes.body.data.available_quantity).toBe(50);

      // 2. Customer views public catalog
      const publicCatalogRes = await request.get('/api/products');
      expect(publicCatalogRes.status).toBe(200);
      const foundInPublic = (publicCatalogRes.body.products || publicCatalogRes.body.data || []).find((p) => p.id === productId);
      expect(foundInPublic).toBeDefined();
      expect(foundInPublic.name).toBe('Mechanical Gaming Keyboard RGB');

      // 3. Admin retrieves product detail
      const getRes = await request
        .get(`/api/admin/products/${productId}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(productId);

      // 4. Admin updates product catalog fields
      const updateRes = await request
        .patch(`/api/admin/products/${productId}`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          name: 'Mechanical Gaming Keyboard RGB Pro Edition',
          price_paise: 799900,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Mechanical Gaming Keyboard RGB Pro Edition');
      expect(updateRes.body.data.price_paise).toBe(799900);

      // 5. Admin soft-deletes product
      const deleteRes = await request
        .delete(`/api/admin/products/${productId}`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // 6. Verify public catalog no longer shows deleted product
      const publicCatalogAfterDelete = await request.get('/api/products');
      const foundAfterDelete = (publicCatalogAfterDelete.body.products || publicCatalogAfterDelete.body.data || []).find((p) => p.id === productId);
      expect(foundAfterDelete).toBeUndefined();

      // 7. Admin queries audit logs
      const auditRes = await request
        .get(`/api/admin/audit-logs?targetResource=products&resourceId=${productId}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.length).toBe(3); // CREATE, UPDATE, DELETE
    });
  });

  describe('E2E B — Admin Fulfillment Lifecycle (PAID -> PROCESSING -> SHIPPED -> DELIVERED)', () => {
    it('executes full fulfillment workflow across valid state machine transitions', async () => {
      const product = await createTestProduct({ name: 'Fulfillment Test Item' });
      const { order } = await createPaidOrderWithAttempt({
        userId: customerUser.id,
        product,
        orderStatus: 'PAID',
      });

      // 1. Admin lists orders and inspects target order
      const listRes = await request
        .get(`/api/admin/orders?userId=${customerUser.id}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((o) => o.id === order.id)).toBe(true);

      // 2. Admin retrieves order detail
      const detailRes = await request
        .get(`/api/admin/orders/${order.id}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.orderStatus).toBe('PAID');

      // 3. Admin transitions PAID -> PROCESSING
      const processRes = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'PROCESSING', note: 'Order picked from shelf' });

      expect(processRes.status).toBe(200);
      expect(processRes.body.data.orderStatus).toBe('PROCESSING');

      // 4. Admin transitions PROCESSING -> SHIPPED
      const shipRes = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'SHIPPED', note: 'Tracking #TRACK123' });

      expect(shipRes.status).toBe(200);
      expect(shipRes.body.data.orderStatus).toBe('SHIPPED');

      // 5. Admin transitions SHIPPED -> DELIVERED
      const deliverRes = await request
        .patch(`/api/admin/orders/${order.id}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({ status: 'DELIVERED', note: 'Delivered to front porch' });

      expect(deliverRes.status).toBe(200);
      expect(deliverRes.body.data.orderStatus).toBe('DELIVERED');

      // 6. Customer reads order and sees DELIVERED status
      const customerOrderRes = await request
        .get(`/api/orders/${order.id}`)
        .set('Cookie', customerSession.cookieHeader);

      expect(customerOrderRes.status).toBe(200);
      expect(customerOrderRes.body.data.orderStatus).toBe('DELIVERED');
    });
  });

  describe('E2E C — Refund & Restock Integration Lifecycle (Phase 07.12 Integration)', () => {
    it('verifies refund and explicit restocking through the sealed Phase 07.12 path', async () => {
      const product = await createTestProduct({
        name: 'Returnable Item',
        stockQuantity: 10,
        reservedQuantity: 0,
      });

      const { order, paymentAttempt } = await createPaidOrderWithAttempt({
        userId: customerUser.id,
        product,
        quantity: 2,
        orderStatus: 'PAID',
      });

      // Mock Razorpay refund SDK
      const refundSpy = vi.spyOn(razorpayGateway, 'refundPayment').mockResolvedValue({
        id: 'rfnd_e2e_test_123',
        payment_id: paymentAttempt.razorpay_payment_id,
        amount: Number(paymentAttempt.amount_paise),
        currency: 'INR',
        status: 'processed',
      });

      const idempotencyKeyRefund = crypto.randomUUID();

      // 1. Admin issues full refund
      const refundRes = await request
        .post(`/api/admin/orders/${order.id}/refund`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .set('Idempotency-Key', idempotencyKeyRefund)
        .send({ reason: 'Customer requested return' });

      expect(refundRes.status).toBe(200);
      expect(refundRes.body.data.orderStatus).toBe('REFUNDED');
      expect(refundRes.body.data.refundId).toBe('rfnd_e2e_test_123');

      // Verify stock was NOT restocked by refund
      let reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(10);

      // 2. Admin performs explicit physical restock
      const idempotencyKeyRestock = crypto.randomUUID();
      const restockRes = await request
        .post(`/api/admin/orders/${order.id}/restock`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .set('Idempotency-Key', idempotencyKeyRestock)
        .send({
          reason: 'Inspected and returned to sellable shelf',
          items: [
            { productId: product.id, quantity: 2 },
          ],
        });

      expect(restockRes.status).toBe(200);
      expect(restockRes.body.data.totalQuantityRestocked).toBe(2);

      // Verify stock was incremented to 12
      reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(12);

      // Verify StockRestockLog
      const restockLogs = await StockRestockLog.findAll({ where: { order_id: order.id } });
      expect(restockLogs.length).toBe(1);
      expect(restockLogs[0].quantity_restocked).toBe(2);
      expect(restockLogs[0].initiated_by).toBe(adminUser.id);

      refundSpy.mockRestore();
    });
  });
});
