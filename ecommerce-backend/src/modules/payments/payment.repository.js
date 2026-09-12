import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { PaymentAttempt } from '../../models/PaymentAttempt.js';

export const paymentRepository = {
  /**
   * Insert a new PaymentAttempt record.
   *
   * @param {{
   *   order_id: string,
   *   attempt_number: number,
   *   amount_paise: number,
   *   status?: string,
   *   razorpay_order_id?: string | null,
   *   razorpay_payment_id?: string | null,
   *   failure_reason?: string | null
   * }} data
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<PaymentAttempt>}
   */
  async createPaymentAttempt(data, { transaction } = {}) {
    return PaymentAttempt.create(data, { transaction });
  },

  /**
   * Find a PaymentAttempt by primary key.
   *
   * @param {string} id
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<PaymentAttempt | null>}
   */
  async findPaymentAttemptById(id, { transaction, lock = false } = {}) {
    return PaymentAttempt.findByPk(id, {
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Find all PaymentAttempts for a specific order.
   *
   * @param {string} orderId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<PaymentAttempt[]>}
   */
  async findByOrderId(orderId, { transaction, lock = false } = {}) {
    return PaymentAttempt.findAll({
      where: { order_id: orderId },
      order: [['attempt_number', 'ASC']],
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Find the latest PaymentAttempt for an order.
   *
   * @param {string} orderId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<PaymentAttempt | null>}
   */
  async findLatestByOrderId(orderId, { transaction, lock = false } = {}) {
    return PaymentAttempt.findOne({
      where: { order_id: orderId },
      order: [['attempt_number', 'DESC']],
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Find PaymentAttempt by Razorpay Order ID.
   *
   * @param {string} razorpayOrderId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<PaymentAttempt | null>}
   */
  async findByRazorpayOrderId(razorpayOrderId, { transaction, lock = false } = {}) {
    return PaymentAttempt.findOne({
      where: { razorpay_order_id: razorpayOrderId },
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Find any SUCCESS PaymentAttempt for an order.
   *
   * @param {string} orderId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<PaymentAttempt | null>}
   */
  async getSuccessAttemptForOrder(orderId, { transaction } = {}) {
    return PaymentAttempt.findOne({
      where: {
        order_id: orderId,
        status: 'SUCCESS',
      },
      transaction,
    });
  },

  /**
   * Calculate next attempt number under lock.
   *
   * @param {string} orderId
   * @param {{ transaction: import('sequelize').Transaction }} options
   * @returns {Promise<number>}
   */
  async getMaxAttemptNumber(orderId, { transaction }) {
    const rows = await sequelize.query(
      'SELECT COALESCE(MAX(attempt_number), 0) AS max_attempt FROM payment_attempts WHERE order_id = :orderId',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    const maxVal = rows[0]?.max_attempt;
    return Number(maxVal ?? 0);
  },

  /**
   * Conditionally update Razorpay Order ID on INITIATED attempt where razorpay_order_id is NULL.
   *
   * @param {string} id
   * @param {string} razorpayOrderId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>} Number of affected rows
   */
  async updateRazorpayOrderIdConditionally(id, razorpayOrderId, { transaction } = {}) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE payment_attempts
       SET razorpay_order_id = :razorpayOrderId,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id
         AND status = 'INITIATED'
         AND razorpay_order_id IS NULL`,
      {
        replacements: { id, razorpayOrderId },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );
    return affectedCount;
  },

  /**
   * Mark a PaymentAttempt as FAILED with failure reason.
   *
   * @param {string} id
   * @param {string} failureReason
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>} Number of affected rows
   */
  async markAttemptFailed(id, failureReason, { transaction } = {}) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE payment_attempts
       SET status = 'FAILED',
           failure_reason = :failureReason,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: { id, failureReason: failureReason.slice(0, 500) },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );
    return affectedCount;
  },

  /**
   * Mark a PaymentAttempt as SUCCESS with razorpay_payment_id.
   *
   * @param {string} id
   * @param {string} razorpayPaymentId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>} Number of affected rows
   */
  async markAttemptSuccess(id, razorpayPaymentId, { transaction } = {}) {
    const [, affectedCount] = await sequelize.query(
      `UPDATE payment_attempts
       SET status = 'SUCCESS',
           razorpay_payment_id = :razorpayPaymentId,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id
         AND status != 'SUCCESS'`,
      {
        replacements: { id, razorpayPaymentId },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );
    return affectedCount;
  },
};

export default paymentRepository;
