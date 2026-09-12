import { Order, OrderItem } from '../../models/index.js';

export const ORDER_PUBLIC_ATTRIBUTES = [
  'id',
  'user_id',
  'order_status',
  'total_cost_paise',
  'shipping_fee_paise',
  'shipping_full_name',
  'shipping_address_line1',
  'shipping_city',
  'shipping_state',
  'shipping_pincode',
  'shipping_phone',
  'guest_token_hash',
  'reservation_expires_at',
  'created_at',
  'updated_at',
];

export const ORDER_ITEM_PUBLIC_ATTRIBUTES = [
  'id',
  'order_id',
  'product_id',
  'product_name_snapshot',
  'quantity',
  'unit_price_paise',
  'created_at',
  'updated_at',
];

export const orderRepository = {
  /**
   * Create an Order row in PostgreSQL.
   *
   * @param {object} orderData
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<Order>}
   */
  async createOrder(orderData, { transaction }) {
    return Order.create(orderData, { transaction });
  },

  /**
   * Bulk create OrderItems in PostgreSQL.
   *
   * @param {Array<object>} itemsData
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<OrderItem[]>}
   */
  async createOrderItems(itemsData, { transaction }) {
    return OrderItem.bulkCreate(itemsData, { transaction, validate: true });
  },

  /**
   * Find an Order by primary key with optional eager-loaded items.
   *
   * @param {string} orderId
   * @param {{
   *   transaction?: import('sequelize').Transaction,
   *   lock?: boolean | import('sequelize').Transaction.LOCK,
   *   includeItems?: boolean
   * }} [options]
   * @returns {Promise<Order | null>}
   */
  async findOrderById(orderId, { transaction, lock, includeItems = true } = {}) {
    const shouldInclude = includeItems && !lock;
    const include = shouldInclude
      ? [
        {
          model: OrderItem,
          as: 'items',
          attributes: ORDER_ITEM_PUBLIC_ATTRIBUTES,
        },
      ]
      : [];

    return Order.findByPk(orderId, {
      attributes: ORDER_PUBLIC_ATTRIBUTES,
      include,
      order: shouldInclude
        ? [
          [{ model: OrderItem, as: 'items' }, 'created_at', 'ASC'],
          [{ model: OrderItem, as: 'items' }, 'id', 'ASC'],
        ]
        : undefined,
      transaction,
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
    });
  },

  /**
   * Find paginated orders for a user with eager-loaded items.
   * Uses deterministic ordering and bounded pagination.
   *
   * @param {string} userId
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string,
   *   transaction?: import('sequelize').Transaction
   * }} [options]
   * @returns {Promise<Order[]>}
   */
  async findOrdersByUserId(userId, { page = 1, limit = 10, status, transaction } = {}) {
    const where = { user_id: userId };
    if (status) {
      where.order_status = status;
    }

    const offset = (Math.max(1, page) - 1) * limit;

    return Order.findAll({
      where,
      attributes: ORDER_PUBLIC_ATTRIBUTES,
      include: [
        {
          model: OrderItem,
          as: 'items',
          attributes: ORDER_ITEM_PUBLIC_ATTRIBUTES,
        },
      ],
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC'],
        [{ model: OrderItem, as: 'items' }, 'created_at', 'ASC'],
        [{ model: OrderItem, as: 'items' }, 'id', 'ASC'],
      ],
      limit,
      offset,
      transaction,
    });
  },

  /**
   * Count total orders for a user matching optional status filter.
   *
   * @param {string} userId
   * @param {{ status?: string, transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>}
   */
  async countOrdersByUserId(userId, { status, transaction } = {}) {
    const where = { user_id: userId };
    if (status) {
      where.order_status = status;
    }

    return Order.count({
      where,
      transaction,
    });
  },

  /**
   * Update order status with database-authoritative timestamp.
   *
   * @param {string} orderId
   * @param {string} orderStatus
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>}
   */
  async updateOrderStatus(orderId, orderStatus, { transaction } = {}) {
    const [affectedCount] = await Order.update(
      {
        order_status: orderStatus,
        updated_at: new Date(),
      },
      {
        where: { id: orderId },
        transaction,
      }
    );
    return affectedCount;
  },
};

export default orderRepository;
