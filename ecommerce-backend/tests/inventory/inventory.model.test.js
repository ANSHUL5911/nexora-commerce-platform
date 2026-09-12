import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import { InventoryReservation } from '../../src/models/InventoryReservation.js';
import { RESERVATION_STATUS } from '../../src/modules/inventory/inventory.constants.js';
import { toReservationDTO, toProductInventoryDTO } from '../../src/modules/inventory/inventory.dto.js';
import {
  InsufficientStockError,
  ReservationNotFoundError,
  ReservationExpiredError,
  ReservationAlreadyReleasedError,
  ReservationAlreadyConvertedError,
  InvalidReservationStateError,
  InventoryInvariantError,
} from '../../src/modules/inventory/inventory.errors.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  cleanupInventoryTables,
} from './helpers/inventoryTestFixtures.js';

describe('Phase 07.6 — Inventory Model & DTO Unit Tests', () => {
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

  describe('1. InventoryReservation Model Persistence & Invariants', () => {
    it('creates an InventoryReservation with valid UUID and PostgreSQL 15m expiration', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 0 });
      const order = await createTestOrder({ userId: user.id });

      const reservation = await InventoryReservation.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: product.id,
        quantity: 2,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
      });

      await reservation.reload();

      expect(reservation.id).toBeDefined();
      expect(reservation.order_id).toBe(order.id);
      expect(reservation.product_id).toBe(product.id);
      expect(reservation.quantity).toBe(2);
      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.created_at).toBeInstanceOf(Date);
      expect(reservation.expires_at).toBeInstanceOf(Date);

      // Verify expiration is ~15 minutes after creation in DB time (within 5 seconds tolerance)
      const diffMs = new Date(reservation.expires_at).getTime() - new Date(reservation.created_at).getTime();
      const diffMinutes = diffMs / (60 * 1000);
      expect(Math.round(diffMinutes)).toBe(15);
    });

    it('enforces composite uniqueness on (order_id, product_id)', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: user.id });

      await InventoryReservation.create({
        order_id: order.id,
        product_id: product.id,
        quantity: 1,
        status: 'ACTIVE',
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
      });

      // Attempting duplicate (order_id, product_id) must reject due to uq_inv_res_order_product
      await expect(
        InventoryReservation.create({
          order_id: order.id,
          product_id: product.id,
          quantity: 2,
          status: 'ACTIVE',
          expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        })
      ).rejects.toThrow();
    });

    it('rejects non-positive quantities (quantity <= 0)', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: user.id });

      await expect(
        InventoryReservation.create({
          order_id: order.id,
          product_id: product.id,
          quantity: 0,
          status: 'ACTIVE',
          expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        })
      ).rejects.toThrow();

      await expect(
        InventoryReservation.create({
          order_id: order.id,
          product_id: product.id,
          quantity: -3,
          status: 'ACTIVE',
          expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        })
      ).rejects.toThrow();
    });

    it('enforces check constraint on status column', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10 });
      const order = await createTestOrder({ userId: user.id });

      // Valid statuses: ACTIVE, RELEASED, CONVERTED, EXPIRED
      for (const validStatus of ['ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED']) {
        const res = await InventoryReservation.create({
          order_id: order.id,
          product_id: product.id,
          quantity: 1,
          status: validStatus,
          expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        });
        expect(res.status).toBe(validStatus);
        await res.destroy();
      }

      // Invalid status rejected by DB check constraint
      await expect(
        InventoryReservation.create({
          order_id: order.id,
          product_id: product.id,
          quantity: 1,
          status: 'INVALID_STATUS',
          expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        })
      ).rejects.toThrow();
    });

    it('maps RESERVED alias to ACTIVE without introducing new DB status', () => {
      expect(RESERVATION_STATUS.ACTIVE).toBe('ACTIVE');
      expect(RESERVATION_STATUS.RESERVED).toBe('ACTIVE');
      expect(RESERVATION_STATUS.RELEASED).toBe('RELEASED');
      expect(RESERVATION_STATUS.CONVERTED).toBe('CONVERTED');
      expect(RESERVATION_STATUS.EXPIRED).toBe('EXPIRED');
    });
  });

  describe('2. DTO Serialization', () => {
    it('serializes InventoryReservation entity to DTO without leaking secrets', () => {
      const mockReservation = {
        id: 'r1000000-0000-4000-8000-000000000001',
        order_id: 'o1000000-0000-4000-8000-000000000001',
        product_id: 'p1000000-0000-4000-8000-000000000001',
        quantity: 3,
        status: 'ACTIVE',
        expires_at: new Date('2026-09-12T12:15:00Z'),
        released_at: null,
        created_at: new Date('2026-09-12T12:00:00Z'),
        updated_at: new Date('2026-09-12T12:00:00Z'),
        product: {
          id: 'p1000000-0000-4000-8000-000000000001',
          name: 'Architectural Trench',
          price_paise: 2500000,
          stock_quantity: 10,
          reserved_quantity: 3,
        },
      };

      const dto = toReservationDTO(mockReservation);

      expect(dto).toEqual({
        id: 'r1000000-0000-4000-8000-000000000001',
        order_id: 'o1000000-0000-4000-8000-000000000001',
        orderId: 'o1000000-0000-4000-8000-000000000001',
        product_id: 'p1000000-0000-4000-8000-000000000001',
        productId: 'p1000000-0000-4000-8000-000000000001',
        quantity: 3,
        status: 'ACTIVE',
        expires_at: new Date('2026-09-12T12:15:00Z'),
        expiresAt: new Date('2026-09-12T12:15:00Z'),
        released_at: null,
        releasedAt: null,
        created_at: new Date('2026-09-12T12:00:00Z'),
        createdAt: new Date('2026-09-12T12:00:00Z'),
        updated_at: new Date('2026-09-12T12:00:00Z'),
        updatedAt: new Date('2026-09-12T12:00:00Z'),
        product: {
          id: 'p1000000-0000-4000-8000-000000000001',
          name: 'Architectural Trench',
          price_paise: 2500000,
          available_quantity: 7,
        },
      });
    });

    it('serializes Product inventory counters correctly', () => {
      const mockProduct = {
        id: 'p1000000-0000-4000-8000-000000000001',
        stock_quantity: 20,
        reserved_quantity: 5,
      };

      const dto = toProductInventoryDTO(mockProduct);

      expect(dto).toEqual({
        id: 'p1000000-0000-4000-8000-000000000001',
        stock_quantity: 20,
        stockQuantity: 20,
        reserved_quantity: 5,
        reservedQuantity: 5,
        available_quantity: 15,
        availableQuantity: 15,
      });
    });
  });

  describe('3. Domain Error Contract', () => {
    it('verifies domain error classes and status codes', () => {
      const insufficientStock = new InsufficientStockError();
      expect(insufficientStock.statusCode).toBe(409);
      expect(insufficientStock.code).toBe('INSUFFICIENT_STOCK');

      const notFound = new ReservationNotFoundError();
      expect(notFound.statusCode).toBe(404);
      expect(notFound.code).toBe('RESERVATION_NOT_FOUND');

      const expired = new ReservationExpiredError();
      expect(expired.statusCode).toBe(409);
      expect(expired.code).toBe('RESERVATION_EXPIRED');

      const alreadyReleased = new ReservationAlreadyReleasedError();
      expect(alreadyReleased.statusCode).toBe(409);
      expect(alreadyReleased.code).toBe('RESERVATION_ALREADY_RELEASED');

      const alreadyConverted = new ReservationAlreadyConvertedError();
      expect(alreadyConverted.statusCode).toBe(409);
      expect(alreadyConverted.code).toBe('RESERVATION_ALREADY_CONVERTED');

      const invalidState = new InvalidReservationStateError();
      expect(invalidState.statusCode).toBe(400);
      expect(invalidState.code).toBe('INVALID_RESERVATION_STATE');

      const invariantErr = new InventoryInvariantError();
      expect(invariantErr.statusCode).toBe(500);
      expect(invariantErr.code).toBe('INVENTORY_INVARIANT_VIOLATION');
    });
  });
});
