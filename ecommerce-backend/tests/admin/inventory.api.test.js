import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../../src/app.js';
import {
  createTestAdmin,
  createTestCustomer,
  createTestProduct,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin Inventory Overview & Read Model Tests', () => {
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

  describe('1. GET /api/admin/inventory (Inventory Overview)', () => {
    it('returns accurate stock, reserved, and available quantities', async () => {
      await createTestProduct({
        name: 'Item A',
        stockQuantity: 100,
        reservedQuantity: 20,
      });

      await createTestProduct({
        name: 'Item B',
        stockQuantity: 10,
        reservedQuantity: 8,
      });

      const res = await request
        .get('/api/admin/inventory')
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);

      const itemA = res.body.data.find((i) => i.name === 'Item A');
      expect(itemA.stockQuantity).toBe(100);
      expect(itemA.reservedQuantity).toBe(20);
      expect(itemA.availableQuantity).toBe(80);

      const itemB = res.body.data.find((i) => i.name === 'Item B');
      expect(itemB.stockQuantity).toBe(10);
      expect(itemB.reservedQuantity).toBe(8);
      expect(itemB.availableQuantity).toBe(2);
    });

    it('filters low stock items when lowStockOnly=true is queried', async () => {
      await createTestProduct({
        name: 'High Stock Product',
        stockQuantity: 50,
        reservedQuantity: 0,
      });

      await createTestProduct({
        name: 'Critical Stock Product',
        stockQuantity: 4,
        reservedQuantity: 1,
      });

      const res = await request
        .get('/api/admin/inventory?lowStockOnly=true')
        .set('Cookie', adminSession.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Critical Stock Product');
      expect(res.body.data[0].availableQuantity).toBe(3);
    });

    it('rejects customer and guest tokens from accessing inventory overview with 403/401', async () => {
      const custRes = await request
        .get('/api/admin/inventory')
        .set('Cookie', customerSession.cookieHeader);
      expect(custRes.status).toBe(403);

      const unauthRes = await request.get('/api/admin/inventory');
      expect(unauthRes.status).toBe(401);
    });
  });
});
