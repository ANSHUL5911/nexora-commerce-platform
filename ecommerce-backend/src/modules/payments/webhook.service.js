import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { Order } from '../../models/Order.js';
import { paymentRepository } from './payment.repository.js';
import { paymentEventRepository } from './paymentEvent.repository.js';
import { razorpayGateway } from './razorpay.gateway.js';
import { paymentService } from './payment.service.js';
import {
  PAYMENT_STATUS,
  PAYMENT_CURRENCY,
  PAYMENT_FAILURE_REASON,
  EVENT_PROCESSING_STATUS,
  WEBHOOK_EVENT_TYPES,
} from './payment.constants.js';
import {
  WebhookSignatureVerificationError,
  WebhookPayloadValidationError,
  PaymentAttemptNotFoundError,
  PaymentVerificationError,
} from './payment.errors.js';

export const webhookService = {
  /**
   * Authoritative Razorpay Webhook Processing Engine.
   *
   * Lifecycle:
   * 1. Timing-safe HMAC-SHA256 signature verification over exact raw request body bytes.
   * 2. Payload structural validation and event_id extraction.
   * 3. Idempotent event persistence in `payment_events` with PostgreSQL uniqueness.
   * 4. Idempotent deduplication (duplicate events safe no-op).
   * 5. Authoritative `payment.captured` handling:
   *    - Link PaymentAttempt and Order.
   *    - Verify server-authoritative monetary amounts and INR currency.
   *    - Route Late Captures on expired orders/reservations to `REQUIRES_REFUND`.
   *    - Delegate active captures to shared domain `paymentService.settleCapturedPayment()`.
   *
   * @param {{
   *   rawBody: Buffer | string,
   *   signature: string,
   *   payload: Record<string, unknown>
   * }} params
   * @returns {Promise<{ status: string, eventId: string, details?: Record<string, unknown> }>}
   */
  async processRazorpayWebhook({ rawBody, signature, payload }) {
    // ----------------------------------------------------
    // STEP 1: Timing-safe Raw-Body Signature Verification
    // ----------------------------------------------------
    const isSignatureValid = razorpayGateway.verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isSignatureValid) {
      logger.warn('Razorpay webhook signature verification failed', {
        event: 'webhook.signature.invalid',
      });
      throw new WebhookSignatureVerificationError(
        'Invalid Razorpay webhook signature.'
      );
    }

    // ----------------------------------------------------
    // STEP 2: Extract & Validate Event Structure
    // ----------------------------------------------------
    if (!payload || typeof payload !== 'object') {
      throw new WebhookPayloadValidationError('Webhook payload must be an object.');
    }

    const eventId = payload.id || payload.event_id;
    const eventType = payload.event || payload.event_type;

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      throw new WebhookPayloadValidationError('Webhook event ID is required.');
    }

    if (!eventType || typeof eventType !== 'string' || !eventType.trim()) {
      throw new WebhookPayloadValidationError('Webhook event type is required.');
    }

    // ----------------------------------------------------
    // STEP 3: Idempotent Event Persistence & Recovery
    // ----------------------------------------------------
    let paymentEvent;
    try {
      paymentEvent = await paymentEventRepository.createPaymentEvent({
        event_id: eventId,
        event_type: eventType,
        processing_status: EVENT_PROCESSING_STATUS.RECEIVED,
        metadata_json: {
          received_at: new Date().toISOString(),
          event_type: eventType,
        },
      });
    } catch (err) {
      // If event_id already exists in PostgreSQL, inspect existing event state for safe recovery
      if (
        err instanceof UniqueConstraintError ||
        err.name === 'SequelizeUniqueConstraintError'
      ) {
        const existingEvent = await paymentEventRepository.findByEventId(eventId);
        if (existingEvent) {
          if (
            existingEvent.processing_status === EVENT_PROCESSING_STATUS.PROCESSED
          ) {
            logger.info(
              'Duplicate webhook event delivery for already PROCESSED event (idempotent)',
              { event: 'webhook.duplicate', eventId, eventType }
            );
            return {
              status: 'ignored_duplicate',
              eventId,
              details: { message: 'Event already processed.' },
            };
          }

          if (
            existingEvent.processing_status === EVENT_PROCESSING_STATUS.REQUIRES_REFUND
          ) {
            logger.info(
              'Duplicate webhook event delivery for REQUIRES_REFUND event',
              { event: 'webhook.duplicate', eventId, eventType }
            );
            return {
              status: 'requires_refund',
              eventId,
              details: { message: 'Event marked for refund reconciliation.' },
            };
          }

          if (
            existingEvent.processing_status === EVENT_PROCESSING_STATUS.IGNORED_DUPLICATE
          ) {
            return {
              status: 'ignored_duplicate',
              eventId,
              details: { message: 'Duplicate event ignored.' },
            };
          }

          // Recover and re-process previously failed or incomplete event
          logger.info(
            'Recovering and retrying incomplete or failed PaymentEvent',
            {
              event: 'webhook.processing.started',
              eventId,
              previousStatus: existingEvent.processing_status,
            }
          );
          paymentEvent = existingEvent;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    logger.info('Webhook processing started', {
      event: 'webhook.processing.started',
      eventId,
      eventType,
    });

    // ----------------------------------------------------
    // STEP 4: Event Dispatch & Processing
    // ----------------------------------------------------
    if (eventType !== WEBHOOK_EVENT_TYPES.PAYMENT_CAPTURED) {
      logger.info('Unhandled Razorpay webhook event type received', {
        eventId,
        eventType,
      });

      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.PROCESSED,
        {
          metadataJson: {
            unhandled_event: true,
            event_type: eventType,
          },
        }
      );

      return {
        status: 'ignored_unhandled_event',
        eventId,
        details: { eventType },
      };
    }

    // ----------------------------------------------------
    // STEP 5: Process Authoritative `payment.captured`
    // ----------------------------------------------------
    return this.processPaymentCaptured({ paymentEvent, payload });
  },

  /**
   * Authoritative handler for `payment.captured` webhook events.
   *
   * @param {{
   *   paymentEvent: import('../../models/PaymentEvent.js').PaymentEvent,
   *   payload: Record<string, any>
   * }} params
   */
  async processPaymentCaptured({ paymentEvent, payload }) {
    const eventId = paymentEvent.event_id;
    const paymentEntity = payload?.payload?.payment?.entity;

    if (!paymentEntity || typeof paymentEntity !== 'object') {
      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.FAILED,
        {
          metadataJson: { error: 'Missing payment entity in payload.' },
        }
      );
      throw new WebhookPayloadValidationError(
        'Missing payment entity in webhook payload.'
      );
    }

    const razorpayPaymentId = paymentEntity.id;
    const razorpayOrderId = paymentEntity.order_id;
    const gatewayAmount = paymentEntity.amount;
    const gatewayCurrency = paymentEntity.currency;

    if (!razorpayPaymentId || typeof razorpayPaymentId !== 'string') {
      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.FAILED,
        {
          metadataJson: { error: 'Missing razorpay payment ID.' },
        }
      );
      throw new WebhookPayloadValidationError(
        'Missing razorpay payment ID in payment entity.'
      );
    }

    if (!razorpayOrderId || typeof razorpayOrderId !== 'string') {
      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.FAILED,
        {
          metadataJson: { error: 'Missing razorpay order ID.' },
        }
      );
      throw new WebhookPayloadValidationError(
        'Missing razorpay order ID in payment entity.'
      );
    }

    // Currency verification (Nexora is strictly INR-only)
    if (gatewayCurrency !== PAYMENT_CURRENCY) {
      logger.warn('Webhook payment currency mismatch', {
        eventId,
        gatewayCurrency,
        expected: PAYMENT_CURRENCY,
      });

      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.FAILED,
        {
          metadataJson: { error: `Invalid currency: ${gatewayCurrency}` },
        }
      );

      throw new PaymentVerificationError(
        `Invalid currency '${gatewayCurrency}'. Expected '${PAYMENT_CURRENCY}'.`
      );
    }

    // Locate matching PaymentAttempt
    const paymentAttempt =
      await paymentRepository.findByRazorpayOrderId(razorpayOrderId);

    if (!paymentAttempt) {
      logger.warn('No matching PaymentAttempt found for Razorpay order ID', {
        eventId,
        razorpayOrderId,
      });

      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.FAILED,
        {
          metadataJson: {
            error: 'PaymentAttempt not found for razorpay_order_id',
            razorpayOrderId,
          },
        }
      );

      throw new PaymentAttemptNotFoundError(
        'No matching payment attempt found for the given gateway order ID.'
      );
    }

    // Associate PaymentEvent with Order and PaymentAttempt
    await paymentEventRepository.updateStatus(
      paymentEvent.id,
      EVENT_PROCESSING_STATUS.PROCESSING,
      {
        orderId: paymentAttempt.order_id,
        paymentAttemptId: paymentAttempt.id,
      }
    );

    // ----------------------------------------------------
    // STEP 6: Transactional Order State Evaluation & Settlement
    // ----------------------------------------------------
    try {
      const settlementResult = await sequelize.transaction(async (tx) => {
        // Lock Order FOR UPDATE
        const order = await Order.findByPk(paymentAttempt.order_id, {
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });

        if (!order) {
          throw new PaymentVerificationError('Associated order was not found.');
        }

        // Lock PaymentAttempt FOR UPDATE
        const lockedAttempt = await paymentRepository.findPaymentAttemptById(
          paymentAttempt.id,
          {
            transaction: tx,
            lock: true,
          }
        );

        // Amount verification against server-authoritative order total
        if (Number(gatewayAmount) !== Number(order.total_cost_paise)) {
          logger.error('Webhook gateway amount mismatch with server order', {
            orderId: order.id,
            serverPaise: order.total_cost_paise,
            gatewayAmount,
          });

          throw new PaymentVerificationError(
            'Payment amount does not match server-authoritative order total.'
          );
        }

        // ----------------------------------------------------
        // Scenario A: Order is already PAID (Idempotent Settlement)
        // ----------------------------------------------------
        if (order.order_status === 'PAID') {
          logger.info('Webhook received for already PAID order (idempotent)', {
            orderId: order.id,
            paymentAttemptId: lockedAttempt.id,
          });

          // Ensure PaymentAttempt records success if not already done
          if (lockedAttempt.status !== PAYMENT_STATUS.SUCCESS) {
            await paymentRepository.markAttemptSuccess(
              lockedAttempt.id,
              razorpayPaymentId,
              { transaction: tx }
            );
          }

          await paymentEventRepository.updateStatus(
            paymentEvent.id,
            EVENT_PROCESSING_STATUS.PROCESSED,
            {
              metadataJson: {
                settled_previously: true,
                razorpay_payment_id: razorpayPaymentId,
              },
              transaction: tx,
            }
          );

          return {
            status: 'processed',
            idempotent: true,
            orderId: order.id,
            paymentAttemptId: lockedAttempt.id,
          };
        }

        // ----------------------------------------------------
        // Scenario B: Late Payment Capture on Expired Order / Reservation
        // ----------------------------------------------------
        let isExpired = order.order_status === 'EXPIRED';

        if (!isExpired) {
          const expiryCheckRows = await sequelize.query(
            `SELECT (expires_at <= CURRENT_TIMESTAMP) AS is_expired
             FROM inventory_reservations
             WHERE order_id = :orderId AND status = 'ACTIVE'
             LIMIT 1`,
            {
              replacements: { orderId: order.id },
              type: QueryTypes.SELECT,
              transaction: tx,
            }
          );

          if (!expiryCheckRows[0] || expiryCheckRows[0].is_expired) {
            isExpired = true;
          }
        }

        if (isExpired) {
          logger.warn(
            'Late captured payment on expired order. Flagging REQUIRES_REFUND without mutating inventory.',
            {
              event: 'webhook.requires_refund',
              eventId,
              orderId: order.id,
              paymentAttemptId: lockedAttempt.id,
              razorpayPaymentId,
            }
          );

          // Truthfully record financial capture success on the PaymentAttempt
          await paymentRepository.markAttemptSuccess(
            lockedAttempt.id,
            razorpayPaymentId,
            { transaction: tx }
          );

          // Ensure Order remains/becomes EXPIRED (never convert to PAID!)
          if (order.order_status !== 'EXPIRED') {
            await order.update(
              {
                order_status: 'EXPIRED',
                updated_at: new Date(),
              },
              { transaction: tx }
            );
          }

          // Flag PaymentEvent as REQUIRES_REFUND
          await paymentEventRepository.updateStatus(
            paymentEvent.id,
            EVENT_PROCESSING_STATUS.REQUIRES_REFUND,
            {
              metadataJson: {
                late_capture: true,
                razorpay_payment_id: razorpayPaymentId,
                amount_paise: gatewayAmount,
                reason: 'Order or inventory reservation expired before payment capture',
              },
              transaction: tx,
            }
          );

          return {
            status: 'requires_refund',
            lateCapture: true,
            orderId: order.id,
            paymentAttemptId: lockedAttempt.id,
          };
        }

        // ----------------------------------------------------
        // Scenario C: Normal Active Capture Settlement
        // ----------------------------------------------------
        // Delegate to existing, shared domain settlement operation
        await paymentService.settleCapturedPayment({
          orderId: order.id,
          paymentAttemptId: lockedAttempt.id,
          razorpayOrderId,
          razorpayPaymentId,
          transaction: tx,
        });

        // Mark PaymentEvent as PROCESSED
        await paymentEventRepository.updateStatus(
          paymentEvent.id,
          EVENT_PROCESSING_STATUS.PROCESSED,
          {
            metadataJson: {
              settled: true,
              razorpay_payment_id: razorpayPaymentId,
            },
            transaction: tx,
          }
        );

        return {
          status: 'processed',
          settled: true,
          orderId: order.id,
          paymentAttemptId: lockedAttempt.id,
        };
      });

      return {
        status: settlementResult.status,
        eventId,
        details: settlementResult,
      };
    } catch (settlementErr) {
      logger.error('Error during transactional webhook settlement', {
        event: 'webhook.processing.failed',
        eventId,
        error: settlementErr.message,
      });

      if (
        settlementErr instanceof PaymentVerificationError &&
        settlementErr.message.includes('amount')
      ) {
        await paymentRepository.markAttemptFailed(
          paymentAttempt.id,
          PAYMENT_FAILURE_REASON.AMOUNT_OR_CURRENCY_MISMATCH
        );
      }

      // Update event status to FAILED outside transaction if still in PROCESSING
      await paymentEventRepository.updateStatus(
        paymentEvent.id,
        EVENT_PROCESSING_STATUS.FAILED,
        {
          metadataJson: { error: settlementErr.message },
        }
      );

      throw settlementErr;
    }
  },
};

export default webhookService;
