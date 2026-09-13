import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../../src/app.js';
import { Product, AuditLog } from '../../src/models/index.js';
import {
  createTestAdmin,
  createTestProduct,
  getAuthSession,
  cleanupAdminTables,
} from './helpers/adminTestFixtures.js';

describe('Phase 07.13 — Admin Product Real PostgreSQL Concurrency Tests', () => {
  const request = supertest(app);
  let admin1, session1;
  let admin2, session2;

  beforeEach(async () => {
    await cleanupAdminTables();
    const fixture1 = await createTestAdmin({ email: 'admin1-concurrent@example.com' });
    admin1 = fixture1.user;
    session1 = await getAuthSession(admin1, fixture1.password);

    const fixture2 = await createTestAdmin({ email: 'admin2-concurrent@example.com' });
    admin2 = fixture2.user;
    session2 = await getAuthSession(admin2, fixture2.password);
  });

  afterAll(async () => {
    await cleanupAdminTables();
  });

  it('guarantees data consistency and atomic audit trails across concurrent product updates', async () => {
    const product = await createTestProduct({
      name: 'Base Product',
      pricePaise: 500000,
      description: 'Initial description',
    });

    // Fire 2 concurrent updates from distinct admin accounts
    const updatePromise1 = request
      .patch(`/api/admin/products/${product.id}`)
      .set('Cookie', session1.cookieHeader)
      .set('X-CSRF-Token', session1.csrfToken)
      .send({ name: 'Admin 1 Updated Name', price_paise: 550000 });

    const updatePromise2 = request
      .patch(`/api/admin/products/${product.id}`)
      .set('Cookie', session2.cookieHeader)
      .set('X-CSRF-Token', session2.csrfToken)
      .send({ name: 'Admin 2 Updated Name', description: 'Updated by Admin 2' });

    const [res1, res2] = await Promise.all([updatePromise1, updatePromise2]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Verify final state in PostgreSQL
    const finalProduct = await Product.findByPk(product.id);
    expect(finalProduct).not.toBeNull();
    expect(finalProduct.is_deleted).toBe(false);

    // Verify exactly 2 AuditLogs were created in PostgreSQL
    const auditLogs = await AuditLog.findAll({
      where: {
        action: 'ADMIN_UPDATE_PRODUCT',
        resource_id: product.id,
      },
    });

    expect(auditLogs.length).toBe(2);
    const actorIds = auditLogs.map((log) => log.actor_id);
    expect(actorIds).toContain(admin1.id);
    expect(actorIds).toContain(admin2.id);
  });
});
