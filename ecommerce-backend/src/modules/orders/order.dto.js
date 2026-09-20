/**
 * Serialize an OrderItem model instance into a clean, safe DTO.
 *
 * @param {import('../../models/OrderItem.js').OrderItem} item
 * @returns {object}
 */
export function toOrderItemDTO(item) {
  if (!item) return null;

  const rawItem = typeof item.toJSON === 'function' ? item.toJSON() : item;
  const unitPrice = Number(rawItem.unit_price_paise ?? rawItem.unitPricePaise ?? 0);
  const qty = Number(rawItem.quantity ?? 0);
  const lineTotal = unitPrice * qty;

  return {
    id: rawItem.id,
    orderId: rawItem.order_id || rawItem.orderId,
    productId: rawItem.product_id || rawItem.productId,
    productName: rawItem.product_name_snapshot || rawItem.productName,
    imageUrl: rawItem.product?.image_url ?? rawItem.imageUrl ?? null,
    unitPricePaise: unitPrice,
    quantity: qty,
    lineTotalPaise: lineTotal,
    createdAt: rawItem.created_at || rawItem.createdAt,
    updatedAt: rawItem.updated_at || rawItem.updatedAt,
  };
}

/**
 * Compute authoritative payment recovery availability for an order.
 *
 * @param {import('../../models/Order.js').Order | object} order
 * @returns {{ available: boolean, reason: 'ACTIVE' | 'RESERVATION_EXPIRED' | 'ALREADY_SETTLED' | 'NOT_PENDING' }}
 */
export function getPaymentRecovery(order) {
  if (!order) {
    return { available: false, reason: 'NOT_PENDING' };
  }

  const raw = typeof order.toJSON === 'function' ? order.toJSON() : order;
  const status = raw.order_status || raw.orderStatus || raw.status;

  if (status !== 'PENDING_PAYMENT') {
    return {
      available: false,
      reason: status === 'PAID' ? 'ALREADY_SETTLED' : 'NOT_PENDING',
    };
  }

  const expiresAt = raw.reservation_expires_at || raw.reservationExpiresAt;
  if (!expiresAt) {
    return {
      available: false,
      reason: 'RESERVATION_EXPIRED',
    };
  }

  const isExpired = new Date(expiresAt).getTime() <= Date.now();
  return {
    available: !isExpired,
    reason: isExpired ? 'RESERVATION_EXPIRED' : 'ACTIVE',
  };
}

/**
 * Serialize an Order model instance into a comprehensive, sanitized customer DTO.
 *
 * @param {import('../../models/Order.js').Order} order
 * @returns {object}
 */
export function toOrderDTO(order) {
  if (!order) return null;

  const totalCost = Number(order.total_cost_paise ?? 0);
  const shippingFee = Number(order.shipping_fee_paise ?? 0);
  const subtotal = Math.max(0, totalCost - shippingFee);

  const items = Array.isArray(order.items)
    ? order.items.map(toOrderItemDTO)
    : [];

  return {
    id: order.id,
    userId: order.user_id,
    status: order.order_status,
    orderStatus: order.order_status,
    subtotalPaise: subtotal,
    shippingFeePaise: shippingFee,
    totalPaise: totalCost,
    totalCostPaise: totalCost,
    shippingAddress: {
      fullName: order.shipping_full_name,
      addressLine1: order.shipping_address_line1,
      city: order.shipping_city,
      state: order.shipping_state,
      pincode: order.shipping_pincode,
      phone: order.shipping_phone,
    },
    reservationExpiresAt: order.reservation_expires_at,
    paymentRecovery: getPaymentRecovery(order),
    items,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

/**
 * Serialize an Order model instance into a summary DTO for listing.
 *
 * @param {import('../../models/Order.js').Order} order
 * @returns {object}
 */
export function toOrderSummaryDTO(order) {
  if (!order) return null;

  const totalCost = Number(order.total_cost_paise ?? 0);
  const shippingFee = Number(order.shipping_fee_paise ?? 0);
  const subtotal = Math.max(0, totalCost - shippingFee);

  const itemCount = Array.isArray(order.items)
    ? order.items.length
    : 0;

  return {
    id: order.id,
    userId: order.user_id,
    status: order.order_status,
    orderStatus: order.order_status,
    subtotalPaise: subtotal,
    shippingFeePaise: shippingFee,
    totalPaise: totalCost,
    totalCostPaise: totalCost,
    itemCount,
    reservationExpiresAt: order.reservation_expires_at,
    paymentRecovery: getPaymentRecovery(order),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

export default {
  toOrderItemDTO,
  toOrderDTO,
  toOrderSummaryDTO,
  getPaymentRecovery,
};
