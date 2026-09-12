import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Sequelize } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { Product } from '../../src/models/Product.js';
import { InventoryReservation } from '../../src/models/InventoryReservation.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';
import { InsufficientStockError } from '../../src/modules/inventory/inventory.errors.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  cleanupInventoryTables,
} from './helpers/inventoryTestFixtures.js';

describe('Phase 07.6 — Real PostgreSQL Concurrency & Invariant Verification', () => {
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

  /**
   * Helper to verify database invariants on a product row
   */
  async function assertProductInvariants(productId) {
    const product = await Product.findByPk(productId);
    expect(product).not.toBeNull();
    const stock = Number(product.stock_quantity);
    const reserved = Number(product.reserved_quantity);

    expect(stock).toBeGreaterThanOrEqual(0);
    expect(reserved).toBeGreaterThanOrEqual(0);
    expect(reserved).toBeLessThanOrEqual(stock);
    expect(product.available_quantity).toBe(stock - reserved);
    return product;
  }

  describe('TEST A: Stock = 1 / 10 Simultaneous Reservation Requests', () => {
    it('allows exactly 1 reservation to succeed and 9 to fail with 409 INSUFFICIENT_STOCK', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 1, reservedQuantity: 0 });

      // Create 10 distinct orders for 10 concurrent checkout attempts
      const orders = await Promise.all(
        Array.from({ length: 10 }).map(() => createTestOrder({ userId: user.id }))
      );

      // Launch 10 simultaneous reservation requests
      const results = await Promise.allSettled(
        orders.map((order) =>
          inventoryService.reserveInventory(product.id, 1, {
            orderId: order.id,
            userId: user.id,
            role: 'CUSTOMER',
          })
        )
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);

      for (const failure of failures) {
        expect(failure.reason).toBeInstanceOf(InsufficientStockError);
        expect(failure.reason.statusCode).toBe(409);
        expect(failure.reason.code).toBe('INSUFFICIENT_STOCK');
      }

      // Assert database invariants
      const updatedProduct = await assertProductInvariants(product.id);
      expect(updatedProduct.stock_quantity).toBe(1);
      expect(updatedProduct.reserved_quantity).toBe(1);
      expect(updatedProduct.available_quantity).toBe(0);

      // Verify exactly 1 active reservation in database
      const count = await InventoryReservation.count({
        where: { product_id: product.id, status: 'ACTIVE' },
      });
      expect(count).toBe(1);
    });
  });

  describe('TEST B: Stock = 10 / Multi-Quantity Simultaneous Success (6 + 4)', () => {
    it('allows both valid multi-quantity reservations to succeed concurrently', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });

      const orderA = await createTestOrder({ userId: user.id });
      const orderB = await createTestOrder({ userId: user.id });

      const results = await Promise.allSettled([
        inventoryService.reserveInventory(product.id, 6, {
          orderId: orderA.id,
          userId: user.id,
          role: 'CUSTOMER',
        }),
        inventoryService.reserveInventory(product.id, 4, {
          orderId: orderB.id,
          userId: user.id,
          role: 'CUSTOMER',
        }),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(2);

      const updatedProduct = await assertProductInvariants(product.id);
      expect(updatedProduct.stock_quantity).toBe(10);
      expect(updatedProduct.reserved_quantity).toBe(10);
      expect(updatedProduct.available_quantity).toBe(0);

      const totalReserved = await InventoryReservation.sum('quantity', {
        where: { product_id: product.id, status: 'ACTIVE' },
      });
      expect(totalReserved).toBe(10);
    });
  });

  describe('TEST C: Stock = 10 / Multi-Quantity Simultaneous Conflict (6 + 6)', () => {
    it('allows exactly one 6-unit request to succeed and one to fail with 409', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });

      const orderA = await createTestOrder({ userId: user.id });
      const orderB = await createTestOrder({ userId: user.id });

      const results = await Promise.allSettled([
        inventoryService.reserveInventory(product.id, 6, {
          orderId: orderA.id,
          userId: user.id,
          role: 'CUSTOMER',
        }),
        inventoryService.reserveInventory(product.id, 6, {
          orderId: orderB.id,
          userId: user.id,
          role: 'CUSTOMER',
        }),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect(failures[0].reason.statusCode).toBe(409);

      const updatedProduct = await assertProductInvariants(product.id);
      expect(updatedProduct.stock_quantity).toBe(10);
      expect(updatedProduct.reserved_quantity).toBe(6);
      expect(updatedProduct.available_quantity).toBe(4);
    });
  });

  describe('TEST D: Lost Update Prevention', () => {
    it('ensures 10 concurrent requests of quantity 1 against stock 10 all succeed without lost updates', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });

      const orders = await Promise.all(
        Array.from({ length: 10 }).map(() => createTestOrder({ userId: user.id }))
      );

      const results = await Promise.allSettled(
        orders.map((order) =>
          inventoryService.reserveInventory(product.id, 1, {
            orderId: order.id,
            userId: user.id,
            role: 'CUSTOMER',
          })
        )
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(10);

      const updatedProduct = await assertProductInvariants(product.id);
      expect(updatedProduct.stock_quantity).toBe(10);
      expect(updatedProduct.reserved_quantity).toBe(10);
      expect(updatedProduct.available_quantity).toBe(0);

      const totalCount = await InventoryReservation.count({
        where: { product_id: product.id, status: 'ACTIVE' },
      });
      expect(totalCount).toBe(10);
    });
  });

  describe('TEST E: Expiry vs Conversion Race', () => {
    it('guarantees exactly one terminal transition (CONVERTED or EXPIRED) without double decrements', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 3 });
      const order = await createTestOrder({ userId: user.id });

      // Create an ACTIVE reservation expiring right at database CURRENT_TIMESTAMP
      const reservation = await InventoryReservation.create({
        order_id: order.id,
        product_id: product.id,
        quantity: 3,
        status: 'ACTIVE',
        expires_at: Sequelize.literal('CURRENT_TIMESTAMP'),
      });

      // Run conversion and expired maintenance simultaneously
      await Promise.allSettled([
        inventoryService.convertReservation(reservation.id, {
          userId: user.id,
          role: 'CUSTOMER',
        }),
        inventoryService.releaseExpiredReservations({ limit: 10 }),
      ]);

      // Re-fetch reservation state from DB
      await reservation.reload();

      // Terminal state MUST be either CONVERTED or EXPIRED, never both or corrupted
      expect(['CONVERTED', 'EXPIRED']).toContain(reservation.status);

      const updatedProduct = await assertProductInvariants(product.id);

      if (reservation.status === 'CONVERTED') {
        // Stock decremented by 3, reserved decremented by 3
        expect(updatedProduct.stock_quantity).toBe(7);
        expect(updatedProduct.reserved_quantity).toBe(0);
      } else {
        // Expiration: reserved decremented by 3, stock unchanged
        expect(updatedProduct.stock_quantity).toBe(10);
        expect(updatedProduct.reserved_quantity).toBe(0);
      }
    });
  });

  describe('TEST F: Double Release Race', () => {
    it('handles two simultaneous release attempts with exact single decrement (idempotency)', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 4 });
      const order = await createTestOrder({ userId: user.id });

      const reservation = await InventoryReservation.create({
        order_id: order.id,
        product_id: product.id,
        quantity: 4,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
      });

      const results = await Promise.allSettled([
        inventoryService.releaseReservation(reservation.id, {
          userId: user.id,
          role: 'CUSTOMER',
        }),
        inventoryService.releaseReservation(reservation.id, {
          userId: user.id,
          role: 'CUSTOMER',
        }),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(2); // Both return 200/fulfilled due to idempotency

      await reservation.reload();
      expect(reservation.status).toBe('RELEASED');

      const updatedProduct = await assertProductInvariants(product.id);
      expect(updatedProduct.stock_quantity).toBe(10);
      expect(updatedProduct.reserved_quantity).toBe(0); // Decremented exactly once, never negative
      expect(updatedProduct.available_quantity).toBe(10);
    });
  });

  describe('TEST G: Concurrent Expiry Processing', () => {
    it('executes multiple concurrent releaseExpiredReservations workers without double decrements', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 5 });
      const order = await createTestOrder({ userId: user.id });

      const reservation = await InventoryReservation.create({
        order_id: order.id,
        product_id: product.id,
        quantity: 5,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP - INTERVAL '1 minute'"),
      });

      // Run 3 cleanup workers concurrently
      const results = await Promise.allSettled([
        inventoryService.releaseExpiredReservations({ limit: 10 }),
        inventoryService.releaseExpiredReservations({ limit: 10 }),
        inventoryService.releaseExpiredReservations({ limit: 10 }),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(3);

      await reservation.reload();
      expect(reservation.status).toBe('EXPIRED');

      const updatedProduct = await assertProductInvariants(product.id);
      expect(updatedProduct.stock_quantity).toBe(10);
      expect(updatedProduct.reserved_quantity).toBe(0);
      expect(updatedProduct.available_quantity).toBe(10);
    });
  });
});
