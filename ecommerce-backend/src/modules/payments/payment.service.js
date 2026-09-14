import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { Order } from '../../models/Order.js';
import { InventoryReservation } from '../../models/InventoryReservation.js';
import { orderRepository } from '../orders/order.repository.js';
import { OrderNotFoundError } from '../orders/order.errors.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { idempotencyRepository } from '../idempotency/idempotency.repository.js';
import { paymentRepository } from './payment.repository.js';
import { razorpayGateway } from './razorpay.gateway.js';
import {
  PAYMENT_STATUS,
  PAYMENT_CURRENCY,
  PAYMENT_FAILURE_REASON,
} from './payment.constants.js';
import {
  PaymentAttemptNotFoundError,
  OrderNotPayableError,
  PaymentVerificationError,
  InvalidPaymentSignatureError,
  RazorpayGatewayError,
} from './payment.errors.js';
import {
  toPaymentInitiationDTO,
  toPaymentVerificationDTO,
} from './payment.dto.js';
import { verifyGuestToken, isGuestTokenExpired } from '../orders/guestToken.js';

export const paymentService = {
  /**
   * Initiate a new PaymentAttempt for an existing PENDING_PAYMENT order.
   * Transaction Boundary:
   *   1. DB Transaction: Lock Order -> Validate eligibility & reservation -> Insert PaymentAttempt (INITIATED) -> Commit.
   *   2. Gateway Call: External HTTP call to Razorpay (strictly AFTER commit).
   *   3. Gateway Result: Conditionally update PaymentAttempt with razorpay_order_id, or mark FAILED on gateway error.
   *
   * @param {{
   *   orderId: string,
   *   userId?: string,
   *   role?: string,
   *   guestToken?: string,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} params
   * @returns {Promise<ReturnType<typeof toPaymentInitiationDTO>>}
   */
  async initiatePayment({ orderId, userId, role, guestToken, idempotencyRecord }) {
    if (!orderId) {
      throw new PaymentVerificationError('Order ID is required to initiate payment.');
    }

    // ----------------------------------------------------
    // PHASE A: Database Transaction (Strictly BEFORE Gateway)
    // ----------------------------------------------------
    let createdAttemptId;
    let orderTotalPaise;
    let existingAttemptToReuse;

    await sequelize.transaction(async (tx) => {
      // 1. Lock Order row FOR UPDATE
      const order = await orderRepository.findOrderById(orderId, {
        transaction: tx,
        lock: true,
      });

      if (!order) {
        throw new OrderNotFoundError('Order was not found.');
      }

      // 2. Anti-IDOR: Strict authorization chain
      if (guestToken && typeof guestToken === 'string' && guestToken.trim() !== '') {
        if (order.user_id !== null || !order.guest_token_hash) {
          throw new OrderNotFoundError('Order was not found.');
        }
        const isValidToken = verifyGuestToken(guestToken, order.guest_token_hash);
        if (!isValidToken || isGuestTokenExpired(order.created_at)) {
          throw new OrderNotFoundError('Order was not found.');
        }
      } else if (userId) {
        if (String(role || '').toLowerCase() !== 'admin' && order.user_id !== userId) {
          throw new OrderNotFoundError('Order was not found.');
        }
      } else {
        throw new OrderNotFoundError('Order was not found.');
      }

      // 3. Verify Order status is PENDING_PAYMENT
      if (order.order_status !== 'PENDING_PAYMENT') {
        throw new OrderNotPayableError(
          `Order with status '${order.order_status}' cannot be paid.`
        );
      }

      // 4. Verify no successful payment attempt exists for this order
      const existingSuccess = await paymentRepository.getSuccessAttemptForOrder(orderId, {
        transaction: tx,
      });
      if (existingSuccess) {
        throw new OrderNotPayableError('Order is already paid.');
      }

      // 5. Verify authoritative inventory reservation is ACTIVE and unexpired
      const activeReservations = await InventoryReservation.findAll({
        where: {
          order_id: orderId,
          status: 'ACTIVE',
        },
        transaction: tx,
      });

      if (!activeReservations || activeReservations.length === 0) {
        throw new OrderNotPayableError(
          'No active inventory reservation found for this order. Payment cannot proceed.'
        );
      }

      // PostgreSQL-authoritative expiration check
      const expiryCheckRows = await sequelize.query(
        `SELECT (expires_at <= CURRENT_TIMESTAMP) AS is_expired
         FROM inventory_reservations
         WHERE order_id = :orderId AND status = 'ACTIVE'
         LIMIT 1`,
        {
          replacements: { orderId },
          type: QueryTypes.SELECT,
          transaction: tx,
        }
      );

      if (expiryCheckRows[0]?.is_expired) {
        throw new OrderNotPayableError(
          'Inventory reservation for this order has expired. Please place a new order.'
        );
      }

      // If idempotency record is already linked to an existing attempt with razorpay_order_id, reuse it!
      if (idempotencyRecord?.payment_attempt_id) {
        const linkedAttempt = await paymentRepository.findPaymentAttemptById(
          idempotencyRecord.payment_attempt_id,
          { transaction: tx, lock: true }
        );
        if (linkedAttempt && linkedAttempt.razorpay_order_id) {
          existingAttemptToReuse = linkedAttempt;
          return;
        }
      }

      // 6. Deterministically calculate next attempt number under Order lock
      const maxAttempt = await paymentRepository.getMaxAttemptNumber(orderId, {
        transaction: tx,
      });
      const nextAttemptNumber = maxAttempt + 1;

      // 7. Derive authoritative payment amount exclusively from server-side order
      orderTotalPaise = Number(order.total_cost_paise);
      if (!orderTotalPaise || orderTotalPaise <= 0) {
        throw new OrderNotPayableError('Order total must be a positive integer.');
      }

      // 8. Insert new PaymentAttempt record in INITIATED status
      const paymentAttempt = await paymentRepository.createPaymentAttempt(
        {
          order_id: orderId,
          attempt_number: nextAttemptNumber,
          amount_paise: orderTotalPaise,
          status: PAYMENT_STATUS.INITIATED,
        },
        { transaction: tx }
      );

      createdAttemptId = paymentAttempt.id;

      logger.info('PaymentAttempt created', {
        event: 'payment.attempt.created',
        orderId,
        paymentAttemptId: createdAttemptId,
        amountPaise: orderTotalPaise,
      });

      // Link intermediate entity references to IdempotencyRecord inside Phase A transaction
      if (idempotencyRecord) {
        await idempotencyRepository.linkEntities(
          idempotencyRecord.id,
          { orderId, paymentAttemptId: createdAttemptId },
          { transaction: tx }
        );
      }
    });

    // If an existing attempt was deterministically recovered
    if (existingAttemptToReuse) {
      const recoveredDTO = toPaymentInitiationDTO(existingAttemptToReuse, config.RAZORPAY_KEY_ID);
      if (idempotencyRecord) {
        await idempotencyRepository.completeRecord(idempotencyRecord.id, {
          responseCode: 201,
          responseBody: {
            success: true,
            data: recoveredDTO,
            meta: {
              timestamp: new Date().toISOString(),
            },
          },
          orderId,
          paymentAttemptId: existingAttemptToReuse.id,
        });
      }
      return recoveredDTO;
    }

    // ----------------------------------------------------
    // PHASE B: External Gateway Call (Strictly AFTER Commit)
    // ----------------------------------------------------
    let rzpOrder;
    try {
      const receiptRef = `rcpt_${createdAttemptId.replace(/-/g, '').slice(0, 20)}`;
      rzpOrder = await razorpayGateway.createOrder({
        amountPaise: orderTotalPaise,
        currency: PAYMENT_CURRENCY,
        receipt: receiptRef,
        notes: {
          orderId,
          paymentAttemptId: createdAttemptId,
        },
      });

      logger.info('Razorpay order created for payment attempt', {
        event: 'payment.gateway.order.created',
        orderId,
        paymentAttemptId: createdAttemptId,
        razorpayOrderId: rzpOrder.id,
      });
    } catch (gatewayErr) {
      logger.error('Razorpay order creation failed after DB commit. Marking attempt FAILED.', {
        event: 'payment.gateway.failed',
        paymentAttemptId: createdAttemptId,
        orderId,
        error: gatewayErr.message,
      });

      // Mark the PaymentAttempt as FAILED; Order remains PENDING_PAYMENT and stock is untouched
      await paymentRepository.markAttemptFailed(
        createdAttemptId,
        PAYMENT_FAILURE_REASON.GATEWAY_ERROR
      );

      if (idempotencyRecord) {
        try {
          await idempotencyRepository.markFailedRetryable(idempotencyRecord.id);
        } catch {
          // ignore cleanup errors
        }
      }

      throw new RazorpayGatewayError(
        'Failed to initialize payment gateway order.',
        { originalError: gatewayErr.message }
      );
    }

    // ----------------------------------------------------
    // PHASE C: Conditionally Persist Razorpay Order ID
    // ----------------------------------------------------
    const affectedCount = await paymentRepository.updateRazorpayOrderIdConditionally(
      createdAttemptId,
      rzpOrder.id
    );

    if (affectedCount === 0) {
      logger.warn(
        'PaymentAttempt was not in expected INITIATED/null-order state during gateway order persistence',
        { paymentAttemptId: createdAttemptId, rzpOrderId: rzpOrder.id }
      );
    }

    const updatedAttempt = await paymentRepository.findPaymentAttemptById(createdAttemptId);
    const initiationDTO = toPaymentInitiationDTO(updatedAttempt, config.RAZORPAY_KEY_ID);

    if (idempotencyRecord) {
      await idempotencyRepository.completeRecord(idempotencyRecord.id, {
        responseCode: 201,
        responseBody: {
          success: true,
          data: initiationDTO,
          meta: {
            timestamp: new Date().toISOString(),
          },
        },
        orderId,
        paymentAttemptId: createdAttemptId,
      });
    }

    return initiationDTO;
  },


  /**
   * Retry payment on an existing PENDING_PAYMENT order.
   * Concurrency-safe: Locks order, validates reservation, increments attempt_number,
   * creates new PaymentAttempt and generates new Razorpay Order without creating a duplicate ecommerce Order.
   *
   * @param {{
   *   orderId: string,
   *   userId?: string,
   *   role?: string,
   *   guestToken?: string,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} params
   * @returns {Promise<ReturnType<typeof toPaymentInitiationDTO>>}
   */
  async retryPayment({ orderId, userId, role, guestToken, idempotencyRecord }) {
    return this.initiatePayment({ orderId, userId, role, guestToken, idempotencyRecord });
  },

  /**
   * Shared atomic settlement domain operation.
   * Reusable by:
   *   1. Phase 07.8 Backend Payment Verification (POST /api/payments/verify)
   *   2. Phase 07.9 Authoritative Webhook Capture (POST /api/webhooks/razorpay)
   *
   * Performs the atomic business state transition:
   *   - PaymentAttempt -> SUCCESS (storing razorpay_payment_id)
   *   - Order -> PAID
   *   - InventoryReservations -> CONVERTED (via Phase 07.6 inventoryService.convertReservation)
   *   - Stock permanently deducted
   *
   * Idempotent: If Order is already PAID or PaymentAttempt is already SUCCESS, safely returns without double deduction.
   *
   * @param {{
   *   orderId: string,
   *   paymentAttemptId?: string,
   *   razorpayOrderId?: string,
   *   razorpayPaymentId: string,
   *   transaction?: import('sequelize').Transaction,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} params
   * @returns {Promise<{ settled: boolean, order: Order, paymentAttempt: PaymentAttempt }>}
   */
  async settleCapturedPayment({
    orderId,
    paymentAttemptId,
    razorpayOrderId,
    razorpayPaymentId,
    transaction: externalTx,
    idempotencyRecord,
  }) {
    const executeSettlement = async (tx) => {
      // 1. Lock Order row FOR UPDATE
      const order = await Order.findByPk(orderId, {
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (!order) {
        throw new OrderNotFoundError('Order was not found.');
      }

      // 2. Resolve and Lock PaymentAttempt row FOR UPDATE
      let paymentAttempt;
      if (paymentAttemptId) {
        paymentAttempt = await paymentRepository.findPaymentAttemptById(paymentAttemptId, {
          transaction: tx,
          lock: true,
        });
      } else if (razorpayOrderId) {
        paymentAttempt = await paymentRepository.findByRazorpayOrderId(razorpayOrderId, {
          transaction: tx,
          lock: true,
        });
      }

      if (!paymentAttempt) {
        throw new PaymentAttemptNotFoundError('Payment attempt was not found.');
      }

      // 3. Idempotency Check: If Order is already PAID and PaymentAttempt is already SUCCESS, return gracefully
      if (order.order_status === 'PAID' && paymentAttempt.status === PAYMENT_STATUS.SUCCESS) {
        logger.info('Order and PaymentAttempt already settled (idempotent)', {
          event: 'payment.settlement.already_processed',
          orderId: order.id,
          paymentAttemptId: paymentAttempt.id,
        });

        if (idempotencyRecord) {
          const verificationDTO = toPaymentVerificationDTO(order, paymentAttempt);
          await idempotencyRepository.completeRecord(
            idempotencyRecord.id,
            {
              responseCode: 200,
              responseBody: {
                success: true,
                data: verificationDTO,
                meta: {
                  timestamp: new Date().toISOString(),
                },
              },
              orderId: order.id,
              paymentAttemptId: paymentAttempt.id,
            },
            { transaction: tx }
          );
        }

        return { settled: true, order, paymentAttempt };
      }

      // 4. Invariant: If Order is already PAID by another attempt, reject duplicate success
      if (order.order_status === 'PAID' && paymentAttempt.status !== PAYMENT_STATUS.SUCCESS) {
        logger.warn('Order is already PAID by a different payment attempt', {
          orderId: order.id,
          paymentAttemptId: paymentAttempt.id,
        });
        return { settled: true, order, paymentAttempt };
      }

      // 5. Invariant: Order must be PENDING_PAYMENT to transition to PAID
      if (order.order_status !== 'PENDING_PAYMENT') {
        throw new OrderNotPayableError(
          `Order is in status '${order.order_status}' and cannot be settled to PAID.`
        );
      }

      // 6. Validate PaymentAttempt amount matches Order total
      if (Number(paymentAttempt.amount_paise) !== Number(order.total_cost_paise)) {
        await paymentRepository.markAttemptFailed(
          paymentAttempt.id,
          PAYMENT_FAILURE_REASON.AMOUNT_OR_CURRENCY_MISMATCH,
          { transaction: tx }
        );
        throw new PaymentVerificationError(
          'Payment attempt amount does not match server-authoritative order total.'
        );
      }

      // 7. Transition PaymentAttempt -> SUCCESS with razorpay_payment_id
      await paymentRepository.markAttemptSuccess(paymentAttempt.id, razorpayPaymentId, {
        transaction: tx,
      });

      // 8. Transition Order -> PAID
      await order.update(
        {
          order_status: 'PAID',
          updated_at: new Date(),
        },
        { transaction: tx }
      );

      // 9. Convert Inventory Reservations via Phase 07.6 authoritative inventory service
      const activeReservations = await InventoryReservation.findAll({
        where: {
          order_id: order.id,
          status: 'ACTIVE',
        },
        transaction: tx,
      });

      for (const res of activeReservations) {
        await inventoryService.convertReservation(res.id, {
          transaction: tx,
        });
      }

      await order.reload({ transaction: tx });
      await paymentAttempt.reload({ transaction: tx });

      // 10. Transactionally complete IdempotencyRecord inside same settlement tx
      if (idempotencyRecord) {
        const verificationDTO = toPaymentVerificationDTO(order, paymentAttempt);
        await idempotencyRepository.completeRecord(
          idempotencyRecord.id,
          {
            responseCode: 200,
            responseBody: {
              success: true,
              data: verificationDTO,
              meta: {
                timestamp: new Date().toISOString(),
              },
            },
            orderId: order.id,
            paymentAttemptId: paymentAttempt.id,
          },
          { transaction: tx }
        );
      }

      logger.info('Payment settlement completed successfully', {
        event: 'payment.settlement.completed',
        orderId: order.id,
        paymentAttemptId: paymentAttempt.id,
        razorpayPaymentId,
        orderStatus: order.order_status,
        paymentStatus: paymentAttempt.status,
      });

      return { settled: true, order, paymentAttempt };
    };

    if (externalTx) {
      return executeSettlement(externalTx);
    }
    return sequelize.transaction(executeSettlement);
  },

  /**
   * Verify frontend checkout payment result and reconcile capture.
   * Enforces:
   *   1. Ownership & Anti-IDOR (Order must belong to authenticated customer).
   *   2. PaymentAttempt association with order and razorpayOrderId.
   *   3. In-memory timing-safe HMAC-SHA256 signature verification.
   *   4. Server-to-server gateway fetch to assert payment is captured and parameters match.
   *   5. Shared atomic settlement execution.
   *
   * @param {{
   *   orderId: string,
   *   razorpayOrderId: string,
   *   razorpayPaymentId: string,
   *   razorpaySignature: string,
   *   userId?: string,
   *   role?: string,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} params
   * @returns {Promise<ReturnType<typeof toPaymentVerificationDTO>>}
   */
  async verifyPayment({
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    userId,
    role,
    guestToken,
    idempotencyRecord,
  }) {
    // 1. Ownership & Anti-IDOR verification
    const order = await orderRepository.findOrderById(orderId);
    if (!order) {
      throw new OrderNotFoundError('Order was not found.');
    }

    if (guestToken && typeof guestToken === 'string' && guestToken.trim() !== '') {
      if (order.user_id !== null || !order.guest_token_hash) {
        throw new OrderNotFoundError('Order was not found.');
      }
      const isValidToken = verifyGuestToken(guestToken, order.guest_token_hash);
      if (!isValidToken || isGuestTokenExpired(order.created_at)) {
        throw new OrderNotFoundError('Order was not found.');
      }
    } else if (userId) {
      if (String(role || '').toLowerCase() !== 'admin' && order.user_id !== userId) {
        throw new OrderNotFoundError('Order was not found.');
      }
    } else {
      throw new OrderNotFoundError('Order was not found.');
    }

    // 2. Resolve PaymentAttempt
    const paymentAttempt = await paymentRepository.findByRazorpayOrderId(razorpayOrderId);
    if (!paymentAttempt || paymentAttempt.order_id !== orderId) {
      throw new PaymentAttemptNotFoundError(
        'No matching payment attempt found for this order and gateway order ID.'
      );
    }

    // 3. Timing-safe HMAC-SHA256 signature verification
    logger.info('Starting payment verification', {
      event: 'payment.verification.started',
      orderId,
      paymentAttemptId: paymentAttempt.id,
      razorpayOrderId,
      razorpayPaymentId,
    });

    const isSignatureValid = razorpayGateway.verifySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isSignatureValid) {
      logger.warn('Payment signature verification failed', {
        event: 'payment.signature.invalid',
        orderId,
        paymentAttemptId: paymentAttempt.id,
        razorpayOrderId,
      });

      await paymentRepository.markAttemptFailed(
        paymentAttempt.id,
        PAYMENT_FAILURE_REASON.INVALID_SIGNATURE
      );

      throw new InvalidPaymentSignatureError('Invalid Razorpay payment signature.');
    }

    // 4. Server-to-server verification with Razorpay Gateway
    const paymentDetails = await razorpayGateway.fetchPayment(razorpayPaymentId);

    // Verify gateway payment belongs to expected Razorpay order
    if (paymentDetails.order_id !== razorpayOrderId) {
      logger.warn('Razorpay payment order_id mismatch', {
        expected: razorpayOrderId,
        received: paymentDetails.order_id,
      });
      await paymentRepository.markAttemptFailed(
        paymentAttempt.id,
        PAYMENT_FAILURE_REASON.ORDER_MISMATCH
      );
      throw new PaymentVerificationError(
        'Payment details do not match the expected gateway order.'
      );
    }

    // Verify amount & currency match server-authoritative order
    if (
      Number(paymentDetails.amount) !== Number(order.total_cost_paise) ||
      paymentDetails.currency !== PAYMENT_CURRENCY
    ) {
      logger.warn('Razorpay payment amount or currency mismatch', {
        orderTotal: order.total_cost_paise,
        gatewayAmount: paymentDetails.amount,
        currency: paymentDetails.currency,
      });
      await paymentRepository.markAttemptFailed(
        paymentAttempt.id,
        PAYMENT_FAILURE_REASON.AMOUNT_OR_CURRENCY_MISMATCH
      );
      throw new PaymentVerificationError(
        'Payment amount or currency mismatch with server order.'
      );
    }

    // Verify payment is captured on gateway
    const isCaptured =
      paymentDetails.status === 'captured' || paymentDetails.captured === true;
    if (!isCaptured) {
      logger.warn('Razorpay payment is not in captured status', {
        event: 'payment.verification.failed',
        orderId,
        paymentAttemptId: paymentAttempt.id,
        status: paymentDetails.status,
      });
      await paymentRepository.markAttemptFailed(
        paymentAttempt.id,
        PAYMENT_FAILURE_REASON.NOT_CAPTURED
      );
      throw new PaymentVerificationError(
        `Payment is not captured. Current gateway status: ${paymentDetails.status}`
      );
    }

    logger.info('Gateway payment capture confirmed', {
      event: 'payment.capture.confirmed',
      orderId,
      paymentAttemptId: paymentAttempt.id,
      razorpayOrderId,
      razorpayPaymentId,
    });

    // 5. Execute shared atomic domain settlement
    const { order: settledOrder, paymentAttempt: settledAttempt } =
      await this.settleCapturedPayment({
        orderId: order.id,
        paymentAttemptId: paymentAttempt.id,
        razorpayPaymentId,
        razorpayOrderId,
        idempotencyRecord,
      });

    return toPaymentVerificationDTO(settledOrder, settledAttempt);
  },
};

export default paymentService;

