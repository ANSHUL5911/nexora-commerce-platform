import { Op, QueryTypes, Sequelize } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { Product } from '../../models/Product.js';
import { InventoryReservation } from '../../models/InventoryReservation.js';
import { InventoryInvariantError } from './inventory.errors.js';

export const inventoryRepository = {
  /**
   * Acquire a row-level lock on a single product using SELECT ... FOR UPDATE.
   *
   * @param {string} productId
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<Product | null>}
   */
  async findProductForUpdate(productId, { transaction }) {
    return Product.findOne({
      where: {
        id: productId,
        is_deleted: false,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  },

  /**
   * Acquire row-level locks on multiple products ordered deterministically by ID ASC.
   * Prevents multi-product checkout deadlock races.
   *
   * @param {string[]} productIds
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<Product[]>}
   */
  async findProductsForUpdate(productIds, { transaction }) {
    const uniqueSortedIds = [...new Set(productIds)].sort();
    return Product.findAll({
      where: {
        id: uniqueSortedIds,
        is_deleted: false,
      },
      order: [['id', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  },

  /**
   * Query the parent Order record directly to verify customer ownership (Anti-IDOR).
   * Does NOT import or implement Phase 07.7 Order domain.
   *
   * @param {string} orderId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<{ id: string, user_id: string | null, order_status: string } | null>}
   */
  async findOrderOwnership(orderId, { transaction } = {}) {
    const rows = await sequelize.query(
      'SELECT id, user_id, order_status FROM orders WHERE id = :orderId LIMIT 1',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    return rows[0] || null;
  },

  /**
   * Create an InventoryReservation with PostgreSQL-authoritative expiration (15m TTL).
   *
   * @param {{
   *   orderId: string,
   *   productId: string,
   *   quantity: number,
   *   status?: string
   * }} data
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<InventoryReservation>}
   */
  async createReservation({ orderId, productId, quantity, status = 'ACTIVE' }, { transaction }) {
    const reservation = await InventoryReservation.create(
      {
        order_id: orderId,
        product_id: productId,
        quantity,
        status,
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
      },
      { transaction }
    );

    // Reload within transaction to read the exact PostgreSQL-computed timestamp
    await reservation.reload({ transaction });
    return reservation;
  },

  /**
   * Find an inventory reservation by primary key.
   *
   * @param {string} reservationId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<InventoryReservation | null>}
   */
  async findReservationById(reservationId, { transaction, lock = false } = {}) {
    return InventoryReservation.findByPk(reservationId, {
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Query active reservations whose database expiration deadline has passed.
   *
   * @param {{ limit?: number, transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<InventoryReservation[]>}
   */
  async findExpiredActiveReservations({ limit = 100, transaction, lock = false } = {}) {
    return InventoryReservation.findAll({
      where: {
        status: 'ACTIVE',
        expires_at: {
          [Op.lte]: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      order: [['expires_at', 'ASC']],
      limit,
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Increment Product.reserved_quantity with guarded invariant check.
   *
   * @param {string} productId
   * @param {number} quantity
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>} Number of updated rows (must be 1)
   */
  async incrementProductReservedQuantity(productId, quantity, { transaction }) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE products
       SET reserved_quantity = reserved_quantity + :quantity,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :productId
         AND (stock_quantity - reserved_quantity) >= :quantity`,
      {
        replacements: { productId, quantity },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );

    if (affectedCount === 0) {
      throw new InventoryInvariantError(
        `Failed to increment reserved quantity: insufficient available stock for product ${productId}.`
      );
    }

    return affectedCount;
  },

  /**
   * Decrement Product.reserved_quantity with guarded invariant check.
   * NEVER uses Math.max() or silent clamping.
   *
   * @param {string} productId
   * @param {number} quantity
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>} Number of updated rows (must be 1)
   */
  async decrementProductReservedQuantity(productId, quantity, { transaction }) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE products
       SET reserved_quantity = reserved_quantity - :quantity,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :productId
         AND reserved_quantity >= :quantity`,
      {
        replacements: { productId, quantity },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );

    if (affectedCount === 0) {
      throw new InventoryInvariantError(
        `Failed to decrement reserved quantity: product ${productId} reserved_quantity is less than ${quantity}.`
      );
    }

    return affectedCount;
  },

  /**
   * Convert reserved stock into permanent stock deduction.
   * Decrements both stock_quantity and reserved_quantity atomically.
   *
   * @param {string} productId
   * @param {number} quantity
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>} Number of updated rows (must be 1)
   */
  async convertProductReservationToStockDeduction(productId, quantity, { transaction }) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE products
       SET stock_quantity = stock_quantity - :quantity,
           reserved_quantity = reserved_quantity - :quantity,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :productId
         AND stock_quantity >= :quantity
         AND reserved_quantity >= :quantity`,
      {
        replacements: { productId, quantity },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );

    if (affectedCount === 0) {
      throw new InventoryInvariantError(
        `Failed to convert reservation: product ${productId} stock or reserved quantity is insufficient.`
      );
    }

    return affectedCount;
  },

  /**
   * Mark reservation as RELEASED with database-authoritative released_at.
   *
   * @param {string} reservationId
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>}
   */
  async markReservationReleased(reservationId, { transaction }) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE inventory_reservations
       SET status = 'RELEASED',
           released_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :reservationId
         AND status = 'ACTIVE'`,
      {
        replacements: { reservationId },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );
    return affectedCount;
  },

  /**
   * Mark reservation as EXPIRED with database-authoritative released_at.
   *
   * @param {string} reservationId
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>}
   */
  async markReservationExpired(reservationId, { transaction }) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE inventory_reservations
       SET status = 'EXPIRED',
           released_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :reservationId
         AND status = 'ACTIVE'`,
      {
        replacements: { reservationId },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );
    return affectedCount;
  },

  /**
   * Mark reservation as CONVERTED.
   *
   * @param {string} reservationId
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>}
   */
  async markReservationConverted(reservationId, { transaction }) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE inventory_reservations
       SET status = 'CONVERTED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :reservationId
         AND status = 'ACTIVE'`,
      {
        replacements: { reservationId },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );
    return affectedCount;
  },
};

export default inventoryRepository;
