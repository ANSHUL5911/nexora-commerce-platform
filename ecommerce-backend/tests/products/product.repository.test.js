import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import crypto from 'crypto';
import { config } from '../../src/config/env.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { Product } from '../../src/models/Product.js';
import { productRepository } from '../../src/modules/products/product.repository.js';

describe('Phase 07.4 — Product Repository Unit Tests', () => {
  let testSequelize;

  const testProducts = [
    {
      id: 'd0000000-0000-4000-8000-000000000001',
      name: 'Monolith Architectural Coat',
      description: 'Structured wool-blend oversized coat tailored with sharp peak lapels.',
      price_paise: 1899900, // ₹18,999.00
      stock_quantity: 1,
      reserved_quantity: 0,
      category: 'Outerwear',
      image_url: 'https://images.unsplash.com/photo-coat',
      is_deleted: false,
      created_at: new Date('2026-01-01T10:00:00Z'),
      updated_at: new Date('2026-01-01T10:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000002',
      name: 'Minimalist Silk Evening Shirt',
      description: 'Raw mulberry silk draped silhouette with concealed placket.',
      price_paise: 849900, // ₹8,499.00
      stock_quantity: 15,
      reserved_quantity: 0,
      category: 'Apparel',
      image_url: 'https://images.unsplash.com/photo-shirt',
      is_deleted: false,
      created_at: new Date('2026-01-02T10:00:00Z'),
      updated_at: new Date('2026-01-02T10:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000003',
      name: 'Brutalist Concrete Chronograph',
      description: 'Matte titanium case with raw stone composite dial.',
      price_paise: 2499900, // ₹24,999.00
      stock_quantity: 5,
      reserved_quantity: 5, // available = 0
      category: 'Timepieces',
      image_url: 'https://images.unsplash.com/photo-watch',
      is_deleted: false,
      created_at: new Date('2026-01-03T10:00:00Z'),
      updated_at: new Date('2026-01-03T10:00:00Z'),
    },
    {
      id: 'd0000000-0000-4000-8000-000000000004',
      name: 'Soft Deleted Archive Item',
      description: 'Historical archive item that should not appear publicly.',
      price_paise: 500000,
      stock_quantity: 10,
      reserved_quantity: 0,
      category: 'Apparel',
      image_url: 'https://images.unsplash.com/photo-deleted',
      is_deleted: true,
      created_at: new Date('2026-01-04T10:00:00Z'),
      updated_at: new Date('2026-01-04T10:00:00Z'),
    },
  ];

  beforeAll(async () => {
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
    for (const item of testProducts) {
      await Product.scope('withDeleted').create(item);
    }
  });

  describe('findAndCountAll', () => {
    it('returns active non-deleted products with default pagination and deterministic ordering', async () => {
      const result = await productRepository.findAndCountAll({ page: 1, limit: 10 });

      expect(result.count).toBe(3); // excludes soft-deleted item
      expect(result.rows.length).toBe(3);
      // Default ordering is newest first (created_at DESC, id DESC)
      expect(result.rows[0].name).toBe('Brutalist Concrete Chronograph');
      expect(result.rows[1].name).toBe('Minimalist Silk Evening Shirt');
      expect(result.rows[2].name).toBe('Monolith Architectural Coat');
    });

    it('filters by category accurately', async () => {
      const result = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        category: 'Outerwear',
      });

      expect(result.count).toBe(1);
      expect(result.rows[0].name).toBe('Monolith Architectural Coat');
    });

    it('searches by name or description case-insensitively', async () => {
      const resultByName = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        search: 'silk',
      });
      expect(resultByName.count).toBe(1);
      expect(resultByName.rows[0].name).toBe('Minimalist Silk Evening Shirt');

      const resultByDesc = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        search: 'lapels',
      });
      expect(resultByDesc.count).toBe(1);
      expect(resultByDesc.rows[0].name).toBe('Monolith Architectural Coat');
    });

    it('escapes LIKE/iLIKE wildcard characters properly', async () => {
      const result = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        search: '%',
      });
      // Should treat '%' as literal character, matching 0 items
      expect(result.count).toBe(0);
    });

    it('filters inStockOnly products correctly', async () => {
      const result = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        inStockOnly: true,
      });

      // Brutalist Concrete Chronograph has 5 stock and 5 reserved => available = 0
      // So only 2 items should match
      expect(result.count).toBe(2);
      const names = result.rows.map((r) => r.name);
      expect(names).toContain('Monolith Architectural Coat');
      expect(names).toContain('Minimalist Silk Evening Shirt');
      expect(names).not.toContain('Brutalist Concrete Chronograph');
    });

    it('sorts by price ascending and descending deterministically', async () => {
      const ascResult = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        sortBy: 'price',
        sortOrder: 'asc',
      });

      expect(ascResult.rows[0].price_paise).toBe(849900);
      expect(ascResult.rows[1].price_paise).toBe(1899900);
      expect(ascResult.rows[2].price_paise).toBe(2499900);

      const descResult = await productRepository.findAndCountAll({
        page: 1,
        limit: 10,
        sortBy: 'price',
        sortOrder: 'desc',
      });

      expect(descResult.rows[0].price_paise).toBe(2499900);
      expect(descResult.rows[1].price_paise).toBe(1899900);
      expect(descResult.rows[2].price_paise).toBe(849900);
    });
  });

  describe('findById', () => {
    it('retrieves active product by UUID', async () => {
      const product = await productRepository.findById('d0000000-0000-4000-8000-000000000001');
      expect(product).not.toBeNull();
      expect(product.name).toBe('Monolith Architectural Coat');
    });

    it('returns null for unknown UUID', async () => {
      const product = await productRepository.findById(crypto.randomUUID());
      expect(product).toBeNull();
    });

    it('returns null for soft-deleted product ID', async () => {
      const product = await productRepository.findById('d0000000-0000-4000-8000-000000000004');
      expect(product).toBeNull();
    });
  });
});
