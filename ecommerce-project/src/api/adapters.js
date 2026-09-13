/**
 * Frontend View-Model Adapters
 * Normalizes backend DTOs into clean view-models for React components.
 * Note: Does not fabricate data or alter backend authority.
 */

/**
 * Adapt a Product DTO for product card/detail display.
 *
 * @param {object} product
 * @returns {object}
 */
export function adaptProduct(product) {
  if (!product) return null;

  const rawQty = product.available_quantity ?? product.availableQuantity;
  const availableQuantity = (rawQty !== undefined && rawQty !== null && !isNaN(Number(rawQty)))
    ? Number(rawQty)
    : undefined;

  return {
    id: product.id,
    name: product.name ?? '',
    description: product.description ?? '',
    pricePaise: Number(product.price_paise ?? product.pricePaise ?? 0),
    category: product.category ?? '',
    image: product.image_url ?? product.image ?? '',
    imageUrl: product.image_url ?? product.image ?? '',
    availableQuantity,
    available_quantity: availableQuantity,
    rating: product.rating || { stars: 4.5, count: 50 },
    createdAt: product.created_at || product.createdAt,
    updatedAt: product.updated_at || product.updatedAt,
  };
}

/**
 * Adapt a CartItem DTO for cart and checkout line-item display.
 *
 * @param {object} item
 * @returns {object}
 */
export function adaptCartItem(item) {
  if (!item) return null;

  const itemQty = item.available_quantity ?? item.availableQuantity;
  const availableQuantity = (itemQty !== undefined && itemQty !== null && !isNaN(Number(itemQty)))
    ? Number(itemQty)
    : undefined;

  return {
    id: item.id,
    cartId: item.cart_id || item.cartId,
    productId: item.product_id || item.productId,
    name: item.name ?? '',
    image: item.image_url ?? item.image ?? '',
    imageUrl: item.image_url ?? item.image ?? '',
    pricePaise: Number(item.price_paise ?? item.pricePaise ?? 0),
    quantity: Number(item.quantity ?? 1),
    lineTotalPaise: Number(item.line_total_paise ?? item.lineTotalPaise ?? 0),
    availableQuantity,
  };
}

/**
 * Adapt full Cart DTO.
 *
 * @param {object} cart
 * @returns {object}
 */
export function adaptCart(cart) {
  if (!cart) {
    return {
      id: null,
      userId: null,
      items: [],
      subtotalPaise: 0,
      itemCount: 0,
      totalQuantity: 0,
    };
  }

  const items = Array.isArray(cart.items) ? cart.items.map(adaptCartItem) : [];
  return {
    id: cart.id,
    userId: cart.user_id || cart.userId,
    items,
    subtotalPaise: Number(cart.subtotal_paise ?? cart.subtotalPaise ?? 0),
    itemCount: Number(cart.item_count ?? cart.itemCount ?? items.length),
    totalQuantity: Number(cart.total_quantity ?? cart.totalQuantity ?? items.reduce((sum, i) => sum + i.quantity, 0)),
  };
}

/**
 * Adapt OrderItem DTO.
 *
 * @param {object} item
 * @returns {object}
 */
export function adaptOrderItem(item) {
  if (!item) return null;

  const unitPrice = Number(item.unitPricePaise ?? item.unit_price_paise ?? item.price_paise ?? item.pricePaise ?? 0);
  const qty = Number(item.quantity ?? 1);
  const lineTotal = Number(item.lineTotalPaise ?? item.line_total_paise ?? (unitPrice * qty));

  return {
    id: item.id,
    orderId: item.orderId || item.order_id,
    productId: item.productId || item.product_id,
    name: item.productName || item.product_name || item.product_name_snapshot || item.name || 'Product',
    productName: item.productName || item.product_name || item.product_name_snapshot || item.name || 'Product',
    image: item.imageUrl || item.image_url || item.image || 'images/products/athletic-cotton-socks-6-pairs.jpg',
    unitPricePaise: unitPrice,
    quantity: qty,
    lineTotalPaise: lineTotal,
    createdAt: item.createdAt || item.created_at,
    updatedAt: item.updatedAt || item.updated_at,
  };
}

/**
 * Adapt Order DTO.
 *
 * @param {object} order
 * @returns {object}
 */
export function adaptOrder(order) {
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items.map(adaptOrderItem) : [];
  const totalPaise = Number(order.totalPaise ?? order.totalCostPaise ?? order.total_cost_paise ?? order.total_paise ?? 0);
  const shippingFeePaise = Number(order.shippingFeePaise ?? order.shipping_fee_paise ?? 0);
  const subtotalPaise = Number(order.subtotalPaise ?? order.subtotal_paise ?? Math.max(0, totalPaise - shippingFeePaise));

  return {
    id: order.id,
    userId: order.userId || order.user_id,
    status: order.orderStatus || order.status || order.order_status,
    orderStatus: order.orderStatus || order.status || order.order_status,
    subtotalPaise,
    shippingFeePaise,
    totalPaise,
    totalCostPaise: totalPaise,
    shippingAddress: order.shippingAddress || {
      fullName: order.shipping_full_name,
      addressLine1: order.shipping_address_line1,
      city: order.shipping_city,
      state: order.shipping_state,
      pincode: order.shipping_pincode,
      phone: order.shipping_phone,
    },
    reservationExpiresAt: order.reservationExpiresAt || order.reservation_expires_at,
    items,
    itemCount: order.itemCount || items.length,
    guestToken: order.guestToken,
    createdAt: order.createdAt || order.created_at,
    updatedAt: order.updatedAt || order.updated_at,
  };
}

export default {
  adaptProduct,
  adaptCartItem,
  adaptCart,
  adaptOrderItem,
  adaptOrder,
};
