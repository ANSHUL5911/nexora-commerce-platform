import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { inventoryRepository } from '../../src/modules/inventory/inventory.repository.js';
import { InventoryInvariantError } from '../../src/modules/inventory/inventory.errors.js';
import { Product } from '../../src/models/Product.js';
import { InventoryReservation } from '../../src/models/InventoryReservation.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  cleanupInventoryTables,
} from './helpers/inventoryTestFixtures.js';

describe('Phase 07.6 — Inventory Repository Unit Tests', () => {
  beforeAll(async () => {
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

  describe('1. SELECT FOR UPDATE Product Locking', () => {
    it('findProductForUpdate locks the product row inside a transaction', async () => {
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });

      await sequelize.transaction(async (tx) => {
        const lockedProduct = await inventoryRepository.findProductForUpdate(product.id, {
          transaction: tx,
        });

        expect(lockedProduct).not.toBeNull();
        expect(lockedProduct.id).toBe(product.id);
        expect(lockedProduct.stock_quantity).toBe(10);
        expect(lockedProduct.reserved_quantity).toBe(2);
      });
    });

    it('findProductsForUpdate sorts product IDs deterministically to prevent deadlocks', async () => {
      const prodA = await createTestProduct({ name: 'Product A' });
      const prodB = await createTestProduct({ name: 'Product B' });
      const prodC = await createTestProduct({ name: 'Product C' });

      // Pass in reverse order
      const unsortedIds = [prodC.id, prodA.id, prodB.id];

      await sequelize.transaction(async (tx) => {
        const lockedProducts = await inventoryRepository.findProductsForUpdate(unsortedIds, {
          transaction: tx,
        });

        expect(lockedProducts.length).toBe(3);
        const returnedIds = lockedProducts.map((p) => p.id);
        const sortedIds = [...unsortedIds].sort();
        expect(returnedIds).toEqual(sortedIds);
      });
    });
  });

  describe('2. Guarded Atomic Inventory Increments & Decrements', () => {
    it('increments reserved_quantity atomically when available stock permits', async () => {
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });

      await sequelize.transaction(async (tx) => {
        await inventoryRepository.incrementProductReservedQuantity(product.id, 3, { transaction: tx });
      });

      const updated = await Product.findByPk(product.id);
      expect(updated.reserved_quantity).toBe(5);
      expect(updated.stock_quantity).toBe(10);
      expect(updated.available_quantity).toBe(5);
    });

    it('throws InventoryInvariantError and rolls back if increment exceeds available stock', async () => {
      const product = await createTestProduct({ stockQuantity: 5, reservedQuantity: 4 });

      await expect(
        sequelize.transaction(async (tx) => {
          // Attempting to reserve 2 when available is 1
          await inventoryRepository.incrementProductReservedQuantity(product.id, 2, { transaction: tx });
        })
      ).rejects.toThrow(InventoryInvariantError);

      const unchanged = await Product.findByPk(product.id);
      expect(unchanged.reserved_quantity).toBe(4);
    });

    it('decrements reserved_quantity atomically without Math.max() silent clamping', async () => {
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 6 });

      await sequelize.transaction(async (tx) => {
        await inventoryRepository.decrementProductReservedQuantity(product.id, 4, { transaction: tx });
      });

      const updated = await Product.findByPk(product.id);
      expect(updated.reserved_quantity).toBe(2);
      expect(updated.stock_quantity).toBe(10);
      expect(updated.available_quantity).toBe(8);
    });

    it('throws InventoryInvariantError if decrement quantity exceeds current reserved_quantity', async () => {
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });

      // Attempting to decrement 5 from reserved_quantity 2 must fail explicitly (not silently become 0)
      await expect(
        sequelize.transaction(async (tx) => {
          await inventoryRepository.decrementProductReservedQuantity(product.id, 5, { transaction: tx });
        })
      ).rejects.toThrow(InventoryInvariantError);

      const unchanged = await Product.findByPk(product.id);
      expect(unchanged.reserved_quantity).toBe(2);
    });

    it('converts reservation to stock deduction: decrements stock and reserved atomically', async () => {
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 4 });

      await sequelize.transaction(async (tx) => {
        await inventoryRepository.convertProductReservationToStockDeduction(product.id, 4, {
          transaction: tx,
        });
      });

      const updated = await Product.findByPk(product.id);
      expect(updated.stock_quantity).toBe(6);
      expect(updated.reserved_quantity).toBe(0);
      expect(updated.available_quantity).toBe(6);
    });

    it('throws InventoryInvariantError if converting with insufficient stock or reserved quantity', async () => {
      const product = await createTestProduct({ stockQuantity: 3, reservedQuantity: 2 });

      await expect(
        sequelize.transaction(async (tx) => {
          await inventoryRepository.convertProductReservationToStockDeduction(product.id, 4, {
            transaction: tx,
          });
        })
      ).rejects.toThrow(InventoryInvariantError);

      const unchanged = await Product.findByPk(product.id);
      expect(unchanged.stock_quantity).toBe(3);
      expect(unchanged.reserved_quantity).toBe(2);
    });
  });

  describe('3. Expiry and State Queries', () => {
    it('findExpiredActiveReservations selects only ACTIVE reservations past expires_at', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 20 });
      const order1 = await createTestOrder({ userId: user.id });
      const order2 = await createTestOrder({ userId: user.id });
      const order3 = await createTestOrder({ userId: user.id });

      // 1. Expired ACTIVE reservation
      await InventoryReservation.create({
        order_id: order1.id,
        product_id: product.id,
        quantity: 1,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP - INTERVAL '5 minutes'"),
      });

      // 2. Future ACTIVE reservation
      await InventoryReservation.create({
        order_id: order2.id,
        product_id: product.id,
        quantity: 2,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '10 minutes'"),
      });

      // 3. Expired RELEASED reservation (should not be selected)
      await InventoryReservation.create({
        order_id: order3.id,
        product_id: product.id,
        quantity: 1,
        status: 'RELEASED',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP - INTERVAL '5 minutes'"),
      });

      const expired = await inventoryRepository.findExpiredActiveReservations();
      expect(expired.length).toBe(1);
      expect(expired[0].order_id).toBe(order1.id);
      expect(expired[0].status).toBe('ACTIVE');
    });

    it('marks reservation RELEASED and EXPIRED with PostgreSQL CURRENT_TIMESTAMP', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order1 = await createTestOrder({ userId: user.id });
      const order2 = await createTestOrder({ userId: user.id });

      const res1 = await InventoryReservation.create({
        order_id: order1.id,
        product_id: product.id,
        quantity: 1,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
      });

      const res2 = await InventoryReservation.create({
        order_id: order2.id,
        product_id: product.id,
        quantity: 1,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
      });

      await sequelize.transaction(async (tx) => {
        await inventoryRepository.markReservationReleased(res1.id, { transaction: tx });
        await inventoryRepository.markReservationExpired(res2.id, { transaction: tx });
      });

      await res1.reload();
      await res2.reload();

      expect(res1.status).toBe('RELEASED');
      expect(res1.released_at).toBeInstanceOf(Date);

      expect(res2.status).toBe('EXPIRED');
      expect(res2.released_at).toBeInstanceOf(Date);
    });
  });
});
