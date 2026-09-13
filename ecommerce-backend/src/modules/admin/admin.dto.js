/**
 * Safe DTO serializer for administrative Product responses.
 *
 * @param {import('../../models/Product.js').Product | Record<string, unknown>} product
 * @returns {object|null}
 */
export function toAdminProductDTO(product) {
  if (!product) return null;

  const raw = typeof product.toJSON === 'function' ? product.toJSON() : product;
  const stockQuantity = Number(raw.stock_quantity ?? 0);
  const reservedQuantity = Number(raw.reserved_quantity ?? 0);
  const availableQuantity = raw.available_quantity !== undefined
    ? Number(raw.available_quantity)
    : Math.max(0, stockQuantity - reservedQuantity);

  const pricePaise = typeof raw.price_paise === 'string'
    ? parseInt(raw.price_paise, 10)
    : Number(raw.price_paise ?? 0);

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    price_paise: pricePaise,
    pricePaise,
    category: raw.category,
    image_url: raw.image_url,
    imageUrl: raw.image_url,
    stock_quantity: stockQuantity,
    stockQuantity,
    reserved_quantity: reservedQuantity,
    reservedQuantity,
    available_quantity: availableQuantity,
    availableQuantity,
    is_deleted: Boolean(raw.is_deleted),
    isDeleted: Boolean(raw.is_deleted),
    created_at: raw.created_at,
    createdAt: raw.created_at,
    updated_at: raw.updated_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * Safe DTO serializer for administrative Inventory responses.
 *
 * @param {import('../../models/Product.js').Product | Record<string, unknown>} product
 * @returns {object|null}
 */
export function toAdminInventoryDTO(product) {
  if (!product) return null;

  const raw = typeof product.toJSON === 'function' ? product.toJSON() : product;
  const stockQuantity = Number(raw.stock_quantity ?? 0);
  const reservedQuantity = Number(raw.reserved_quantity ?? 0);
  const availableQuantity = raw.available_quantity !== undefined
    ? Number(raw.available_quantity)
    : Math.max(0, stockQuantity - reservedQuantity);

  return {
    productId: raw.id,
    name: raw.name,
    category: raw.category,
    stockQuantity,
    reservedQuantity,
    availableQuantity,
    isDeleted: Boolean(raw.is_deleted),
    updatedAt: raw.updated_at,
  };
}

/**
 * Safe DTO serializer for administrative Order Summary (listing).
 *
 * @param {import('../../models/Order.js').Order | Record<string, unknown>} order
 * @returns {object|null}
 */
export function toAdminOrderSummaryDTO(order) {
  if (!order) return null;

  const raw = typeof order.toJSON === 'function' ? order.toJSON() : order;
  const totalCost = Number(raw.total_cost_paise ?? 0);
  const shippingFee = Number(raw.shipping_fee_paise ?? 0);
  const subtotal = Math.max(0, totalCost - shippingFee);

  const itemCount = Array.isArray(raw.items)
    ? raw.items.reduce((sum, item) => sum + Number(item.quantity ?? 1), 0)
    : 0;

  const latestPaymentAttempt = Array.isArray(raw.paymentAttempts) && raw.paymentAttempts.length > 0
    ? raw.paymentAttempts[0]
    : null;

  return {
    id: raw.id,
    userId: raw.user_id || null,
    customer: raw.user
      ? {
        id: raw.user.id,
        email: raw.user.email,
        fullName: raw.user.full_name,
        role: raw.user.role,
      }
      : null,
    orderStatus: raw.order_status,
    status: raw.order_status,
    totalCostPaise: totalCost,
    shippingFeePaise: shippingFee,
    subtotalPaise: subtotal,
    itemCount,
    shippingAddress: {
      fullName: raw.shipping_full_name,
      addressLine1: raw.shipping_address_line1,
      city: raw.shipping_city,
      state: raw.shipping_state,
      pincode: raw.shipping_pincode,
      phone: raw.shipping_phone,
    },
    paymentStatus: latestPaymentAttempt?.status || (raw.order_status === 'PAID' ? 'SUCCESS' : null),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * Safe DTO serializer for administrative Order Detail.
 * Strips all internal secrets, payment credentials, and guest token hashes.
 *
 * @param {import('../../models/Order.js').Order | Record<string, unknown>} order
 * @returns {object|null}
 */
export function toAdminOrderDTO(order) {
  if (!order) return null;

  const raw = typeof order.toJSON === 'function' ? order.toJSON() : order;
  const totalCost = Number(raw.total_cost_paise ?? 0);
  const shippingFee = Number(raw.shipping_fee_paise ?? 0);
  const subtotal = Math.max(0, totalCost - shippingFee);

  // Map restock logs to compute already restocked quantities per product
  const restockLogs = Array.isArray(raw.restockLogs) ? raw.restockLogs : [];
  const restockedQtyByProduct = {};
  for (const log of restockLogs) {
    const pId = log.product_id;
    restockedQtyByProduct[pId] = (restockedQtyByProduct[pId] || 0) + Number(log.quantity_restocked || 0);
  }

  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => {
      const unitPrice = Number(item.unit_price_paise ?? 0);
      const qty = Number(item.quantity ?? 0);
      const restockedQty = restockedQtyByProduct[item.product_id] || 0;
      const remainingRestockable = Math.max(0, qty - restockedQty);

      return {
        id: item.id,
        productId: item.product_id,
        productName: item.product_name_snapshot,
        unitPricePaise: unitPrice,
        quantity: qty,
        lineTotalPaise: unitPrice * qty,
        quantityRestocked: restockedQty,
        remainingRestockableQuantity: remainingRestockable,
        createdAt: item.created_at,
      };
    })
    : [];

  const paymentAttempts = Array.isArray(raw.paymentAttempts)
    ? raw.paymentAttempts.map((pa) => ({
      id: pa.id,
      attemptNumber: pa.attempt_number,
      razorpayOrderId: pa.razorpay_order_id,
      razorpayPaymentId: pa.razorpay_payment_id || null,
      razorpayRefundId: pa.razorpay_refund_id || null,
      status: pa.status,
      amountPaise: Number(pa.amount_paise ?? 0),
      createdAt: pa.created_at,
      updatedAt: pa.updated_at,
    }))
    : [];

  const sanitizedRestockLogs = restockLogs.map((log) => ({
    id: log.id,
    productId: log.product_id,
    quantityRestocked: Number(log.quantity_restocked ?? 0),
    initiatedBy: log.initiated_by,
    reason: log.reason,
    createdAt: log.created_at,
  }));

  const eligibleForRefund = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(raw.order_status);
  const eligibleForRestock = raw.order_status === 'REFUNDED';

  return {
    id: raw.id,
    userId: raw.user_id || null,
    customer: raw.user
      ? {
        id: raw.user.id,
        email: raw.user.email,
        fullName: raw.user.full_name,
        role: raw.user.role,
      }
      : null,
    orderStatus: raw.order_status,
    status: raw.order_status,
    totalCostPaise: totalCost,
    shippingFeePaise: shippingFee,
    subtotalPaise: subtotal,
    shippingAddress: {
      fullName: raw.shipping_full_name,
      addressLine1: raw.shipping_address_line1,
      city: raw.shipping_city,
      state: raw.shipping_state,
      pincode: raw.shipping_pincode,
      phone: raw.shipping_phone,
    },
    reservationExpiresAt: raw.reservation_expires_at,
    items,
    paymentAttempts,
    restockLogs: sanitizedRestockLogs,
    isRefundEligible: eligibleForRefund,
    isRestockEligible: eligibleForRestock,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * Safe DTO serializer for AuditLog records.
 *
 * @param {import('../../models/AuditLog.js').AuditLog | Record<string, unknown>} log
 * @returns {object|null}
 */
export function toAuditLogDTO(log) {
  if (!log) return null;

  const raw = typeof log.toJSON === 'function' ? log.toJSON() : log;

  return {
    id: raw.id,
    actorId: raw.actor_id || null,
    actor: raw.actor
      ? {
        id: raw.actor.id,
        email: raw.actor.email,
        fullName: raw.actor.full_name,
        role: raw.actor.role,
      }
      : null,
    action: raw.action,
    targetResource: raw.target_resource,
    resourceId: raw.resource_id || null,
    ipAddress: raw.ip_address,
    details: raw.details_json || null,
    createdAt: raw.created_at,
  };
}

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
  toAdminProductDTO,
  toAdminInventoryDTO,
  toAdminOrderSummaryDTO,
  toAdminOrderDTO,
  toAuditLogDTO,
  toRefundResponseDTO,
  toRestockResponseDTO,
};

