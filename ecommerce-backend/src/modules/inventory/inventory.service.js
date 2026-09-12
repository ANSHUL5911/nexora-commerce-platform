import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { Product } from '../../models/Product.js';
import { inventoryRepository } from './inventory.repository.js';
import { toReservationDTO, toProductInventoryDTO } from './inventory.dto.js';
import {
  InsufficientStockError,
  ReservationNotFoundError,
  ReservationExpiredError,
  ReservationAlreadyReleasedError,
  ReservationAlreadyConvertedError,
  InventoryInvariantError,
} from './inventory.errors.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

export const inventoryService = {
  /**
   * Atomically reserve inventory for a product against an existing Order.
   * Acquires SELECT ... FOR UPDATE lock on the product row.
   *
   * @param {string} productId
   * @param {number} quantity
   * @param {{
   *   orderId: string,
   *   userId?: string,
   *   role?: string,
   *   transaction?: import('sequelize').Transaction
   * }} options
   * @returns {Promise<ReturnType<typeof toReservationDTO>>}
   */
  async reserveInventory(productId, quantity, { orderId, userId, role, transaction: externalTx } = {}) {
    if (!orderId) {
      throw new ValidationError('Order ID is required for inventory reservation.');
    }

    if (!quantity || quantity <= 0) {
      throw new ValidationError('Reservation quantity must be at least 1.');
    }

    const executeInTransaction = async (tx) => {
      // 1. Anti-IDOR: Verify that the parent Order exists and belongs to the authenticated customer
      const order = await inventoryRepository.findOrderOwnership(orderId, { transaction: tx });
      if (!order) {
        throw new ReservationNotFoundError('Order was not found.');
      }

      if (userId && String(role || '').toLowerCase() !== 'admin' && order.user_id !== userId) {
        throw new ReservationNotFoundError('Order was not found.');
      }

      // 2. Lock Product row using SELECT ... FOR UPDATE
      const product = await inventoryRepository.findProductForUpdate(productId, { transaction: tx });
      if (!product || product.is_deleted) {
        throw new NotFoundError(`Product with ID '${productId}' was not found.`, 'PRODUCT_NOT_FOUND');
      }

      // 3. Calculate authoritative available quantity
      const stock = Number(product.stock_quantity ?? 0);
      const reserved = Number(product.reserved_quantity ?? 0);
      const available = stock - reserved;

      if (quantity > available) {
        throw new InsufficientStockError('Requested quantity exceeds available stock.');
      }

      // 4. Guarded increment of reserved_quantity
      await inventoryRepository.incrementProductReservedQuantity(productId, quantity, { transaction: tx });

      // 5. Create reservation record with PostgreSQL-authoritative 15-minute expiration
      const reservation = await inventoryRepository.createReservation(
        { orderId, productId, quantity, status: 'ACTIVE' },
        { transaction: tx }
      );

      return toReservationDTO(reservation);
    };

    if (externalTx) {
      return executeInTransaction(externalTx);
    }
    return sequelize.transaction(executeInTransaction);
  },

  /**
   * Release an active reservation and restore available inventory.
   * Lock ordering: 1. Reservation FOR UPDATE -> 2. Product FOR UPDATE.
   *
   * @param {string} reservationId
   * @param {{
   *   userId?: string,
   *   role?: string,
   *   transaction?: import('sequelize').Transaction
   * }} [options]
   * @returns {Promise<ReturnType<typeof toReservationDTO>>}
   */
  async releaseReservation(reservationId, { userId, role, transaction: externalTx } = {}) {
    const executeInTransaction = async (tx) => {
      // 1. Lock reservation row FOR UPDATE
      const reservation = await inventoryRepository.findReservationById(reservationId, {
        transaction: tx,
        lock: true,
      });

      if (!reservation) {
        throw new ReservationNotFoundError('Reservation was not found.');
      }

      // 2. Anti-IDOR: Verify customer ownership
      if (userId && String(role || '').toLowerCase() !== 'admin') {
        const order = await inventoryRepository.findOrderOwnership(reservation.order_id, { transaction: tx });
        if (!order || order.user_id !== userId) {
          throw new ReservationNotFoundError('Reservation was not found.');
        }
      }

      // 3. Check status: Idempotent return if already released/expired
      if (reservation.status === 'RELEASED' || reservation.status === 'EXPIRED') {
        return toReservationDTO(reservation);
      }

      if (reservation.status === 'CONVERTED') {
        throw new ReservationAlreadyConvertedError('Reservation has already been converted.');
      }

      // 4. Lock Product row FOR UPDATE
      const product = await inventoryRepository.findProductForUpdate(reservation.product_id, { transaction: tx });
      if (!product) {
        throw new NotFoundError(
          `Product with ID '${reservation.product_id}' was not found.`,
          'PRODUCT_NOT_FOUND'
        );
      }

      // 5. Verify invariant and guarded decrement
      const reserved = Number(product.reserved_quantity ?? 0);
      if (reserved < reservation.quantity) {
        throw new InventoryInvariantError('Reserved quantity is less than reservation quantity.');
      }

      await inventoryRepository.decrementProductReservedQuantity(
        reservation.product_id,
        reservation.quantity,
        { transaction: tx }
      );

      // 6. Mark reservation as RELEASED with PostgreSQL CURRENT_TIMESTAMP
      await inventoryRepository.markReservationReleased(reservation.id, { transaction: tx });

      await reservation.reload({ transaction: tx });
      return toReservationDTO(reservation);
    };

    if (externalTx) {
      return executeInTransaction(externalTx);
    }
    return sequelize.transaction(executeInTransaction);
  },

  /**
   * Convert an active reservation into a permanent stock deduction.
   * Lock ordering: 1. Reservation FOR UPDATE -> 2. Product FOR UPDATE.
   *
   * @param {string} reservationId
   * @param {{
   *   userId?: string,
   *   role?: string,
   *   transaction?: import('sequelize').Transaction
   * }} [options]
   * @returns {Promise<ReturnType<typeof toReservationDTO>>}
   */
  async convertReservation(reservationId, { userId, role, transaction: externalTx } = {}) {
    const executeInTransaction = async (tx) => {
      // 1. Lock reservation row FOR UPDATE
      const reservation = await inventoryRepository.findReservationById(reservationId, {
        transaction: tx,
        lock: true,
      });

      if (!reservation) {
        throw new ReservationNotFoundError('Reservation was not found.');
      }

      // 2. Anti-IDOR: Verify customer ownership
      if (userId && String(role || '').toLowerCase() !== 'admin') {
        const order = await inventoryRepository.findOrderOwnership(reservation.order_id, { transaction: tx });
        if (!order || order.user_id !== userId) {
          throw new ReservationNotFoundError('Reservation was not found.');
        }
      }

      // 3. Status checks: Idempotent return if already converted
      if (reservation.status === 'CONVERTED') {
        return toReservationDTO(reservation);
      }

      if (reservation.status === 'RELEASED') {
        throw new ReservationAlreadyReleasedError(
          'Reservation has already been released and cannot be converted.'
        );
      }

      if (reservation.status === 'EXPIRED') {
        throw new ReservationExpiredError('Reservation has expired and cannot be converted.');
      }

      // 4. PostgreSQL-authoritative expiration check
      const isExpiredRows = await sequelize.query(
        'SELECT (expires_at <= CURRENT_TIMESTAMP) AS is_expired FROM inventory_reservations WHERE id = :id LIMIT 1',
        {
          replacements: { id: reservation.id },
          type: QueryTypes.SELECT,
          transaction: tx,
        }
      );

      if (isExpiredRows[0]?.is_expired) {
        throw new ReservationExpiredError('Reservation has expired and cannot be converted.');
      }

      // 5. Lock Product row FOR UPDATE
      const product = await inventoryRepository.findProductForUpdate(reservation.product_id, { transaction: tx });
      if (!product) {
        throw new NotFoundError(
          `Product with ID '${reservation.product_id}' was not found.`,
          'PRODUCT_NOT_FOUND'
        );
      }

      const stock = Number(product.stock_quantity ?? 0);
      const reserved = Number(product.reserved_quantity ?? 0);

      if (stock < reservation.quantity || reserved < reservation.quantity) {
        throw new InventoryInvariantError(
          'Insufficient stock or reserved quantity to convert reservation.'
        );
      }

      // 6. Deduct both stock_quantity and reserved_quantity atomically
      await inventoryRepository.convertProductReservationToStockDeduction(
        reservation.product_id,
        reservation.quantity,
        { transaction: tx }
      );

      // 7. Mark reservation as CONVERTED
      await inventoryRepository.markReservationConverted(reservation.id, { transaction: tx });

      await reservation.reload({ transaction: tx });
      return toReservationDTO(reservation);
    };

    if (externalTx) {
      return executeInTransaction(externalTx);
    }
    return sequelize.transaction(executeInTransaction);
  },

  /**
   * Internal maintenance operation: safely release expired active reservations.
   * Does NOT depend on external schedulers or Redis.
   *
   * @param {{ limit?: number }} [options]
   * @returns {Promise<{ processed: number, releasedCount: number }>}
   */
  async releaseExpiredReservations({ limit = 100 } = {}) {
    const candidates = await inventoryRepository.findExpiredActiveReservations({ limit });
    let releasedCount = 0;

    for (const candidate of candidates) {
      await sequelize.transaction(async (tx) => {
        // Lock reservation row FOR UPDATE
        const reservation = await inventoryRepository.findReservationById(candidate.id, {
          transaction: tx,
          lock: true,
        });

        if (!reservation || reservation.status !== 'ACTIVE') {
          return;
        }

        // Re-verify expiration against PostgreSQL CURRENT_TIMESTAMP while locked
        const isExpiredRows = await sequelize.query(
          'SELECT (expires_at <= CURRENT_TIMESTAMP) AS is_expired FROM inventory_reservations WHERE id = :id LIMIT 1',
          {
            replacements: { id: reservation.id },
            type: QueryTypes.SELECT,
            transaction: tx,
          }
        );

        if (!isExpiredRows[0]?.is_expired) {
          return;
        }

        // Lock Product row FOR UPDATE
        const product = await inventoryRepository.findProductForUpdate(reservation.product_id, {
          transaction: tx,
        });

        if (!product) {
          return;
        }

        const reserved = Number(product.reserved_quantity ?? 0);
        if (reserved < reservation.quantity) {
          throw new InventoryInvariantError(
            'Reserved quantity is less than expired reservation quantity.'
          );
        }

        // Guarded decrement of reserved_quantity
        await inventoryRepository.decrementProductReservedQuantity(
          reservation.product_id,
          reservation.quantity,
          { transaction: tx }
        );

        // Mark as EXPIRED with PostgreSQL CURRENT_TIMESTAMP
        await inventoryRepository.markReservationExpired(reservation.id, { transaction: tx });
        releasedCount += 1;
      });
    }

    return { processed: candidates.length, releasedCount };
  },

  /**
   * Retrieve a reservation by ID with ownership verification.
   *
   * @param {string} reservationId
   * @param {{ userId?: string, role?: string }} [options]
   * @returns {Promise<ReturnType<typeof toReservationDTO>>}
   */
  async getReservation(reservationId, { userId, role } = {}) {
    const reservation = await inventoryRepository.findReservationById(reservationId);
    if (!reservation) {
      throw new ReservationNotFoundError('Reservation was not found.');
    }

    if (userId && String(role || '').toLowerCase() !== 'admin') {
      const order = await inventoryRepository.findOrderOwnership(reservation.order_id);
      if (!order || order.user_id !== userId) {
        throw new ReservationNotFoundError('Reservation was not found.');
      }
    }

    return toReservationDTO(reservation);
  },

  /**
   * Get public inventory counters for a product.
   *
   * @param {string} productId
   * @returns {Promise<ReturnType<typeof toProductInventoryDTO>>}
   */
  async getProductInventory(productId) {
    const product = await Product.findOne({
      where: {
        id: productId,
        is_deleted: false,
      },
      attributes: ['id', 'stock_quantity', 'reserved_quantity'],
    });

    if (!product) {
      throw new NotFoundError(`Product with ID '${productId}' was not found.`, 'PRODUCT_NOT_FOUND');
    }

    return toProductInventoryDTO(product);
  },
};

export default inventoryService;
