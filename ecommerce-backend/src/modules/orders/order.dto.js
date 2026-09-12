/**
 * Serialize an OrderItem model instance into a clean, safe DTO.
 *
 * @param {import('../../models/OrderItem.js').OrderItem} item
 * @returns {object}
 */
export function toOrderItemDTO(item) {
  if (!item) return null;

  const unitPrice = Number(item.unit_price_paise ?? 0);
  const qty = Number(item.quantity ?? 0);
  const lineTotal = unitPrice * qty;

  return {
    id: item.id,
    orderId: item.order_id,
    productId: item.product_id,
    productName: item.product_name_snapshot,
    unitPricePaise: unitPrice,
    quantity: qty,
    lineTotalPaise: lineTotal,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
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
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

export default {
  toOrderItemDTO,
  toOrderDTO,
  toOrderSummaryDTO,
};
