import { PAYMENT_CURRENCY } from './payment.constants.js';

/**
 * Serialize a PaymentAttempt model instance into a sanitized DTO.
 * Never leaks internal secrets or signatures.
 *
 * @param {import('../../models/PaymentAttempt.js').PaymentAttempt} attempt
 * @returns {object|null}
 */
export function toPaymentAttemptDTO(attempt) {
  if (!attempt) return null;

  return {
    id: attempt.id,
    orderId: attempt.order_id,
    attemptNumber: attempt.attempt_number,
    razorpayOrderId: attempt.razorpay_order_id,
    razorpayPaymentId: attempt.razorpay_payment_id,
    status: attempt.status,
    failureReason: attempt.failure_reason,
    amountPaise: Number(attempt.amount_paise ?? 0),
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
  };
}

/**
 * Serialize a newly initiated or retried payment attempt for safe client checkout.
 *
 * @param {import('../../models/PaymentAttempt.js').PaymentAttempt} attempt
 * @param {string} razorpayKeyId
 * @returns {object}
 */
export function toPaymentInitiationDTO(attempt, razorpayKeyId) {
  return {
    orderId: attempt.order_id,
    paymentAttemptId: attempt.id,
    attemptNumber: attempt.attempt_number,
    razorpayOrderId: attempt.razorpay_order_id,
    razorpayKeyId,
    amountPaise: Number(attempt.amount_paise ?? 0),
    currency: PAYMENT_CURRENCY,
  };
}

/**
 * Serialize payment verification reconciliation result.
 *
 * @param {import('../../models/Order.js').Order} order
 * @param {import('../../models/PaymentAttempt.js').PaymentAttempt} attempt
 * @returns {object}
 */
export function toPaymentVerificationDTO(order, attempt) {
  return {
    orderId: order.id,
    orderStatus: order.order_status,
    paymentAttemptId: attempt.id,
    paymentStatus: attempt.status,
    razorpayPaymentId: attempt.razorpay_payment_id,
    razorpayOrderId: attempt.razorpay_order_id,
    amountPaise: Number(attempt.amount_paise ?? 0),
    settled: attempt.status === 'SUCCESS' && order.order_status === 'PAID',
  };
}

export default {
  toPaymentAttemptDTO,
  toPaymentInitiationDTO,
  toPaymentVerificationDTO,
};
