import crypto from 'crypto';
import { sequelize } from '../../config/database.js';
import { IdempotencyRecord, Order, PaymentAttempt } from '../../models/index.js';
import {
  IDEMPOTENCY_STATUS,
  DEFAULT_IDEMPOTENCY_EXPIRY_HOURS,
} from './idempotency.constants.js';
import {
  IdempotencyPayloadMismatchError,
  IdempotencyInProgressError,
} from './idempotency.errors.js';
import { toOrderDTO } from '../orders/order.dto.js';
import { toPaymentInitiationDTO } from '../payments/payment.dto.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const idempotencyRepository = {
  /**
   * Atomically claims an idempotency key or handles deterministic replay/recovery under row lock.
   *
   * @param {{
   *   idempotencyKey: string,
   *   requestPath: string,
   *   requestHash: string,
   *   expiresAt?: Date
   * }} params
   * @returns {Promise<{ record: IdempotencyRecord, claimed: boolean, replayed: boolean }>}
   */
  async claimKey({
    idempotencyKey,
    requestPath,
    requestHash,
    expiresAt = new Date(Date.now() + DEFAULT_IDEMPOTENCY_EXPIRY_HOURS * 60 * 60 * 1000),
  }) {
    // 1. Attempt optimistic atomic insertion
    try {
      const newRecord = await IdempotencyRecord.create({
        id: crypto.randomUUID(),
        idempotency_key: idempotencyKey,
        request_path: requestPath,
        status: IDEMPOTENCY_STATUS.IN_PROGRESS,
        request_hash: requestHash,
        expires_at: expiresAt,
      });

      logger.info('Idempotency key claimed', {
        event: 'idempotency.claimed',
        path: requestPath,
      });

      return {
        record: newRecord,
        claimed: true,
        replayed: false,
      };
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') {
        throw err;
      }
    }

    let errorToThrow = null;
    let result = null;

    await sequelize.transaction(async (tx) => {
      const existingRecord = await IdempotencyRecord.findOne({
        where: {
          idempotency_key: idempotencyKey,
          request_path: requestPath,
        },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (!existingRecord) {
        // Race condition: record was deleted between insertion attempt and lock acquisition
        const recreated = await IdempotencyRecord.create(
          {
            id: crypto.randomUUID(),
            idempotency_key: idempotencyKey,
            request_path: requestPath,
            status: IDEMPOTENCY_STATUS.IN_PROGRESS,
            request_hash: requestHash,
            expires_at: expiresAt,
          },
          { transaction: tx }
        );
        result = { record: recreated, claimed: true, replayed: false };
        return;
      }

      // Check request payload hash integrity
      if (existingRecord.request_hash !== requestHash) {
        logger.warn('Idempotency payload mismatch', {
          event: 'idempotency.payload_mismatch',
          path: requestPath,
        });
        throw new IdempotencyPayloadMismatchError(
          'Idempotency key has already been used with a different request payload.'
        );
      }

      // Handle COMPLETED state -> immediate cached replay
      if (existingRecord.status === IDEMPOTENCY_STATUS.COMPLETED) {
        logger.info('Idempotency cached replay returned', {
          event: 'idempotency.replay',
          path: requestPath,
          orderId: existingRecord.order_id,
          paymentAttemptId: existingRecord.payment_attempt_id,
        });
        result = {
          record: existingRecord,
          claimed: false,
          replayed: true,
        };
        return;
      }

      // Handle FAILED_RETRYABLE state -> safe atomic re-claim
      if (existingRecord.status === IDEMPOTENCY_STATUS.FAILED_RETRYABLE) {
        await existingRecord.update(
          {
            status: IDEMPOTENCY_STATUS.IN_PROGRESS,
            updated_at: new Date(),
          },
          { transaction: tx }
        );

        result = {
          record: existingRecord,
          claimed: true,
          replayed: false,
        };
        return;
      }

      // Handle IN_PROGRESS state: Distinguish active processing vs recoverable crash
      if (existingRecord.status === IDEMPOTENCY_STATUS.IN_PROGRESS) {
        // A. If payment_attempt_id is linked, inspect PaymentAttempt first
        if (existingRecord.payment_attempt_id) {
          const attempt = await PaymentAttempt.findByPk(existingRecord.payment_attempt_id, {
            transaction: tx,
          });

          if (attempt && attempt.razorpay_order_id) {
            const paymentDTO = toPaymentInitiationDTO(attempt, config.RAZORPAY_KEY_ID);
            await existingRecord.update(
              {
                status: IDEMPOTENCY_STATUS.COMPLETED,
                response_code: 201,
                response_body: paymentDTO,
                updated_at: new Date(),
              },
              { transaction: tx }
            );

            logger.info('Idempotency recovery performed from existing payment attempt', {
              event: 'idempotency.recovery',
              path: requestPath,
              paymentAttemptId: attempt.id,
            });

            result = {
              record: existingRecord,
              claimed: false,
              replayed: true,
            };
            return;
          } else if (attempt && !attempt.razorpay_order_id) {
            // Gateway creation timed out or crashed without saving razorpay_order_id
            await attempt.update(
              {
                status: 'FAILED',
                failure_reason: 'GATEWAY_ERROR',
              },
              { transaction: tx }
            );

            await existingRecord.update(
              {
                status: IDEMPOTENCY_STATUS.FAILED_RETRYABLE,
                updated_at: new Date(),
              },
              { transaction: tx }
            );

            errorToThrow = new IdempotencyInProgressError(
              'An operation with this idempotency key was interrupted and marked retryable. Please retry.'
            );
            return;
          }
        } else if (existingRecord.order_id) {
          // B. If order_id is linked (and no payment attempt), inspect if Order committed before response completion
          const order = await Order.findByPk(existingRecord.order_id, {
            include: ['items'],
            transaction: tx,
          });

          if (order && (order.order_status === 'PENDING_PAYMENT' || order.order_status === 'PAID')) {
            const orderDTO = toOrderDTO(order);
            await existingRecord.update(
              {
                status: IDEMPOTENCY_STATUS.COMPLETED,
                response_code: 201,
                response_body: orderDTO,
                updated_at: new Date(),
              },
              { transaction: tx }
            );

            result = {
              record: existingRecord,
              claimed: false,
              replayed: true,
            };
            return;
          }
        }

        // Genuinely active operation or uncompleted attempt
        logger.warn('Idempotency operation currently in progress', {
          event: 'idempotency.in_progress',
          path: requestPath,
        });
        throw new IdempotencyInProgressError(
          'An operation with this idempotency key is currently in progress. Please retry shortly.'
        );
      }

      logger.warn('Idempotency operation currently in progress', {
        event: 'idempotency.in_progress',
        path: requestPath,
      });
      throw new IdempotencyInProgressError(
        'An operation with this idempotency key is currently in progress. Please retry shortly.'
      );
    });

    if (errorToThrow) {
      throw errorToThrow;
    }

    return result;
  },

  /**
   * Transactionally marks an idempotency record as COMPLETED with response payload and entity references.
   *
   * @param {string} id
   * @param {{
   *   responseCode: number,
   *   responseBody: any,
   *   orderId?: string,
   *   paymentAttemptId?: string
   * }} data
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<IdempotencyRecord>}
   */
  async completeRecord(
    id,
    { responseCode, responseBody, orderId, paymentAttemptId },
    { transaction } = {}
  ) {
    const updateData = {
      status: IDEMPOTENCY_STATUS.COMPLETED,
      response_code: responseCode,
      response_body: responseBody,
      updated_at: new Date(),
    };

    if (orderId) {
      updateData.order_id = orderId;
    }
    if (paymentAttemptId) {
      updateData.payment_attempt_id = paymentAttemptId;
    }

    if (transaction) {
      await IdempotencyRecord.update(updateData, {
        where: { id },
        transaction,
      });
      logger.info('Idempotency record completed', {
        event: 'idempotency.completed',
        orderId,
        paymentAttemptId,
      });
      return IdempotencyRecord.findByPk(id, { transaction });
    }

    await IdempotencyRecord.update(updateData, {
      where: { id },
    });
    logger.info('Idempotency record completed', {
      event: 'idempotency.completed',
      orderId,
      paymentAttemptId,
    });
    return IdempotencyRecord.findByPk(id);
  },

  /**
   * Links intermediate entity references to an in-progress idempotency record within a transaction.
   *
   * @param {string} id
   * @param {{ orderId?: string, paymentAttemptId?: string }} data
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<IdempotencyRecord>}
   */
  async linkEntities(id, { orderId, paymentAttemptId }, { transaction } = {}) {
    const updateData = { updated_at: new Date() };
    if (orderId) updateData.order_id = orderId;
    if (paymentAttemptId) updateData.payment_attempt_id = paymentAttemptId;

    if (transaction) {
      await IdempotencyRecord.update(updateData, {
        where: { id },
        transaction,
      });
      return IdempotencyRecord.findByPk(id, { transaction });
    }

    await IdempotencyRecord.update(updateData, { where: { id } });
    return IdempotencyRecord.findByPk(id);
  },

  /**
   * Transitions an idempotency record to FAILED_RETRYABLE to permit safe client retries.
   *
   * @param {string} id
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<void>}
   */
  async markFailedRetryable(id, { transaction } = {}) {
    const updateData = {
      status: IDEMPOTENCY_STATUS.FAILED_RETRYABLE,
      updated_at: new Date(),
    };

    if (transaction) {
      await IdempotencyRecord.update(updateData, {
        where: { id },
        transaction,
      });
    } else {
      await IdempotencyRecord.update(updateData, {
        where: { id },
      });
    }

    logger.info('Idempotency record marked failed retryable', {
      event: 'idempotency.failed_retryable',
    });
  },

  /**
   * Deletes an idempotency record on early client validation failure.
   *
   * @param {string} id
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<void>}
   */
  async deleteRecord(id, { transaction } = {}) {
    if (transaction) {
      await IdempotencyRecord.destroy({ where: { id }, transaction });
    } else {
      await IdempotencyRecord.destroy({ where: { id } });
    }
  },

  /**
   * Find record by idempotency_key and request_path.
   *
   * @param {string} idempotencyKey
   * @param {string} requestPath
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<IdempotencyRecord | null>}
   */
  async findByKeyAndPath(idempotencyKey, requestPath, { transaction } = {}) {
    return IdempotencyRecord.findOne({
      where: {
        idempotency_key: idempotencyKey,
        request_path: requestPath,
      },
      transaction,
    });
  },
};

export default idempotencyRepository;
