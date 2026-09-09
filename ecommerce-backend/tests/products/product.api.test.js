import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import crypto from 'crypto';
import { config } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { Product } from '../../src/models/Product.js';

describe('Phase 07.4 — Product / Catalog API Integration & Security Tests', () => {
  let app;
  let testSequelize;

  const seedProducts = [
    {
      id: 'd0000000-0000-4000-8000-000000000001',
      name: 'Monolith Architectural Coat',
      description: 'Structured wool-blend oversized coat tailored with sharp peak lapels and horn buttons.',
      price_paise: 1899900, // ₹18,999.00
      stock_quantity: 1,
      reserved_quantity: 0,
      category: 'Outerwear',
      image_url: 'https://images.unsplash.com/photo-1539533018447-63fcce667883?auto=format&fit=crop&w=800&q=80',
      is_deleted: false,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000002',
      name: 'Minimalist Silk Evening Shirt',
      description: 'Raw mulberry silk draped silhouette with concealed placket and French cuffs.',
      price_paise: 849900, // ₹8,499.00
      stock_quantity: 15,
      reserved_quantity: 0,
      category: 'Apparel',
      image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
      is_deleted: false,
      created_at: new Date('2026-01-02T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000003',
      name: 'Brutalist Concrete Chronograph',
      description: 'Matte titanium case with raw stone composite dial and Swiss quartz movement.',
      price_paise: 2499900, // ₹24,999.00
      stock_quantity: 8,
      reserved_quantity: 8, // available_quantity = 0
      category: 'Timepieces',
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
      is_deleted: false,
      created_at: new Date('2026-01-03T00:00:00Z'),
      updated_at: new Date('2026-01-03T00:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000004',
      name: 'Sculpted Vachetta Leather Tote',
      description: 'Vegetable-tanned full-grain leather tote with hand-stitched rolled handles.',
      price_paise: 1450000, // ₹14,500.00
      stock_quantity: 10,
      reserved_quantity: 2, // available_quantity = 8
      category: 'Accessories',
      image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80',
      is_deleted: false,
      created_at: new Date('2026-01-04T00:00:00Z'),
      updated_at: new Date('2026-01-04T00:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000005',
      name: 'Archived Retired Item',
      description: 'This item was soft-deleted and must never be exposed publicly.',
      price_paise: 100000,
      stock_quantity: 10,
      reserved_quantity: 0,
      category: 'Accessories',
      image_url: 'https://images.unsplash.com/photo-archived',
      is_deleted: true,
      created_at: new Date('2026-01-05T00:00:00Z'),
      updated_at: new Date('2026-01-05T00:00:00Z'),
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
    await testSequelize.query('TRUNCATE products CASCADE;');
    for (const item of seedProducts) {
      await Product.scope('withDeleted').create(item);
    }
  });

  describe('A. Public Product Catalog Listing (GET /api/products)', () => {
    it('returns 200 OK with paginated list of non-deleted products', async () => {
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBe(4); // Excludes 1 soft-deleted
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 4,
        totalPages: 1,
      });
      expect(res.body.requestId).toBeDefined();

      // Check DTO properties
      const coat = res.body.products.find((p) => p.id === 'd0000000-0000-4000-8000-000000000001');
      expect(coat).toBeDefined();
      expect(coat.name).toBe('Monolith Architectural Coat');
      expect(coat.price_paise).toBe(1899900);
      expect(coat.available_quantity).toBe(1);
      expect(coat.category).toBe('Outerwear');
      expect(coat.image_url).toBeDefined();
      expect(coat.is_deleted).toBeUndefined(); // Internal field not leaked
    });

    it('enforces pagination boundaries and limits page size', async () => {
      const res = await request(app).get('/api/products?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(2);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
      });
    });

    it('rejects requested limit exceeding maximum threshold of 50', async () => {
      const res = await request(app).get('/api/products?limit=51');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/50/);
    });

    it('rejects negative or malformed page and limit parameters', async () => {
      const res1 = await request(app).get('/api/products?page=0');
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app).get('/api/products?limit=-5');
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');

      const res3 = await request(app).get('/api/products?page=abc');
      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('filters catalog by valid category', async () => {
      const res = await request(app).get('/api/products?category=Outerwear');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].name).toBe('Monolith Architectural Coat');
      expect(res.body.pagination.total).toBe(1);
    });

    it('searches products by name and description with length validation', async () => {
      const resName = await request(app).get('/api/products?search=Concrete');
      expect(resName.status).toBe(200);
      expect(resName.body.products.length).toBe(1);
      expect(resName.body.products[0].name).toBe('Brutalist Concrete Chronograph');

      const resDesc = await request(app).get('/api/products?search=mulberry');
      expect(resDesc.status).toBe(200);
      expect(resDesc.body.products.length).toBe(1);
      expect(resDesc.body.products[0].name).toBe('Minimalist Silk Evening Shirt');
    });

    it('rejects excessively long search strings', async () => {
      const overlyLongSearch = 'a'.repeat(101);
      const res = await request(app).get(`/api/products?search=${overlyLongSearch}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('filters in-stock products only with inStockOnly=true', async () => {
      const res = await request(app).get('/api/products?inStockOnly=true');

      expect(res.status).toBe(200);
      // Brutalist Concrete Chronograph has 8 stock and 8 reserved => available = 0
      expect(res.body.products.length).toBe(3);
      const names = res.body.products.map((p) => p.name);
      expect(names).not.toContain('Brutalist Concrete Chronograph');
    });

    it('sorts deterministically by price ascending and descending', async () => {
      const ascRes = await request(app).get('/api/products?sortBy=price&sortOrder=asc');
      expect(ascRes.status).toBe(200);
      expect(ascRes.body.products[0].price_paise).toBe(849900);
      expect(ascRes.body.products[ascRes.body.products.length - 1].price_paise).toBe(2499900);

      const descRes = await request(app).get('/api/products?sortBy=price&sortOrder=desc');
      expect(descRes.status).toBe(200);
      expect(descRes.body.products[0].price_paise).toBe(2499900);
      expect(descRes.body.products[descRes.body.products.length - 1].price_paise).toBe(849900);
    });

    it('rejects unallowlisted sort fields and sort directions (ORDER BY injection defense)', async () => {
      const res1 = await request(app).get('/api/products?sortBy=password_hash');
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app).get('/api/products?sortBy=price&sortOrder=SELECT*FROMusers');
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('B. Product Detail (GET /api/products/:id)', () => {
    it('returns 200 OK with single product detail for valid UUID', async () => {
      const res = await request(app).get('/api/products/d0000000-0000-4000-8000-000000000004');

      expect(res.status).toBe(200);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.id).toBe('d0000000-0000-4000-8000-000000000004');
      expect(res.body.product.name).toBe('Sculpted Vachetta Leather Tote');
      expect(res.body.product.price_paise).toBe(1450000);
      expect(res.body.product.stock_quantity).toBe(10);
      expect(res.body.product.reserved_quantity).toBe(2);
      expect(res.body.product.available_quantity).toBe(8);
      expect(res.body.requestId).toBeDefined();
    });

    it('returns 400 Bad Request on invalid UUID format', async () => {
      const res = await request(app).get('/api/products/not-a-valid-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/UUIDv4/i);
    });

    it('returns 404 Not Found for non-existent product UUID', async () => {
      const unknownId = crypto.randomUUID();
      const res = await request(app).get(`/api/products/${unknownId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('returns 404 Not Found for soft-deleted product (prevents information leak)', async () => {
      const res = await request(app).get('/api/products/d0000000-0000-4000-8000-000000000005');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('C. Security & Parameter Tampering Defenses', () => {
    it('prevents SQL injection payloads in search parameter', async () => {
      const sqliPayload = "'; DROP TABLE products; --";
      const res = await request(app).get(`/api/products?search=${encodeURIComponent(sqliPayload)}`);

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(0);

      // Verify table still exists and contains products
      const count = await Product.count();
      expect(count).toBe(4);
    });

    it('handles Sequelize operator injection attempts in query string safely', async () => {
      const res = await request(app).get('/api/products?category[$ne]=null');

      // Zod schema type coerces category to string and rejects or treats as literal string
      // Should either return 200 with 0 products (category is literal "[object Object]" or string) or 400
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.products.length).toBe(0);
      }
    });

    it('does not leak internal database errors or stack traces in responses', async () => {
      const nonExistentUuid = crypto.randomUUID();
      const res = await request(app).get(`/api/products/${nonExistentUuid}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.stack).toBeUndefined();
      expect(res.body.error.sql).toBeUndefined();
    });

  });
});
