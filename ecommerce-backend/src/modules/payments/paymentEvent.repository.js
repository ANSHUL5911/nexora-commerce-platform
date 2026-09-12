import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { PaymentEvent } from '../../models/PaymentEvent.js';

export const paymentEventRepository = {
  /**
   * Persist a new PaymentEvent.
   *
   * @param {{
   *   event_id: string,
   *   event_type: string,
   *   order_id?: string | null,
   *   payment_attempt_id?: string | null,
   *   processing_status?: string,
   *   metadata_json?: Record<string, unknown> | null,
   * }} data
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<PaymentEvent>}
   */
  async createPaymentEvent(data, { transaction } = {}) {
    return PaymentEvent.create(data, { transaction });
  },

  /**
   * Find a PaymentEvent by Razorpay event_id.
   *
   * @param {string} eventId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<PaymentEvent | null>}
   */
  async findByEventId(eventId, { transaction, lock = false } = {}) {
    return PaymentEvent.findOne({
      where: { event_id: eventId },
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Find a PaymentEvent by primary key UUID.
   *
   * @param {string} id
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean }} [options]
   * @returns {Promise<PaymentEvent | null>}
   */
  async findById(id, { transaction, lock = false } = {}) {
    return PaymentEvent.findByPk(id, {
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
      transaction,
    });
  },

  /**
   * Safely update the processing status and associated entities of a PaymentEvent.
   *
   * @param {string} id
   * @param {string} processingStatus
   * @param {{
   *   orderId?: string | null,
   *   paymentAttemptId?: string | null,
   *   metadataJson?: Record<string, unknown> | null,
   *   transaction?: import('sequelize').Transaction
   * }} [options]
   * @returns {Promise<number>} Number of affected rows
   */
  async updateStatus(
    id,
    processingStatus,
    { orderId, paymentAttemptId, metadataJson, transaction } = {}
  ) {
    const fields = ['processing_status = :processingStatus'];
    const replacements = { id, processingStatus };

    if (orderId !== undefined) {
      fields.push('order_id = :orderId');
      replacements.orderId = orderId;
    }

    if (paymentAttemptId !== undefined) {
      fields.push('payment_attempt_id = :paymentAttemptId');
      replacements.paymentAttemptId = paymentAttemptId;
    }

    if (metadataJson !== undefined) {
      fields.push('metadata_json = :metadataJson');
      replacements.metadataJson = JSON.stringify(metadataJson);
    }

    const [, affectedCount] = await sequelize.query(
      `UPDATE payment_events
       SET ${fields.join(', ')}
       WHERE id = :id`,
      {
        replacements,
        type: QueryTypes.UPDATE,
        transaction,
      }
    );

    return affectedCount;
  },
};

export default paymentEventRepository;
