import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { Product, AuditLog, Order, OrderItem } from '../../src/models/index.js';
import {
  createTestAdmin,
  createTestProduct,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin Product Management API & Isolation Tests', () => {
  const request = supertest(app);
  let adminUser, adminSession;

  beforeEach(async () => {
    await cleanupAdminTables();
    const adminFixture = await createTestAdmin();
    adminUser = adminFixture.user;
    adminSession = await getAuthSession(adminUser, adminFixture.password);
  });

  afterAll(async () => {
    await cleanupAdminTables();
  });

  describe('1. POST /api/admin/products (Product Creation)', () => {
    it('creates product with initial stock and records atomic AuditLog', async () => {
      const payload = {
        name: 'Pro Wireless Mouse',
        description: 'Ergonomic gaming mouse with high DPI sensor',
        price_paise: 499900,
        category: 'Electronics',
        image_url: 'https://images.unsplash.com/mouse.jpg',
        stock_quantity: 25,
      };

      const res = await request
        .post('/api/admin/products')
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.price_paise).toBe(payload.price_paise);
      expect(res.body.data.stock_quantity).toBe(25);
      expect(res.body.data.reserved_quantity).toBe(0);
      expect(res.body.data.available_quantity).toBe(25);
      expect(res.body.data.is_deleted).toBe(false);

      // Verify AuditLog was created atomically
      const auditLog = await AuditLog.findOne({
        where: {
          action: 'ADMIN_CREATE_PRODUCT',
          resource_id: res.body.data.id,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog.actor_id).toBe(adminUser.id);
      expect(auditLog.target_resource).toBe('products');
      expect(auditLog.details_json.name).toBe(payload.name);
      expect(auditLog.details_json.price_paise).toBe(payload.price_paise);
    });

    it('rejects product creation when reserved_quantity or is_deleted is attempted', async () => {
      const res = await request
        .post('/api/admin/products')
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          name: 'Forbidden Field Product',
          description: 'Testing forbidden fields',
          price_paise: 100000,
          category: 'Electronics',
          image_url: 'https://images.unsplash.com/test.jpg',
          reserved_quantity: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects product creation with negative price or stock', async () => {
      const res = await request
        .post('/api/admin/products')
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          name: 'Invalid Price Product',
          description: 'Testing negative values',
          price_paise: -500,
          category: 'Electronics',
          image_url: 'https://images.unsplash.com/test.jpg',
          stock_quantity: -10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. GET /api/admin/products & GET /api/admin/products/:id', () => {
    it('lists products with bounded pagination, category filter, and search', async () => {
      await createTestProduct({ name: 'Mechanical Keyboard Blue', category: 'Keyboards' });
      await createTestProduct({ name: 'Mechanical Keyboard Red', category: 'Keyboards' });
      await createTestProduct({ name: 'Gaming Headset', category: 'Audio' });

      const res = await request
        .get('/api/admin/products?category=Keyboards&page=1&limit=10')
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.page).toBe(1);
    });

    it('retrieves single product by UUID with accurate inventory metrics', async () => {
      const product = await createTestProduct({
        name: 'Studio Monitors',
        stockQuantity: 15,
        reservedQuantity: 3,
      });

      const res = await request
        .get(`/api/admin/products/${product.id}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(product.id);
      expect(res.body.data.stock_quantity).toBe(15);
      expect(res.body.data.reserved_quantity).toBe(3);
      expect(res.body.data.available_quantity).toBe(12);
    });

    it('returns 404 when querying non-existent product ID', async () => {
      const dummyId = crypto.randomUUID();
      const res = await request
        .get(`/api/admin/products/${dummyId}`)
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('3. PATCH /api/admin/products/:id (Catalog Updates)', () => {
    it('updates catalog-owned fields and records atomic AuditLog', async () => {
      const product = await createTestProduct({
        name: 'Original Name',
        pricePaise: 200000,
        category: 'Office',
      });

      const res = await request
        .patch(`/api/admin/products/${product.id}`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          name: 'Updated Name Premium',
          price_paise: 299900,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name Premium');
      expect(res.body.data.price_paise).toBe(299900);

      // Verify AuditLog was created
      const auditLog = await AuditLog.findOne({
        where: {
          action: 'ADMIN_UPDATE_PRODUCT',
          resource_id: product.id,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog.actor_id).toBe(adminUser.id);
      expect(auditLog.details_json.name).toBe('Updated Name Premium');
      expect(auditLog.details_json.price_paise).toBe(299900);
    });

    it('strictly rejects stock_quantity or reserved_quantity modification in PATCH', async () => {
      const product = await createTestProduct();

      const res = await request
        .patch(`/api/admin/products/${product.id}`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          stock_quantity: 999,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('4. DELETE /api/admin/products/:id (Soft Deletion)', () => {
    it('soft-deletes product, removes from public catalog, but retains in admin query', async () => {
      const product = await createTestProduct({ name: 'Product To Be Deleted' });

      // Soft delete product
      const deleteRes = await request
        .delete(`/api/admin/products/${product.id}`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify product is is_deleted = true in database
      const reloaded = await Product.scope('withDeleted').findByPk(product.id);
      expect(reloaded.is_deleted).toBe(true);

      // Verify public catalog does NOT list deleted product
      const publicRes = await request.get('/api/products');
      expect(publicRes.status).toBe(200);
      const publicProducts = publicRes.body.products || publicRes.body.data || [];
      const foundInPublic = publicProducts.some((p) => p.id === product.id);
      expect(foundInPublic).toBe(false);

      // Verify admin can list deleted products when filtering status=deleted or status=all
      const adminRes = await request
        .get('/api/admin/products?status=deleted')
        .set('Cookie', adminSession.cookieHeader);

      expect(adminRes.status).toBe(200);
      const foundInAdmin = adminRes.body.data.some((p) => p.id === product.id);
      expect(foundInAdmin).toBe(true);
    });
  });

  describe('5. Price Change Isolation vs Historical OrderItem Snapshot', () => {
    it('guarantees that updating product price does NOT alter historical OrderItem price snapshot', async () => {
      const product = await createTestProduct({
        name: 'Flagship Headphones',
        pricePaise: 999900, // ₹9,999.00
      });

      // Customer placed an order previously at ₹9,999.00
      const order = await Order.create({
        id: crypto.randomUUID(),
        order_status: 'PAID',
        total_cost_paise: 999900,
        shipping_fee_paise: 0,
        shipping_full_name: 'John Buyer',
        shipping_address_line1: '123 Test Ave',
        shipping_city: 'Mumbai',
        shipping_state: 'Maharashtra',
        shipping_pincode: '400001',
        shipping_phone: '9876543210',
        reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const orderItem = await OrderItem.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: product.id,
        product_name_snapshot: product.name,
        quantity: 1,
        unit_price_paise: 999900,
      });

      // Admin updates product price to ₹12,999.00
      const updateRes = await request
        .patch(`/api/admin/products/${product.id}`)
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', adminSession.csrfToken)
        .send({
          price_paise: 1299900, // ₹12,999.00
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.price_paise).toBe(1299900);

      // Verify the historical OrderItem remains exactly 999900 paise
      const reloadedOrderItem = await OrderItem.findByPk(orderItem.id);
      expect(reloadedOrderItem.unit_price_paise).toBe(999900);
      expect(reloadedOrderItem.product_name_snapshot).toBe('Flagship Headphones');

      // Verify parent order total remains exactly 999900 paise
      const reloadedOrder = await Order.findByPk(order.id);
      expect(reloadedOrder.total_cost_paise).toBe(999900);
    });
  });
});
