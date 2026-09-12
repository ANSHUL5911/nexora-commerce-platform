import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import crypto from 'crypto';
import { config } from '../../src/config/env.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { User } from '../../src/models/User.js';
import { Product } from '../../src/models/Product.js';
import { Cart } from '../../src/models/Cart.js';
import { CartItem } from '../../src/models/CartItem.js';
import { toCartItemDTO, toCartDTO } from '../../src/modules/cart/cart.dto.js';

describe('Phase 07.5 — Cart Model & DTO Unit Tests', () => {
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
    await testSequelize.query('TRUNCATE users, products, carts, cart_items CASCADE;');
  });

  describe('1. Cart & CartItem Model Persistence & Invariants', () => {
    it('creates Cart with UUID and unique user_id constraint', async () => {
      const user = await User.create({
        id: crypto.randomUUID(),
        email: 'cart-user-1@example.com',
        password_hash: 'hashedpassword123',
        full_name: 'Cart Test User',
      });

      const cart = await Cart.create({
        user_id: user.id,
      });

      expect(cart.id).toBeDefined();
      expect(cart.user_id).toBe(user.id);
      expect(cart.created_at).toBeDefined();
      expect(cart.updated_at).toBeDefined();

      // Enforces 1 Cart per User uniqueness invariant
      await expect(
        Cart.create({
          user_id: user.id,
        })
      ).rejects.toThrow();
    });

    it('creates CartItem and validates composite uniqueness (cart_id, product_id)', async () => {
      const user = await User.create({
        id: crypto.randomUUID(),
        email: 'cart-user-2@example.com',
        password_hash: 'hashedpassword123',
        full_name: 'Cart Test User 2',
      });

      const product = await Product.create({
        id: crypto.randomUUID(),
        name: 'Fine Wool Scarf',
        description: 'Warm winter scarf',
        price_paise: 450000,
        stock_quantity: 10,
        reserved_quantity: 0,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/scarf',
      });

      const cart = await Cart.create({ user_id: user.id });

      const cartItem = await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity: 2,
      });

      expect(cartItem.id).toBeDefined();
      expect(cartItem.cart_id).toBe(cart.id);
      expect(cartItem.product_id).toBe(product.id);
      expect(cartItem.quantity).toBe(2);

      // Rejects duplicate CartItem for the same cart and product
      await expect(
        CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity: 1,
        })
      ).rejects.toThrow();
    });

    it('enforces quantity boundaries (1 <= quantity <= 10)', async () => {
      const user = await User.create({
        id: crypto.randomUUID(),
        email: 'cart-user-3@example.com',
        password_hash: 'hashedpassword123',
        full_name: 'Cart Test User 3',
      });

      const product = await Product.create({
        id: crypto.randomUUID(),
        name: 'Linen Cap',
        description: 'Summer cap',
        price_paise: 250000,
        stock_quantity: 20,
        reserved_quantity: 0,
        category: 'Accessories',
        image_url: 'https://images.unsplash.com/cap',
      });

      const cart = await Cart.create({ user_id: user.id });

      // Quantity 0 rejected
      await expect(
        CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity: 0,
        })
      ).rejects.toThrow();

      // Negative quantity rejected
      await expect(
        CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity: -1,
        })
      ).rejects.toThrow();

      // Quantity > 10 rejected
      await expect(
        CartItem.create({
          cart_id: cart.id,
          product_id: product.id,
          quantity: 11,
        })
      ).rejects.toThrow();

      // Valid boundary values (1 and 10) succeed
      const validItem1 = await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity: 1,
      });
      expect(validItem1.quantity).toBe(1);

      validItem1.quantity = 10;
      await validItem1.save();
      expect(validItem1.quantity).toBe(10);
    });
  });

  describe('2. Cart & CartItem DTO Serializers', () => {
    it('serializes CartItem DTO with available_quantity and without raw stock_quantity/reserved_quantity', () => {
      const mockItem = {
        id: 'c1000000-0000-4000-8000-000000000001',
        cart_id: 'c0000000-0000-4000-8000-000000000001',
        product_id: 'p0000000-0000-4000-8000-000000000001',
        quantity: 3,
        product: {
          id: 'p0000000-0000-4000-8000-000000000001',
          name: 'Monolith Architectural Coat',
          image_url: 'https://images.unsplash.com/coat',
          price_paise: 1899900,
          stock_quantity: 15,
          reserved_quantity: 3,
          available_quantity: 12,
        },
      };

      const dto = toCartItemDTO(mockItem);

      expect(dto).toEqual({
        id: 'c1000000-0000-4000-8000-000000000001',
        cart_id: 'c0000000-0000-4000-8000-000000000001',
        product_id: 'p0000000-0000-4000-8000-000000000001',
        name: 'Monolith Architectural Coat',
        image_url: 'https://images.unsplash.com/coat',
        price_paise: 1899900,
        quantity: 3,
        line_total_paise: 5699700, // 1899900 * 3
        available_quantity: 12,
      });

      // Information minimization: internal inventory fields must NOT leak
      expect(dto.stock_quantity).toBeUndefined();
      expect(dto.reserved_quantity).toBeUndefined();
    });

    it('serializes Cart DTO and correctly computes integer paise subtotal, itemCount, and totalQuantity', () => {
      const mockCart = {
        id: 'c0000000-0000-4000-8000-000000000001',
        user_id: 'u0000000-0000-4000-8000-000000000001',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      };

      const mockItems = [
        {
          id: 'c1000000-0000-4000-8000-000000000001',
          cart_id: mockCart.id,
          product_id: 'p0000000-0000-4000-8000-000000000001',
          quantity: 2,
          product: {
            name: 'Item 1',
            image_url: 'https://img1.com',
            price_paise: 10000, // ₹100.00
            stock_quantity: 10,
            reserved_quantity: 0,
          },
        },
        {
          id: 'c1000000-0000-4000-8000-000000000002',
          cart_id: mockCart.id,
          product_id: 'p0000000-0000-4000-8000-000000000002',
          quantity: 3,
          product: {
            name: 'Item 2',
            image_url: 'https://img2.com',
            price_paise: 5000, // ₹50.00
            stock_quantity: 10,
            reserved_quantity: 0,
          },
        },
      ];

      const cartDto = toCartDTO(mockCart, mockItems);

      expect(cartDto.id).toBe(mockCart.id);
      expect(cartDto.user_id).toBe(mockCart.user_id);
      expect(cartDto.items.length).toBe(2);
      expect(cartDto.item_count).toBe(2);
      expect(cartDto.total_quantity).toBe(5); // 2 + 3
      expect(cartDto.subtotal_paise).toBe(35000); // 10000*2 + 5000*3 = 20000 + 15000 = 35000
    });

    it('handles empty cart safely', () => {
      const emptyDto = toCartDTO(null);
      expect(emptyDto).toEqual({
        id: null,
        user_id: null,
        items: [],
        subtotal_paise: 0,
        item_count: 0,
        total_quantity: 0,
        created_at: null,
        updated_at: null,
      });
    });
  });
});
