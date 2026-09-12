/**
 * Safe DTO serializer for administrative Refund responses.
 * Never leaks internal gateway secrets or credentials.
 *
 * @param {import('../../models/Order.js').Order} order
 * @param {import('../../models/PaymentAttempt.js').PaymentAttempt} paymentAttempt
 * @param {object} [extra]
 * @returns {object}
 */
export function toRefundResponseDTO(order, paymentAttempt, extra = {}) {
  return {
    orderId: order.id,
    paymentAttemptId: paymentAttempt?.id || null,
    orderStatus: order.order_status,
    paymentStatus: paymentAttempt?.status || 'REFUNDED',
    refundId: paymentAttempt?.razorpay_refund_id || extra.refundId || null,
    amountPaise: Number(paymentAttempt?.amount_paise ?? order.total_cost_paise),
    currency: 'INR',
    alreadyRefunded: extra.alreadyRefunded ?? false,
    refundedAt: (paymentAttempt?.updated_at || order.updated_at || new Date()).toISOString(),
  };
}

/**
 * Safe DTO serializer for administrative Restock responses.
 *
 * @param {import('../../models/Order.js').Order} order
 * @param {Array<{ productId: string, productName?: string, quantityRestocked: number }>} restockedItems
 * @param {string} reason
 * @returns {object}
 */
export function toRestockResponseDTO(order, restockedItems, reason) {
  const totalQuantity = restockedItems.reduce((sum, item) => sum + item.quantityRestocked, 0);
  return {
    orderId: order.id,
    orderStatus: order.order_status,
    totalQuantityRestocked: totalQuantity,
    restockedItems: restockedItems.map((item) => ({
      productId: item.productId,
      productName: item.productName || null,
      quantityRestocked: item.quantityRestocked,
    })),
    reason,
    restockedAt: new Date().toISOString(),
  };
}

export default {
  toRefundResponseDTO,
  toRestockResponseDTO,
};
