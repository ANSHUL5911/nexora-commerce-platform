import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import {
  createTestAdmin,
  createTestCustomer,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin RBAC & CSRF Security Authorization Tests', () => {
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

  describe('1. Authentication Requirement (401 UNAUTHENTICATED)', () => {
    const dummyUuid = crypto.randomUUID();

    it('rejects unauthenticated GET /api/admin/products with 401', async () => {
      const res = await request.get('/api/admin/products');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated GET /api/admin/inventory with 401', async () => {
      const res = await request.get('/api/admin/inventory');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated GET /api/admin/orders with 401', async () => {
      const res = await request.get('/api/admin/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated GET /api/admin/audit-logs with 401', async () => {
      const res = await request.get('/api/admin/audit-logs');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated POST /api/admin/products with 401', async () => {
      const res = await request.post('/api/admin/products').send({
        name: 'Unauth Item',
        description: 'Test',
        price_paise: 10000,
        category: 'Test',
        image_url: 'https://example.com/img.jpg',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated PATCH /api/admin/products/:id with 401', async () => {
      const res = await request.patch(`/api/admin/products/${dummyUuid}`).send({ name: 'New' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated DELETE /api/admin/products/:id with 401', async () => {
      const res = await request.delete(`/api/admin/products/${dummyUuid}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated PATCH /api/admin/orders/:orderId/status with 401', async () => {
      const res = await request.patch(`/api/admin/orders/${dummyUuid}/status`).send({ status: 'PROCESSING' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('2. Customer Role Rejection (403 INSUFFICIENT_PERMISSIONS)', () => {
    const dummyUuid = crypto.randomUUID();

    it('rejects customer GET /api/admin/products with 403', async () => {
      const res = await request
        .get('/api/admin/products')
        .set('Cookie', customerSession.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects customer GET /api/admin/inventory with 403', async () => {
      const res = await request
        .get('/api/admin/inventory')
        .set('Cookie', customerSession.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects customer GET /api/admin/orders with 403', async () => {
      const res = await request
        .get('/api/admin/orders')
        .set('Cookie', customerSession.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects customer GET /api/admin/audit-logs with 403', async () => {
      const res = await request
        .get('/api/admin/audit-logs')
        .set('Cookie', customerSession.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects customer POST /api/admin/products with 403', async () => {
      const res = await request
        .post('/api/admin/products')
        .set('Cookie', customerSession.cookieHeader)
        .set('X-CSRF-Token', customerSession.csrfToken)
        .send({
          name: 'Customer Created Item',
          description: 'Test',
          price_paise: 10000,
          category: 'Test',
          image_url: 'https://example.com/img.jpg',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('rejects customer PATCH /api/admin/orders/:orderId/status with 403', async () => {
      const res = await request
        .patch(`/api/admin/orders/${dummyUuid}/status`)
        .set('Cookie', customerSession.cookieHeader)
        .set('X-CSRF-Token', customerSession.csrfToken)
        .send({ status: 'PROCESSING' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('3. Guest Token Rejection (403 INSUFFICIENT_PERMISSIONS)', () => {
    it('rejects guest token attempting admin endpoints with 401/403', async () => {
      const res = await request
        .get('/api/admin/orders')
        .set('X-Guest-Token', 'raw_guest_token_1234567890');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('4. CSRF Protection Enforcement', () => {
    it('rejects POST /api/admin/products when CSRF header is missing', async () => {
      const res = await request
        .post('/api/admin/products')
        .set('Cookie', adminSession.cookieHeader)
        .send({
          name: 'No CSRF Item',
          description: 'Test',
          price_paise: 10000,
          category: 'Test',
          image_url: 'https://example.com/img.jpg',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('rejects POST /api/admin/products with invalid CSRF token', async () => {
      const res = await request
        .post('/api/admin/products')
        .set('Cookie', adminSession.cookieHeader)
        .set('X-CSRF-Token', 'invalid_csrf_token_value')
        .send({
          name: 'Invalid CSRF Item',
          description: 'Test',
          price_paise: 10000,
          category: 'Test',
          image_url: 'https://example.com/img.jpg',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects PATCH /api/admin/orders/:orderId/status without valid CSRF token', async () => {
      const dummyUuid = crypto.randomUUID();
      const res = await request
        .patch(`/api/admin/orders/${dummyUuid}/status`)
        .set('Cookie', adminSession.cookieHeader)
        .send({ status: 'PROCESSING' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });
  });
});
