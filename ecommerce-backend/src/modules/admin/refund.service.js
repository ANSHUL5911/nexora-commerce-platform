import { sequelize } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { Order } from '../../models/Order.js';
import { PaymentAttempt } from '../../models/PaymentAttempt.js';
import { AuditLog } from '../../models/AuditLog.js';
import { OrderNotFoundError } from '../orders/order.errors.js';
import { paymentRepository } from '../payments/payment.repository.js';
import { razorpayGateway } from '../payments/razorpay.gateway.js';
import { idempotencyRepository } from '../idempotency/idempotency.repository.js';
import {
  OrderNotRefundableError,
  NoSettledPaymentError,
} from './admin.errors.js';
import { toRefundResponseDTO } from './admin.dto.js';

export const refundService = {
  /**
   * Process an administrative full refund for a settled order.
   *
   * Architectural Flow:
   *   PHASE A (Pre-flight DB Transaction):
   *     - Lock Order and PaymentAttempt FOR UPDATE.
   *     - If already REFUNDED, return cached idempotent result without calling Razorpay.
   *     - Validate order status is PAID and PaymentAttempt status is SUCCESS.
   *     - Transition PaymentAttempt and Order status to REFUNDED to prevent race conditions.
   *     - Commit Phase A.
   *
   *   PHASE B (External Gateway Execution):
   *     - Issue refund via RazorpayGateway outside DB transaction.
   *     - On explicit gateway failure, rollback local state to PAID / SUCCESS.
   *
   *   PHASE C (Reconciliation & Audit DB Transaction):
   *     - Persist razorpay_refund_id on PaymentAttempt.
   *     - Create AuditLog record.
   *     - Complete IdempotencyRecord inside settlement transaction.
   *
   *   INVARIANT: Zero modification to Product.stock_quantity or reserved_quantity (REFUND != RESTOCK).
   *
   * @param {{
   *   orderId: string,
   *   adminId: string,
   *   reason?: string,
   *   ipAddress?: string,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} params
   * @returns {Promise<ReturnType<typeof toRefundResponseDTO>>}
   */
  async refundOrder({ orderId, adminId, reason, ipAddress, idempotencyRecord }) {
    if (!orderId) {
      throw new OrderNotFoundError('Order was not found.');
    }

    // ----------------------------------------------------
    // PHASE A: Database Transaction (Lock, Validate & Prepare)
    // ----------------------------------------------------
    let settledAttempt;
    let refundAmountPaise;
    let alreadyRefundedResult = null;

    await sequelize.transaction(async (tx) => {
      // 1. Lock Order row FOR UPDATE
      const order = await Order.findByPk(orderId, {
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (!order) {
        throw new OrderNotFoundError('Order was not found.');
      }

      // 2. Query PaymentAttempts for this order under transaction lock
      const paymentAttempts = await PaymentAttempt.findAll({
        where: { order_id: orderId },
        order: [['attempt_number', 'DESC']],
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      // Check if already refunded (Idempotent return)
      const alreadyRefundedAttempt = paymentAttempts.find((pa) => pa.status === 'REFUNDED');
      if (order.order_status === 'REFUNDED' || alreadyRefundedAttempt) {
        const activeAttempt = alreadyRefundedAttempt || paymentAttempts[0];
        alreadyRefundedResult = toRefundResponseDTO(order, activeAttempt, {
          alreadyRefunded: true,
          refundId: activeAttempt?.razorpay_refund_id,
        });
        return;
      }

      // 3. Verify order status eligibility
      const eligibleStatuses = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
      if (!eligibleStatuses.includes(order.order_status)) {
        throw new OrderNotRefundableError(
          `Order with status '${order.order_status}' cannot be refunded. Only settled orders can be refunded.`
        );
      }

      // 4. Locate settled (SUCCESS) PaymentAttempt
      settledAttempt = paymentAttempts.find((pa) => pa.status === 'SUCCESS');
      if (!settledAttempt) {
        throw new NoSettledPaymentError(
          'No settled payment attempt found for this order. Unpaid or failed orders cannot be refunded.'
        );
      }

      if (!settledAttempt.razorpay_payment_id) {
        throw new NoSettledPaymentError(
          'Payment attempt lacks gateway payment reference and cannot be refunded.'
        );
      }

      refundAmountPaise = Number(settledAttempt.amount_paise);
      if (!refundAmountPaise || refundAmountPaise <= 0) {
        throw new OrderNotRefundableError('Refund amount must be a positive integer in paise.');
      }

      // 5. Pre-transition state to REFUNDED to prevent concurrent gateway double-refunds
      await settledAttempt.update(
        {
          status: 'REFUNDED',
          updated_at: new Date(),
        },
        { transaction: tx }
      );

      await order.update(
        {
          order_status: 'REFUNDED',
          updated_at: new Date(),
        },
        { transaction: tx }
      );
    });

    if (alreadyRefundedResult) {
      if (idempotencyRecord) {
        await idempotencyRepository.completeRecord(idempotencyRecord.id, {
          responseCode: 200,
          responseBody: {
            success: true,
            data: alreadyRefundedResult,
            meta: {
              timestamp: new Date().toISOString(),
            },
          },
          orderId,
        });
      }
      return alreadyRefundedResult;
    }

    // ----------------------------------------------------
    // PHASE B: External Gateway Call (Strictly Outside DB Transaction)
    // ----------------------------------------------------
    let rzpRefund;
    try {
      logger.info('Calling Razorpay refund API for settled payment attempt', {
        event: 'admin.refund.requested',
        orderId,
        paymentAttemptId: settledAttempt.id,
        paymentId: settledAttempt.razorpay_payment_id,
        amountPaise: refundAmountPaise,
        adminId,
      });

      rzpRefund = await razorpayGateway.refundPayment({
        paymentId: settledAttempt.razorpay_payment_id,
        amountPaise: refundAmountPaise,
        notes: {
          orderId,
          paymentAttemptId: settledAttempt.id,
          initiatedBy: adminId,
          reason: reason || 'Admin full refund',
        },
      });
    } catch (gatewayErr) {
      logger.error('External Razorpay refund failed. Rolling back local refund state.', {
        event: 'admin.refund.failed',
        orderId,
        paymentAttemptId: settledAttempt.id,
        error: gatewayErr.message,
      });

      // Rollback local state to PAID / SUCCESS on explicit gateway rejection
      await sequelize.transaction(async (rollbackTx) => {
        await PaymentAttempt.update(
          { status: 'SUCCESS', updated_at: new Date() },
          { where: { id: settledAttempt.id }, transaction: rollbackTx }
        );
        await Order.update(
          { order_status: 'PAID', updated_at: new Date() },
          { where: { id: orderId }, transaction: rollbackTx }
        );
      });

      if (idempotencyRecord) {
        try {
          await idempotencyRepository.markFailedRetryable(idempotencyRecord.id);
        } catch {
          // ignore cleanup errors
        }
      }

      throw gatewayErr;
    }

    // ----------------------------------------------------
    // PHASE C: Database Finalization (Persist Refund ID, AuditLog, Idempotency)
    // ----------------------------------------------------
    let finalOrder;
    let finalAttempt;

    await sequelize.transaction(async (tx) => {
      finalOrder = await Order.findByPk(orderId, {
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      finalAttempt = await paymentRepository.findPaymentAttemptById(settledAttempt.id, {
        transaction: tx,
        lock: true,
      });

      await finalAttempt.update(
        {
          razorpay_refund_id: rzpRefund.id,
          updated_at: new Date(),
        },
        { transaction: tx }
      );

      // Create AuditLog record
      await AuditLog.create(
        {
          actor_id: adminId,
          action: 'REFUND_ORDER',
          target_resource: 'order',
          resource_id: orderId,
          ip_address: ipAddress || '127.0.0.1',
          details_json: {
            orderId,
            paymentAttemptId: finalAttempt.id,
            amountPaise: refundAmountPaise,
            currency: 'INR',
            razorpayRefundId: rzpRefund.id,
            reason: reason || 'Admin initiated full refund',
          },
          created_at: new Date(),
        },
        { transaction: tx }
      );

      // Transactionally complete IdempotencyRecord
      if (idempotencyRecord) {
        const refundDTO = toRefundResponseDTO(finalOrder, finalAttempt, {
          refundId: rzpRefund.id,
        });

        await idempotencyRepository.completeRecord(
          idempotencyRecord.id,
          {
            responseCode: 200,
            responseBody: {
              success: true,
              data: refundDTO,
              meta: {
                timestamp: new Date().toISOString(),
              },
            },
            orderId: finalOrder.id,
            paymentAttemptId: finalAttempt.id,
          },
          { transaction: tx }
        );
      }
    });

    await finalOrder.reload();
    await finalAttempt.reload();

    logger.info('Admin refund completed successfully', {
      event: 'admin.refund.completed',
      orderId: finalOrder.id,
      paymentAttemptId: finalAttempt.id,
      refundId: rzpRefund.id,
      orderStatus: finalOrder.order_status,
      paymentStatus: finalAttempt.status,
    });

    return toRefundResponseDTO(finalOrder, finalAttempt, {
      refundId: rzpRefund.id,
    });
  },
};

export default refundService;
