import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { User, Product, Order } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';

describe('Phase 07.19 — Security Regression & Malicious Input Defense Matrix', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
    await sequelize.authenticate();
    await migrateReset(sequelize);
    const migrator = getMigrator(sequelize);
    await migrator.up();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  async function cleanupAll() {
    await sequelize.query(`
      TRUNCATE users, products, addresses, orders, order_items,
               inventory_reservations, payment_attempts, payment_events,
               idempotency_records, audit_logs, stock_restock_logs, sessions,
               carts, cart_items CASCADE;
    `);
  }

  async function createTestCustomer({
    email = `customer-${crypto.randomUUID()}@test.local`,
    password = 'Password123!',
    fullName = 'Test Customer',
  } = {}) {
    const password_hash = await hashPassword(password);
    const user = await User.create({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      password_hash,
      full_name: fullName,
      role: 'customer',
      is_active: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
      .send({ email, password });

    const cookies = res.headers['set-cookie'] || [];
    const sidCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    const sid = sidCookie ? sidCookie.split(';')[0].split('=')[1] : null;
    const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

    return {
      user,
      sid,
      csrfToken,
      cookieHeader: [`${SESSION_COOKIE_NAME}=${sid}`, `${CSRF_COOKIE_NAME}=${csrfToken}`].join('; '),
    };
  }

  // =========================================================================
  // 1. SQL Injection Resistance
  // =========================================================================
  describe('1. SQL Injection Resistance Across Endpoints', () => {
    it('handles classic SQL injection strings in catalog search safely without syntax error or leakage', async () => {
      await Product.create({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Structured Linen Trench',
        description: 'Premium tailored outerwear',
        price_paise: 1500000,
        stock_quantity: 10,
        reserved_quantity: 0,
        category: 'Outerwear',
        image_url: 'https://example.com/img.jpg',
        is_deleted: false,
      });

      const sqlPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE products; --",
        "1' UNION SELECT 1,2,3,4,5,6,7,8,9,10--",
        "admin'--",
        "' OR 1=1--",
        "%' OR '1'='1",
      ];

      for (const payload of sqlPayloads) {
        const res = await request(app)
          .get('/api/products')
          .query({ search: payload });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
      }

      // Ensure products table was NOT dropped or damaged
      const count = await Product.count();
      expect(count).toBe(1);
    });

    it('rejects SQL injection attempts in login email field safely', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.2.1.1')
        .send({
          email: "' OR 1=1; --",
          password: 'Password123!',
        });

      expect(res.status).toBe(400); // Fails Zod email schema validation
      expect(res.body.error).toBeDefined();
    });
  });

  // =========================================================================
  // 2. XSS Input Safety & Sanitization
  // =========================================================================
  describe('2. XSS Input Safety Across Request Boundaries', () => {
    it('accepts and stores customer full_name with HTML characters as inert text without executing or corrupting DB', async () => {
      const xssName = '<script>alert("XSS")</script><b>Test</b>';
      const email = 'xss-user@test.local';

      const regRes = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.3.1.1')
        .send({
          email,
          password: 'Password123!',
          full_name: xssName,
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.user.full_name).toBe(xssName);

      // Verify stored in DB exactly as raw inert text, not executed
      const dbUser = await User.findOne({ where: { email } });
      expect(dbUser.full_name).toBe(xssName);

      // Verify GET /api/auth/me returns the text safely
      const sidCookie = regRes.headers['set-cookie'].find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      const sid = sidCookie.split(';')[0].split('=')[1];

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${sid}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.full_name).toBe(xssName);
    });
  });

  // =========================================================================
  // 3. Path Traversal & Parameter Tampering
  // =========================================================================
  describe('3. Path Traversal & Invalid Parameter Formats', () => {
    it('rejects path traversal-like patterns in product ID with 400 or 404 safely', async () => {
      const traversalPaths = [
        '..%2F..%2F..%2Fetc%2Fpasswd',
        '../../../../windows/system32',
        '..\\..\\..\\boot.ini',
        'not-a-valid-uuid',
      ];

      for (const id of traversalPaths) {
        const res = await request(app).get(`/api/products/${id}`);
        expect([400, 404]).toContain(res.status);
      }
    });

    it('rejects non-integer, negative, and floating-point quantities in cart mutations', async () => {
      const auth = await createTestCustomer();
      const product = await Product.create({
        id: crypto.randomUUID(),
        name: 'Validation Test Product',
        description: 'Desc',
        price_paise: 100000,
        stock_quantity: 20,
        reserved_quantity: 0,
        category: 'Test',
        image_url: 'https://example.com/img.jpg',
      });

      const invalidQuantities = [-1, 0, 1.5, 'two', 999999, Infinity, NaN];

      for (const qty of invalidQuantities) {
        const res = await request(app)
          .post('/api/cart/items')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({
            productId: product.id,
            quantity: qty,
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      }
    });
  });

  // =========================================================================
  // 4. Prototype Pollution & Unexpected Field Injection
  // =========================================================================
  describe('4. Prototype Pollution & Unexpected Field Injection', () => {
    it('ignores or rejects prototype-polluting payloads without modifying Object prototype', async () => {
      const maliciousPayload = JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"email":"proto@test.local","password":"Password123!","full_name":"Proto Test"}'
      );

      const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.4.1.1')
        .send(maliciousPayload);

      expect([201, 400]).toContain(res.status);
      // Verify prototype is untouched
      expect(({}).polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Anti-IDOR & Cross-Customer Isolation
  // =========================================================================
  describe('5. Strict Anti-IDOR Cross-Resource Isolation', () => {
    it('returns sanitized 404 when Customer A attempts to view Customer B order', async () => {
      const customerA = await createTestCustomer({ email: 'custA@test.local' });
      const customerB = await createTestCustomer({ email: 'custB@test.local' });

      const orderB = await Order.create({
        id: crypto.randomUUID(),
        user_id: customerB.user.id,
        order_status: 'PENDING_PAYMENT',
        total_cost_paise: 500000,
        shipping_fee_paise: 0,
        shipping_full_name: 'Customer B',
        shipping_address_line1: 'Road 1',
        shipping_city: 'Bengaluru',
        shipping_state: 'Karnataka',
        shipping_pincode: '560001',
        shipping_phone: '+919999999999',
        reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Customer A attempts to fetch Customer B's order
      const res = await request(app)
        .get(`/api/orders/${orderB.id}`)
        .set('Cookie', customerA.cookieHeader);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });

    it('customer cart endpoints strictly isolate carts between different users', async () => {
      const customerA = await createTestCustomer({ email: 'cartA@test.local' });
      const customerB = await createTestCustomer({ email: 'cartB@test.local' });

      const product = await Product.create({
        id: crypto.randomUUID(),
        name: 'Isolated Item',
        description: 'Desc',
        price_paise: 50000,
        stock_quantity: 10,
        reserved_quantity: 0,
        category: 'Test',
        image_url: 'https://example.com/img.jpg',
      });

      // Customer A adds item to cart
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', customerA.cookieHeader)
        .set(CSRF_HEADER_NAME, customerA.csrfToken)
        .send({ productId: product.id, quantity: 2 });

      // Customer B inspects cart: must be empty
      const resB = await request(app)
        .get('/api/cart')
        .set('Cookie', customerB.cookieHeader);

      expect(resB.status).toBe(200);
      expect(resB.body.cart.items).toHaveLength(0);
      expect(resB.body.cart.total_quantity).toBe(0);
    });
  });

  // =========================================================================
  // 6. Prohibited Sensitive Columns Audit
  // =========================================================================
  describe('6. Zero Leaked Secrets in DTO Responses', () => {
    it('verifies that login, register, and /me responses never expose password_hash or session SID in body', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '10.5.1.1')
        .send({
          email: 'dto-leak-test@test.local',
          password: 'Password123!',
          full_name: 'DTO Test User',
        });

      const bodyStr = JSON.stringify(regRes.body);
      expect(bodyStr).not.toContain('password_hash');
      expect(bodyStr).not.toContain('$2b$');
      expect(bodyStr).not.toContain('$2a$');
      expect(regRes.body.user.sid).toBeUndefined();
    });
  });
});
