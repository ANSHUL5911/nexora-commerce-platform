import { Op } from 'sequelize';
import { Order, OrderItem, User, PaymentAttempt, StockRestockLog } from '../../models/index.js';

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

export const PAYMENT_ATTEMPT_ADMIN_ATTRIBUTES = [
  'id',
  'order_id',
  'attempt_number',
  'razorpay_order_id',
  'razorpay_payment_id',
  'razorpay_refund_id',
  'status',
  'amount_paise',
  'created_at',
  'updated_at',
];

export const RESTOCK_LOG_ADMIN_ATTRIBUTES = [
  'id',
  'order_id',
  'product_id',
  'quantity_restocked',
  'initiated_by',
  'reason',
  'created_at',
];

export const USER_ADMIN_SUMMARY_ATTRIBUTES = [
  'id',
  'email',
  'full_name',
  'role',
];

/**
 * Escape LIKE / iLIKE wildcard characters to prevent wildcard injection/abuse.
 * @param {string} str
 * @returns {string}
 */
function escapeLikeWildcards(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

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

  /**
   * Find paginated orders for administrative console with multi-parameter filtering and eager loading.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string,
   *   userId?: string,
   *   search?: string,
   *   startDate?: Date,
   *   endDate?: Date,
   *   transaction?: import('sequelize').Transaction
   * }} options
   * @returns {Promise<{ rows: Order[], count: number }>}
   */
  async findAllOrdersAdmin({
    page = 1,
    limit = 10,
    status,
    userId,
    search,
    startDate,
    endDate,
    transaction,
  } = {}) {
    const whereConditions = {};

    if (status) {
      whereConditions.order_status = status;
    }

    if (userId) {
      whereConditions.user_id = userId;
    }

    if (startDate || endDate) {
      whereConditions.created_at = {};
      if (startDate) {
        whereConditions.created_at[Op.gte] = startDate;
      }
      if (endDate) {
        whereConditions.created_at[Op.lte] = endDate;
      }
    }

    if (search && search.trim().length > 0) {
      const sanitized = escapeLikeWildcards(search.trim());
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.trim());
      if (isUuid) {
        whereConditions.id = search.trim();
      } else {
        whereConditions[Op.or] = [
          { shipping_full_name: { [Op.iLike]: `%${sanitized}%` } },
          { shipping_phone: { [Op.iLike]: `%${sanitized}%` } },
          { shipping_city: { [Op.iLike]: `%${sanitized}%` } },
        ];
      }
    }

    const boundedPage = Math.max(1, page);
    const boundedLimit = Math.min(50, Math.max(1, limit));
    const offset = (boundedPage - 1) * boundedLimit;

    const result = await Order.findAndCountAll({
      where: whereConditions,
      attributes: ORDER_PUBLIC_ATTRIBUTES,
      include: [
        {
          model: OrderItem,
          as: 'items',
          attributes: ORDER_ITEM_PUBLIC_ATTRIBUTES,
        },
        {
          model: User,
          as: 'user',
          attributes: USER_ADMIN_SUMMARY_ATTRIBUTES,
        },
        {
          model: PaymentAttempt,
          as: 'paymentAttempts',
          attributes: PAYMENT_ATTEMPT_ADMIN_ATTRIBUTES,
        },
      ],
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC'],
        [{ model: OrderItem, as: 'items' }, 'created_at', 'ASC'],
        [{ model: OrderItem, as: 'items' }, 'id', 'ASC'],
      ],
      limit: boundedLimit,
      offset,
      distinct: true,
      transaction,
    });

    return result;
  },

  /**
   * Find detailed order for administrative console with all related operational context.
   *
   * @param {string} orderId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<Order | null>}
   */
  async findAdminOrderById(orderId, { transaction, lock } = {}) {
    const shouldInclude = !lock;
    return Order.findByPk(orderId, {
      attributes: ORDER_PUBLIC_ATTRIBUTES,
      include: shouldInclude
        ? [
          {
            model: OrderItem,
            as: 'items',
            attributes: ORDER_ITEM_PUBLIC_ATTRIBUTES,
          },
          {
            model: User,
            as: 'user',
            attributes: USER_ADMIN_SUMMARY_ATTRIBUTES,
          },
          {
            model: PaymentAttempt,
            as: 'paymentAttempts',
            attributes: PAYMENT_ATTEMPT_ADMIN_ATTRIBUTES,
          },
          {
            model: StockRestockLog,
            as: 'restockLogs',
            attributes: RESTOCK_LOG_ADMIN_ATTRIBUTES,
          },
        ]
        : [],
      order: shouldInclude
        ? [
          [{ model: OrderItem, as: 'items' }, 'created_at', 'ASC'],
          [{ model: PaymentAttempt, as: 'paymentAttempts' }, 'attempt_number', 'DESC'],
          [{ model: StockRestockLog, as: 'restockLogs' }, 'created_at', 'DESC'],
        ]
        : undefined,
      transaction,
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
    });
  },
};

export default orderRepository;
