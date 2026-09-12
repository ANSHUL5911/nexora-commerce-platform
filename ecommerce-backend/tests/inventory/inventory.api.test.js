import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { createApp } from '../../src/app.js';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { User, Product, InventoryReservation } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';
import {
  createTestOrder,
  createTestProduct,
  cleanupInventoryTables,
} from './helpers/inventoryTestFixtures.js';

describe('Phase 07.6 — Inventory API Integration & Security Tests', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
    await sequelize.authenticate();
    await migrateReset(sequelize);
    const migrator = getMigrator(sequelize);
    await migrator.up();
  });

  afterAll(async () => {
    await cleanupInventoryTables();
  });

  beforeEach(async () => {
    await cleanupInventoryTables();
  });

  // Helper to create and authenticate a test user
  async function createAndLoginUser({ email, password = 'Password123!', fullName = 'Test Customer', role = 'customer' } = {}) {
    const userEmail = email || `user-${crypto.randomUUID()}@example.com`;
    const password_hash = await hashPassword(password);
    const user = await User.create({
      id: crypto.randomUUID(),
      email: userEmail.toLowerCase(),
      password_hash,
      full_name: fullName,
      role,
      is_active: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
      .send({ email: userEmail, password });

    const cookies = res.headers['set-cookie'] || [];
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

    const sid = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
    const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

    const cookieHeader = [
      `${SESSION_COOKIE_NAME}=${sid}`,
      `${CSRF_COOKIE_NAME}=${csrfToken}`,
    ].join('; ');

    return {
      user,
      sid,
      csrfToken,
      cookieHeader,
    };
  }

  describe('1. Authentication & CSRF Enforcement', () => {
    it('rejects unauthenticated reservation creation with 401 UNAUTHENTICATED', async () => {
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder();

      const res = await request(app)
        .post('/api/inventory/reservations')
        .send({
          productId: product.id,
          orderId: order.id,
          quantity: 1,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects mutating reservation requests when CSRF token is missing with 403', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: auth.user.id });

      const res = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${auth.sid}`) // Missing CSRF header and cookie
        .send({
          productId: product.id,
          orderId: order.id,
          quantity: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });
  });

  describe('2. Reservation Creation & Stock Validation', () => {
    it('successfully creates a reservation with exact 15-minute PostgreSQL TTL', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });
      const order = await createTestOrder({ userId: auth.user.id });

      const res = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: product.id,
          orderId: order.id,
          quantity: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.reservation).toBeDefined();
      expect(res.body.reservation.quantity).toBe(3);
      expect(res.body.reservation.status).toBe('ACTIVE');
      expect(res.body.reservation.productId).toBe(product.id);
      expect(res.body.reservation.orderId).toBe(order.id);

      // Verify product reserved_quantity was incremented in DB
      const updatedProduct = await Product.findByPk(product.id);
      expect(updatedProduct.reserved_quantity).toBe(3);
      expect(updatedProduct.stock_quantity).toBe(10);
      expect(updatedProduct.available_quantity).toBe(7);

      // Verify expiration is ~15 minutes after creation
      const createdAt = new Date(res.body.reservation.createdAt).getTime();
      const expiresAt = new Date(res.body.reservation.expiresAt).getTime();
      const diffMinutes = (expiresAt - createdAt) / (60 * 1000);
      expect(Math.round(diffMinutes)).toBe(15);
    });

    it('returns 409 INSUFFICIENT_STOCK when requested quantity exceeds available stock', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 5, reservedQuantity: 3 }); // available = 2
      const order = await createTestOrder({ userId: auth.user.id });

      const res = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: product.id,
          orderId: order.id,
          quantity: 3, // 3 > 2
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

      // Product reserved_quantity must remain unchanged
      const unchanged = await Product.findByPk(product.id);
      expect(unchanged.reserved_quantity).toBe(3);
    });

    it('returns 409 INSUFFICIENT_STOCK when available stock is exactly 0', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 5, reservedQuantity: 5 }); // available = 0
      const order = await createTestOrder({ userId: auth.user.id });

      const res = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: product.id,
          orderId: order.id,
          quantity: 1,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects invalid quantities (0, negative, floats, strings, > 10) with 400 VALIDATION_ERROR', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 20 });
      const order = await createTestOrder({ userId: auth.user.id });

      const testCases = [
        { quantity: 0, desc: 'zero' },
        { quantity: -2, desc: 'negative' },
        { quantity: 2.5, desc: 'float' },
        { quantity: 'two', desc: 'string' },
        { quantity: 11, desc: 'greater than 10' },
      ];

      for (const tc of testCases) {
        const res = await request(app)
          .post('/api/inventory/reservations')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({
            productId: product.id,
            orderId: order.id,
            quantity: tc.quantity,
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('returns 404 PRODUCT_NOT_FOUND when product does not exist or is soft-deleted', async () => {
      const auth = await createAndLoginUser();
      const nonExistentId = crypto.randomUUID();
      const order = await createTestOrder({ userId: auth.user.id });

      const res404 = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: nonExistentId,
          orderId: order.id,
          quantity: 1,
        });

      expect(res404.status).toBe(404);
      expect(res404.body.error.code).toBe('PRODUCT_NOT_FOUND');

      // Soft deleted product
      const deletedProduct = await createTestProduct({ isDeleted: true });
      const resDeleted = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: deletedProduct.id,
          orderId: order.id,
          quantity: 1,
        });

      expect(resDeleted.status).toBe(404);
      expect(resDeleted.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects mass-assignment and client-provided expiration / stock counters', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: auth.user.id });

      const res = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: product.id,
          orderId: order.id,
          quantity: 2,
          expires_at: '2099-01-01T00:00:00Z',
          expiresAt: '2099-01-01T00:00:00Z',
          stock_quantity: 999,
          reserved_quantity: 0,
          status: 'CONVERTED',
        });

      // Strict validation schema rejects unrecognized / unauthorized fields
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Order Ownership & Anti-IDOR Protections', () => {
    it('returns sanitized 404 when User A attempts reservation against User B order', async () => {
      const userA = await createAndLoginUser({ email: 'userA@example.com' });
      const userB = await createAndLoginUser({ email: 'userB@example.com' });

      const product = await createTestProduct({ stockQuantity: 10 });
      const orderB = await createTestOrder({ userId: userB.user.id });

      // User A attempts to reserve inventory using User B's orderId
      const res = await request(app)
        .post('/api/inventory/reservations')
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken)
        .send({
          productId: product.id,
          orderId: orderB.id,
          quantity: 1,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESERVATION_NOT_FOUND');

      // Product must not be reserved
      const prod = await Product.findByPk(product.id);
      expect(prod.reserved_quantity).toBe(0);
    });

    it('returns sanitized 404 when querying or releasing another users reservation', async () => {
      const userA = await createAndLoginUser({ email: 'userA2@example.com' });
      const userB = await createAndLoginUser({ email: 'userB2@example.com' });

      const product = await createTestProduct({ stockQuantity: 10 });
      const orderB = await createTestOrder({ userId: userB.user.id });

      // Create reservation for User B
      const reservationB = await inventoryService.reserveInventory(product.id, 2, {
        orderId: orderB.id,
        userId: userB.user.id,
        role: 'CUSTOMER',
      });

      // User A attempts GET on User B's reservation
      const getRes = await request(app)
        .get(`/api/inventory/reservations/${reservationB.id}`)
        .set('Cookie', userA.cookieHeader);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('RESERVATION_NOT_FOUND');

      // User A attempts release on User B's reservation
      const releaseRes = await request(app)
        .post(`/api/inventory/reservations/${reservationB.id}/release`)
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken);

      expect(releaseRes.status).toBe(404);
      expect(releaseRes.body.error.code).toBe('RESERVATION_NOT_FOUND');

      // User A attempts convert on User B's reservation
      const convertRes = await request(app)
        .post(`/api/inventory/reservations/${reservationB.id}/convert`)
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken);

      expect(convertRes.status).toBe(404);
      expect(convertRes.body.error.code).toBe('RESERVATION_NOT_FOUND');
    });

    it('allows Admin to view and manage any reservation across users', async () => {
      const admin = await createAndLoginUser({ email: 'admin@example.com', role: 'admin' });
      const customer = await createAndLoginUser({ email: 'customer@example.com', role: 'customer' });

      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: customer.user.id });

      const reservation = await inventoryService.reserveInventory(product.id, 2, {
        orderId: order.id,
        userId: customer.user.id,
        role: 'CUSTOMER',
      });

      const getRes = await request(app)
        .get(`/api/inventory/reservations/${reservation.id}`)
        .set('Cookie', admin.cookieHeader);

      expect(getRes.status).toBe(200);
      expect(getRes.body.reservation.id).toBe(reservation.id);
    });
  });

  describe('4. Reservation Release & Idempotency', () => {
    it('successfully releases an active reservation and restores available quantity', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });
      const order = await createTestOrder({ userId: auth.user.id });

      const reservation = await inventoryService.reserveInventory(product.id, 4, {
        orderId: order.id,
        userId: auth.user.id,
        role: 'CUSTOMER',
      });

      let prod = await Product.findByPk(product.id);
      expect(prod.reserved_quantity).toBe(4);
      expect(prod.available_quantity).toBe(6);

      const releaseRes = await request(app)
        .post(`/api/inventory/reservations/${reservation.id}/release`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.reservation.status).toBe('RELEASED');
      expect(releaseRes.body.reservation.releasedAt).toBeDefined();

      prod = await Product.findByPk(product.id);
      expect(prod.reserved_quantity).toBe(0);
      expect(prod.available_quantity).toBe(10);
    });

    it('is idempotent on duplicate release calls', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });
      const order = await createTestOrder({ userId: auth.user.id });

      const reservation = await inventoryService.reserveInventory(product.id, 3, {
        orderId: order.id,
        userId: auth.user.id,
        role: 'CUSTOMER',
      });

      // First release
      const res1 = await request(app)
        .post(`/api/inventory/reservations/${reservation.id}/release`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(res1.status).toBe(200);
      expect(res1.body.reservation.status).toBe('RELEASED');

      // Second release (idempotent)
      const res2 = await request(app)
        .post(`/api/inventory/reservations/${reservation.id}/release`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(res2.status).toBe(200);
      expect(res2.body.reservation.status).toBe('RELEASED');

      const prod = await Product.findByPk(product.id);
      expect(prod.reserved_quantity).toBe(0); // Decremented exactly once
    });
  });

  describe('5. Reservation Conversion & Terminal Transitions', () => {
    it('converts an active reservation into permanent stock deduction', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });
      const order = await createTestOrder({ userId: auth.user.id });

      const reservation = await inventoryService.reserveInventory(product.id, 4, {
        orderId: order.id,
        userId: auth.user.id,
        role: 'CUSTOMER',
      });

      const convertRes = await request(app)
        .post(`/api/inventory/reservations/${reservation.id}/convert`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(convertRes.status).toBe(200);
      expect(convertRes.body.reservation.status).toBe('CONVERTED');

      // Invariants after conversion:
      // stock_quantity = 10 - 4 = 6
      // reserved_quantity = 4 - 4 = 0
      // available_quantity = 6 - 0 = 6
      const updatedProduct = await Product.findByPk(product.id);
      expect(updatedProduct.stock_quantity).toBe(6);
      expect(updatedProduct.reserved_quantity).toBe(0);
      expect(updatedProduct.available_quantity).toBe(6);
    });

    it('rejects conversion of an already released reservation with 409 Conflict', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: auth.user.id });

      const reservation = await inventoryService.reserveInventory(product.id, 2, {
        orderId: order.id,
        userId: auth.user.id,
        role: 'CUSTOMER',
      });

      // Release first
      await inventoryService.releaseReservation(reservation.id, {
        userId: auth.user.id,
        role: 'CUSTOMER',
      });

      // Attempt conversion on released reservation
      const convertRes = await request(app)
        .post(`/api/inventory/reservations/${reservation.id}/convert`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(convertRes.status).toBe(409);
      expect(convertRes.body.error.code).toBe('RESERVATION_ALREADY_RELEASED');
    });

    it('rejects conversion of an expired reservation with 409 Conflict', async () => {
      const auth = await createAndLoginUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });
      const order = await createTestOrder({ userId: auth.user.id });

      // Create an expired ACTIVE reservation
      const expiredRes = await InventoryReservation.create({
        order_id: order.id,
        product_id: product.id,
        quantity: 2,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP - INTERVAL '1 minute'"),
      });

      const convertRes = await request(app)
        .post(`/api/inventory/reservations/${expiredRes.id}/convert`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(convertRes.status).toBe(409);
      expect(convertRes.body.error.code).toBe('RESERVATION_EXPIRED');
    });
  });

  describe('6. Public Stock Lookup', () => {
    it('returns stock counters via GET /api/inventory/products/:productId', async () => {
      const product = await createTestProduct({ stockQuantity: 15, reservedQuantity: 5 });

      const res = await request(app).get(`/api/inventory/products/${product.id}`);

      expect(res.status).toBe(200);
      expect(res.body.inventory).toEqual({
        id: product.id,
        stock_quantity: 15,
        stockQuantity: 15,
        reserved_quantity: 5,
        reservedQuantity: 5,
        available_quantity: 10,
        availableQuantity: 10,
      });
    });
  });
});
