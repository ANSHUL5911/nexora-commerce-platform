import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import crypto from 'crypto';
import { config } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { User, Product } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';

describe('Phase 07.5 — Cart Domain API Integration & Security Tests', () => {
  let app;
  let testSequelize;

  // Helper to create and authenticate a test user
  async function createAndLoginUser({ email, password = 'Password123!', fullName = 'Test User' }) {
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
      .set('X-Forwarded-For', `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
      .send({ email, password });

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

  const seedProducts = [
    {
      id: 'd0000000-0000-4000-8000-000000000001',
      name: 'Monolith Architectural Coat',
      description: 'Structured wool-blend oversized coat.',
      price_paise: 1899900, // ₹18,999.00
      stock_quantity: 10,
      reserved_quantity: 0,
      category: 'Outerwear',
      image_url: 'https://images.unsplash.com/coat',
      is_deleted: false,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000002',
      name: 'Minimalist Silk Evening Shirt',
      description: 'Raw mulberry silk draped silhouette.',
      price_paise: 849900, // ₹8,499.00
      stock_quantity: 15,
      reserved_quantity: 0,
      category: 'Apparel',
      image_url: 'https://images.unsplash.com/shirt',
      is_deleted: false,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000003',
      name: 'Brutalist Concrete Chronograph',
      description: 'Matte titanium case with stone composite dial.',
      price_paise: 2499900, // ₹24,999.00
      stock_quantity: 8,
      reserved_quantity: 8, // available_quantity = 0
      category: 'Timepieces',
      image_url: 'https://images.unsplash.com/watch',
      is_deleted: false,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000004',
      name: 'Limited Stock Scarf',
      description: 'Handwoven cashmere scarf.',
      price_paise: 350000, // ₹3,500.00
      stock_quantity: 4,
      reserved_quantity: 2, // available_quantity = 2
      category: 'Accessories',
      image_url: 'https://images.unsplash.com/scarf',
      is_deleted: false,
    },
    {
      id: 'd0000000-0000-4000-8000-000000000005',
      name: 'Archived Soft-Deleted Item',
      description: 'Soft-deleted catalog item.',
      price_paise: 100000,
      stock_quantity: 10,
      reserved_quantity: 0,
      category: 'Accessories',
      image_url: 'https://images.unsplash.com/archived',
      is_deleted: true,
    },
  ];

  beforeAll(async () => {
    app = createApp();

    testSequelize = new Sequelize({
      dialect: 'postgres',
      dialectModule: pg,
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: process.env.TEST_DB_NAME || 'nexora_test',
      username: config.DB_USER,
      password: config.DB_PASSWORD,
      logging: false,
    });

    await testSequelize.authenticate();
    await migrateReset(testSequelize);
    const migrator = getMigrator(testSequelize);
    await migrator.up();
  });

  afterAll(async () => {
    if (testSequelize) {
      await testSequelize.close();
    }
  });

  beforeEach(async () => {
    await testSequelize.query('TRUNCATE users, sessions, products, carts, cart_items CASCADE;');
    for (const item of seedProducts) {
      await Product.scope('withDeleted').create(item);
    }
  });

  describe('A. Cart Authentication & Ownership Scoping', () => {
    it('rejects unauthenticated GET /api/cart with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('rejects unauthenticated POST /api/cart/items with 401', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .send({ productId: seedProducts[0].id, quantity: 1 });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated PATCH /api/cart/items/:itemId with 401', async () => {
      const res = await request(app)
        .patch(`/api/cart/items/${crypto.randomUUID()}`)
        .send({ quantity: 2 });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated DELETE /api/cart/items/:itemId with 401', async () => {
      const res = await request(app)
        .delete(`/api/cart/items/${crypto.randomUUID()}`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated DELETE /api/cart with 401', async () => {
      const res = await request(app).delete('/api/cart');
      expect(res.status).toBe(401);
    });
  });

  describe('B. CSRF Defense on Cart Mutations', () => {
    it('rejects POST /api/cart/items missing CSRF header with 403 CSRF_TOKEN_MISSING', async () => {
      const auth = await createAndLoginUser({ email: 'csrf-user@example.com' });

      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader) // Has session & csrf cookie, but missing header
        .send({ productId: seedProducts[0].id, quantity: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('rejects mutating request with mismatched CSRF token with 403 CSRF_INVALID', async () => {
      const auth = await createAndLoginUser({ email: 'csrf-user-2@example.com' });

      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, 'invalid-csrf-token-12345')
        .send({ productId: seedProducts[0].id, quantity: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('allows safe GET /api/cart without CSRF token header', async () => {
      const auth = await createAndLoginUser({ email: 'csrf-safe@example.com' });

      const res = await request(app)
        .get('/api/cart')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.cart).toBeDefined();
      expect(res.body.cart.items).toEqual([]);
      expect(res.body.cart.subtotal_paise).toBe(0);
    });
  });

  describe('C. User Isolation & Anti-IDOR Defense', () => {
    it('guarantees User A cannot access or see User B cart contents', async () => {
      const userA = await createAndLoginUser({ email: 'user-a@example.com' });
      const userB = await createAndLoginUser({ email: 'user-b@example.com' });

      // User A adds item to cart
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      // User B retrieves their cart -> should be empty
      const resB = await request(app)
        .get('/api/cart')
        .set('Cookie', userB.cookieHeader);

      expect(resB.status).toBe(200);
      expect(resB.body.cart.items.length).toBe(0);
      expect(resB.body.cart.user_id).toBe(userB.user.id);
    });

    it('prevents User B from modifying User A cart item (sanitized 404 CART_ITEM_NOT_FOUND)', async () => {
      const userA = await createAndLoginUser({ email: 'user-a-mod@example.com' });
      const userB = await createAndLoginUser({ email: 'user-b-mod@example.com' });

      const addRes = await request(app)
        .post('/api/cart/items')
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      const itemAId = addRes.body.item.id;

      // User B attempts to patch User A's item
      const patchRes = await request(app)
        .patch(`/api/cart/items/${itemAId}`)
        .set('Cookie', userB.cookieHeader)
        .set(CSRF_HEADER_NAME, userB.csrfToken)
        .send({ quantity: 5 });

      expect(patchRes.status).toBe(404);
      expect(patchRes.body.error.code).toBe('CART_ITEM_NOT_FOUND');

      // Verify User A's item quantity remains unchanged (2)
      const getResA = await request(app)
        .get('/api/cart')
        .set('Cookie', userA.cookieHeader);
      expect(getResA.body.cart.items[0].quantity).toBe(2);
    });

    it('prevents User B from deleting User A cart item (sanitized 404)', async () => {
      const userA = await createAndLoginUser({ email: 'user-a-del@example.com' });
      const userB = await createAndLoginUser({ email: 'user-b-del@example.com' });

      const addRes = await request(app)
        .post('/api/cart/items')
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      const itemAId = addRes.body.item.id;

      // User B attempts to delete User A's item
      const delRes = await request(app)
        .delete(`/api/cart/items/${itemAId}`)
        .set('Cookie', userB.cookieHeader)
        .set(CSRF_HEADER_NAME, userB.csrfToken);

      expect(delRes.status).toBe(404);
      expect(delRes.body.error.code).toBe('CART_ITEM_NOT_FOUND');

      // Verify User A's cart still has 1 item
      const getResA = await request(app)
        .get('/api/cart')
        .set('Cookie', userA.cookieHeader);
      expect(getResA.body.cart.items.length).toBe(1);
    });

    it('clearing User B cart does not affect User A cart', async () => {
      const userA = await createAndLoginUser({ email: 'user-a-clr@example.com' });
      const userB = await createAndLoginUser({ email: 'user-b-clr@example.com' });

      // Both add items
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', userA.cookieHeader)
        .set(CSRF_HEADER_NAME, userA.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      await request(app)
        .post('/api/cart/items')
        .set('Cookie', userB.cookieHeader)
        .set(CSRF_HEADER_NAME, userB.csrfToken)
        .send({ productId: seedProducts[1].id, quantity: 1 });

      // User B clears cart
      const clearRes = await request(app)
        .delete('/api/cart')
        .set('Cookie', userB.cookieHeader)
        .set(CSRF_HEADER_NAME, userB.csrfToken);

      expect(clearRes.status).toBe(200);
      expect(clearRes.body.cart.items.length).toBe(0);

      // User A cart remains intact
      const getResA = await request(app)
        .get('/api/cart')
        .set('Cookie', userA.cookieHeader);
      expect(getResA.body.cart.items.length).toBe(1);
    });
  });

  describe('D. Add Item & Stock Validation for New and Existing Items', () => {
    it('successfully adds valid product with quantity 1 and returns updated cart & item', async () => {
      const auth = await createAndLoginUser({ email: 'add-item@example.com' });

      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 1 });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/success/i);
      expect(res.body.cart).toBeDefined();
      expect(res.body.cart.items.length).toBe(1);
      expect(res.body.cart.subtotal_paise).toBe(1899900);
      expect(res.body.cart.total_quantity).toBe(1);
      expect(res.body.item).toBeDefined();
      expect(res.body.item.product_id).toBe(seedProducts[0].id);
      expect(res.body.item.quantity).toBe(1);
      expect(res.body.item.line_total_paise).toBe(1899900);
      expect(res.body.item.available_quantity).toBe(10);
      expect(res.body.requestId).toBeDefined();
    });

    it('rejects adding new item when requested quantity exceeds available stock (available = 2, requested = 3)', async () => {
      const auth = await createAndLoginUser({ email: 'stock-val-1@example.com' });

      // Limited Stock Scarf has stock=4, reserved=2 => available=2
      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[3].id, quantity: 3 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.message).toMatch(/exceeds available stock/i);
    });

    it('allows adding new item when requested quantity equals available stock (available = 10, requested = 10)', async () => {
      const auth = await createAndLoginUser({ email: 'stock-val-2@example.com' });

      // Monolith Architectural Coat has stock=10, reserved=0 => available=10
      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 10 });

      expect(res.status).toBe(200);
      expect(res.body.item.quantity).toBe(10);
      expect(res.body.cart.total_quantity).toBe(10);
    });

    it('rejects adding new item when product is out of stock (available = 0, requested = 1)', async () => {
      const auth = await createAndLoginUser({ email: 'stock-val-3@example.com' });

      // Brutalist Concrete Chronograph has stock=8, reserved=8 => available=0
      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[2].id, quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('increments quantity when duplicate product is added and validates stock', async () => {
      const auth = await createAndLoginUser({ email: 'dup-add@example.com' });

      // Limited Stock Scarf has available=2
      // 1st add: 1 unit
      const res1 = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[3].id, quantity: 1 });
      expect(res1.status).toBe(200);
      expect(res1.body.item.quantity).toBe(1);

      // 2nd add: 1 unit -> total 2 <= 2 available -> succeeds
      const res2 = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[3].id, quantity: 1 });
      expect(res2.status).toBe(200);
      expect(res2.body.item.quantity).toBe(2);
      expect(res2.body.cart.items.length).toBe(1); // Distinct item count is 1

      // 3rd add: 1 unit -> total 3 > 2 available -> rejected with INSUFFICIENT_STOCK
      const res3 = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[3].id, quantity: 1 });
      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects duplicate addition when cumulative quantity exceeds maximum of 10', async () => {
      const auth = await createAndLoginUser({ email: 'dup-max@example.com' });

      // Coat has available=10
      // 1st add: 6 units
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 6 });

      // 2nd add: 5 units -> cumulative 11 > 10
      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUANTITY_LIMIT_EXCEEDED');
      expect(res.body.error.message).toMatch(/cannot exceed 10/i);
    });

    it('rejects malformed or invalid quantities (0, negative, decimal, >10)', async () => {
      const auth = await createAndLoginUser({ email: 'qty-bounds@example.com' });

      const cases = [
        { quantity: 0 },
        { quantity: -2 },
        { quantity: 11 },
        { quantity: 2.5 },
        { quantity: 'five' },
      ];

      for (const payload of cases) {
        const res = await request(app)
          .post('/api/cart/items')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({ productId: seedProducts[0].id, ...payload });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects nonexistent or malformed product UUIDs with 400 or 404', async () => {
      const auth = await createAndLoginUser({ email: 'prod-uuid@example.com' });

      // Malformed UUID -> 400
      const res1 = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: 'not-a-uuid', quantity: 1 });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      // Nonexistent UUID -> 404
      const res2 = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: crypto.randomUUID(), quantity: 1 });
      expect(res2.status).toBe(404);
      expect(res2.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects adding soft-deleted products with 404 PRODUCT_NOT_FOUND', async () => {
      const auth = await createAndLoginUser({ email: 'soft-del@example.com' });

      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[4].id, quantity: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('E. Parameter Tampering & Mass Assignment Defenses', () => {
    it('rejects payload with extra/unauthorized fields (price, userId, cartId, stock)', async () => {
      const auth = await createAndLoginUser({ email: 'tamper@example.com' });

      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({
          productId: seedProducts[0].id,
          quantity: 1,
          price_paise: 100, // Price tampering attempt
          userId: crypto.randomUUID(),
          cartId: crypto.randomUUID(),
          stock_quantity: 999,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('F. Update Item Quantity (PATCH /api/cart/items/:itemId)', () => {
    it('successfully updates item quantity within available stock', async () => {
      const auth = await createAndLoginUser({ email: 'patch-ok@example.com' });

      const addRes = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      const itemId = addRes.body.item.id;

      const patchRes = await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ quantity: 5 });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.item.quantity).toBe(5);
      expect(patchRes.body.item.line_total_paise).toBe(1899900 * 5);
      expect(patchRes.body.cart.total_quantity).toBe(5);
      expect(patchRes.body.cart.subtotal_paise).toBe(1899900 * 5);
    });

    it('rejects update exceeding available stock', async () => {
      const auth = await createAndLoginUser({ email: 'patch-stock@example.com' });

      // Scarf has available=2
      const addRes = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[3].id, quantity: 1 });

      const itemId = addRes.body.item.id;

      const patchRes = await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ quantity: 3 });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects update with invalid quantities (0, -1, 11, decimal)', async () => {
      const auth = await createAndLoginUser({ email: 'patch-invalid@example.com' });

      const addRes = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 1 });

      const itemId = addRes.body.item.id;

      const res0 = await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ quantity: 0 });
      expect(res0.status).toBe(400);

      const res11 = await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ quantity: 11 });
      expect(res11.status).toBe(400);
    });
  });

  describe('G. Delete Item & Clear Cart', () => {
    it('deletes specific cart item and recalculates subtotal', async () => {
      const auth = await createAndLoginUser({ email: 'delete-item@example.com' });

      const add1 = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 1 }); // 1899900

      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[1].id, quantity: 2 }); // 849900 * 2 = 1699800

      const delRes = await request(app)
        .delete(`/api/cart/items/${add1.body.item.id}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(delRes.status).toBe(200);
      expect(delRes.body.cart.items.length).toBe(1);
      expect(delRes.body.cart.items[0].product_id).toBe(seedProducts[1].id);
      expect(delRes.body.cart.subtotal_paise).toBe(1699800);
      expect(delRes.body.cart.total_quantity).toBe(2);
    });

    it('clears entire cart and is idempotent on empty carts', async () => {
      const auth = await createAndLoginUser({ email: 'clear-cart@example.com' });

      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      const clearRes1 = await request(app)
        .delete('/api/cart')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(clearRes1.status).toBe(200);
      expect(clearRes1.body.cart.items.length).toBe(0);
      expect(clearRes1.body.cart.subtotal_paise).toBe(0);
      expect(clearRes1.body.cart.total_quantity).toBe(0);

      // Clearing already empty cart succeeds idempotently
      const clearRes2 = await request(app)
        .delete('/api/cart')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      expect(clearRes2.status).toBe(200);
      expect(clearRes2.body.cart.items.length).toBe(0);
    });
  });

  describe('H. Money Handling & Strict Integer Arithmetic', () => {
    it('calculates multi-item totals accurately in integer paise without floating point errors', async () => {
      const auth = await createAndLoginUser({ email: 'money-calc@example.com' });

      // Item 1: Coat @ 1899900 * 2 = 3799800
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 2 });

      // Item 2: Shirt @ 849900 * 3 = 2549700
      const res = await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[1].id, quantity: 3 });

      expect(res.status).toBe(200);
      expect(res.body.cart.subtotal_paise).toBe(3799800 + 2549700); // 6349500
      expect(res.body.cart.total_quantity).toBe(5);
      expect(res.body.cart.item_count).toBe(2);
    });
  });

  describe('I. Inventory Boundary Verification', () => {
    it('confirms cart operations do NOT mutate stock_quantity or reserved_quantity', async () => {
      const auth = await createAndLoginUser({ email: 'inv-boundary@example.com' });

      const coatBefore = await Product.findByPk(seedProducts[0].id);
      expect(coatBefore.stock_quantity).toBe(10);
      expect(coatBefore.reserved_quantity).toBe(0);

      // Add item to cart
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 4 });

      // Update quantity
      const cartRes = await request(app)
        .get('/api/cart')
        .set('Cookie', auth.cookieHeader);
      const itemId = cartRes.body.cart.items[0].id;

      await request(app)
        .patch(`/api/cart/items/${itemId}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ quantity: 6 });

      // Delete item
      await request(app)
        .delete(`/api/cart/items/${itemId}`)
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken);

      const coatAfter = await Product.findByPk(seedProducts[0].id);
      expect(coatAfter.stock_quantity).toBe(10);
      expect(coatAfter.reserved_quantity).toBe(0);
    });
  });

  describe('J. Concurrency & Race Safety (CartItem Mutations)', () => {
    it('safely handles concurrent additions to an existing cart item without lost updates', async () => {
      const auth = await createAndLoginUser({ email: 'concurrent-cart@example.com' });

      // Initial add: 5 units of Shirt (available = 15)
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[1].id, quantity: 5 });

      // Send two concurrent requests: +2 and +2
      const [req1, req2] = await Promise.all([
        request(app)
          .post('/api/cart/items')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({ productId: seedProducts[1].id, quantity: 2 }),
        request(app)
          .post('/api/cart/items')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({ productId: seedProducts[1].id, quantity: 2 }),
      ]);

      expect(req1.status).toBe(200);
      expect(req2.status).toBe(200);

      // Final quantity must be exactly 9 (5 + 2 + 2) without lost updates
      const finalCart = await request(app)
        .get('/api/cart')
        .set('Cookie', auth.cookieHeader);

      expect(finalCart.body.cart.items.length).toBe(1);
      expect(finalCart.body.cart.items[0].quantity).toBe(9);
      expect(finalCart.body.cart.total_quantity).toBe(9);
    });

    it('prevents concurrent additions from exceeding max quantity limit of 10', async () => {
      const auth = await createAndLoginUser({ email: 'concurrent-max@example.com' });

      // Initial add: 6 units of Coat
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 6 });

      // Send two concurrent requests: +3 and +3 (cumulative = 12 > 10)
      const results = await Promise.allSettled([
        request(app)
          .post('/api/cart/items')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({ productId: seedProducts[0].id, quantity: 3 }),
        request(app)
          .post('/api/cart/items')
          .set('Cookie', auth.cookieHeader)
          .set(CSRF_HEADER_NAME, auth.csrfToken)
          .send({ productId: seedProducts[0].id, quantity: 3 }),
      ]);

      const statuses = results.map((r) => r.value.status);
      // One request must succeed (total 9), and the other must be rejected (total 12 > 10)
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      const finalCart = await request(app)
        .get('/api/cart')
        .set('Cookie', auth.cookieHeader);

      expect(finalCart.body.cart.items[0].quantity).toBeLessThanOrEqual(10);
    });
  });

  describe('K. Query Efficiency & Bounded Database Access', () => {
    it('retrieves cart with eager loaded products in bounded queries with zero N+1 per-item queries', async () => {
      const auth = await createAndLoginUser({ email: 'query-eff@example.com' });

      // Add 3 distinct products to cart
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[0].id, quantity: 1 });
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[1].id, quantity: 1 });
      await request(app)
        .post('/api/cart/items')
        .set('Cookie', auth.cookieHeader)
        .set(CSRF_HEADER_NAME, auth.csrfToken)
        .send({ productId: seedProducts[3].id, quantity: 1 });

      const res = await request(app)
        .get('/api/cart')
        .set('Cookie', auth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.cart.items.length).toBe(3);
      for (const item of res.body.cart.items) {
        expect(item.name).toBeDefined();
        expect(item.image_url).toBeDefined();
        expect(item.price_paise).toBeGreaterThan(0);
        expect(item.available_quantity).toBeGreaterThanOrEqual(0);
        // Ensure no internal raw fields leaked
        expect(item.stock_quantity).toBeUndefined();
        expect(item.reserved_quantity).toBeUndefined();
      }
    });
  });
});
