import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import crypto from 'crypto';
import { config } from '../../src/config/env.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { Product } from '../../src/models/Product.js';
import { toProductDTO } from '../../src/modules/products/product.dto.js';

describe('Phase 07.4 — Product Model & DTO Unit Tests', () => {
  let testSequelize;

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
  });

  describe('1. Product Model Instantiation & Field Persistence', () => {
    it('initializes and saves product with application-side UUID and integer paise', async () => {
      const productId = crypto.randomUUID();
      const product = await Product.create({
        id: productId,
        name: 'Structured Trench Coat',
        description: 'Double-breasted cotton-gabardine trench coat with storm flap.',
        price_paise: 1299900, // ₹12,999.00
        stock_quantity: 10,
        reserved_quantity: 2,
        category: 'Outerwear',
        image_url: 'https://images.unsplash.com/photo-example-1',
        is_deleted: false,
      });

      expect(product.id).toBe(productId);
      expect(product.name).toBe('Structured Trench Coat');
      expect(product.price_paise).toBe(1299900);
      expect(typeof product.price_paise).toBe('number');
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(2);
      expect(product.available_quantity).toBe(8);
      expect(product.is_deleted).toBe(false);
      expect(product.created_at).toBeDefined();
      expect(product.updated_at).toBeDefined();
    });

    it('enforces required fields and non-null constraints', async () => {
      await expect(
        Product.create({
          name: '',
          description: 'Desc',
          price_paise: 1000,
          category: 'Cat',
          image_url: 'https://img.com',
        })
      ).rejects.toThrow();

      await expect(
        Product.create({
          description: 'Missing name',
          price_paise: 1000,
          category: 'Cat',
          image_url: 'https://img.com',
        })
      ).rejects.toThrow();
    });

    it('defaults stock_quantity and reserved_quantity to 0 and is_deleted to false', async () => {
      const product = await Product.create({
        name: 'Default Stock Item',
        description: 'Item with default counters',
        price_paise: 50000,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/photo-example-2',
      });

      expect(product.stock_quantity).toBe(0);
      expect(product.reserved_quantity).toBe(0);
      expect(product.available_quantity).toBe(0);
      expect(product.is_deleted).toBe(false);
    });

    it('computes available_quantity correctly under reservations and stock changes', async () => {
      const product = await Product.create({
        name: 'Limited Edition Watch',
        description: 'Titanium automatic watch',
        price_paise: 3500000,
        stock_quantity: 5,
        reserved_quantity: 5,
        category: 'Timepieces',
        image_url: 'https://images.unsplash.com/photo-example-3',
      });

      expect(product.available_quantity).toBe(0);

      // Update reserved quantity
      product.reserved_quantity = 3;
      await product.save();
      expect(product.available_quantity).toBe(2);
    });
  });

  describe('2. Product DTO Serialization', () => {
    it('serializes Product instance to safe DTO without internal model leakage', async () => {
      const product = await Product.create({
        name: 'Cashmere Beanie',
        description: '100% Mongolian cashmere ribbed knit beanie',
        price_paise: 350000,
        stock_quantity: 12,
        reserved_quantity: 2,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/photo-example-4',
      });

      const dto = toProductDTO(product);

      expect(dto).toEqual({
        id: product.id,
        name: 'Cashmere Beanie',
        description: '100% Mongolian cashmere ribbed knit beanie',
        price_paise: 350000,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/photo-example-4',
        stock_quantity: 12,
        reserved_quantity: 2,
        available_quantity: 10,
        created_at: product.created_at,
        updated_at: product.updated_at,
      });

      // Confirm no Sequelize internal properties leak
      expect(dto._previousDataValues).toBeUndefined();
      expect(dto.uniqno).toBeUndefined();
      expect(dto.isNewRecord).toBeUndefined();
    });

    it('returns null when null or undefined is passed to DTO serializer', () => {
      expect(toProductDTO(null)).toBeNull();
      expect(toProductDTO(undefined)).toBeNull();
    });
  });
});
