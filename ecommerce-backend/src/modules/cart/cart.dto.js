/**
 * Cart & CartItem DTO Serializers
 * Explicit allowlist mapping ensuring raw Sequelize models, internal secrets,
 * and raw inventory fields (stock_quantity, reserved_quantity) are never leaked.
 */

/**
 * Serialize a single CartItem with its attached Product.
 *
 * @param {import('../../models/CartItem.js').CartItem | Record<string, unknown>} item
 * @returns {{
 *   id: string,
 *   cart_id: string,
 *   product_id: string,
 *   name: string,
 *   image_url: string,
 *   price_paise: number,
 *   quantity: number,
 *   line_total_paise: number,
 *   available_quantity: number
 * } | null}
 */
export function toCartItemDTO(item) {
  if (!item) return null;

  const rawItem = typeof item.toJSON === 'function' ? item.toJSON() : item;
  const product = rawItem.product || {};
  const rawProduct = typeof product.toJSON === 'function' ? product.toJSON() : product;

  const quantity = Number(rawItem.quantity ?? 1);
  const pricePaise = typeof rawProduct.price_paise === 'string'
    ? parseInt(rawProduct.price_paise, 10)
    : Number(rawProduct.price_paise ?? 0);

  const lineTotalPaise = pricePaise * quantity;

  const stockQuantity = Number(rawProduct.stock_quantity ?? 0);
  const reservedQuantity = Number(rawProduct.reserved_quantity ?? 0);
  const availableQuantity = rawProduct.available_quantity !== undefined
    ? Number(rawProduct.available_quantity)
    : Math.max(0, stockQuantity - reservedQuantity);

  return {
    id: rawItem.id,
    cart_id: rawItem.cart_id,
    product_id: rawItem.product_id,
    name: rawProduct.name ?? '',
    image_url: rawProduct.image_url ?? '',
    price_paise: pricePaise,
    quantity,
    line_total_paise: lineTotalPaise,
    available_quantity: availableQuantity,
  };
}

/**
 * Serialize full Cart with its line items and derived financial totals.
 *
 * @param {import('../../models/Cart.js').Cart | Record<string, unknown>} cart
 * @param {Array<import('../../models/CartItem.js').CartItem | Record<string, unknown>>} [items]
 * @returns {{
 *   id: string,
 *   user_id: string,
 *   items: ReturnType<typeof toCartItemDTO>[],
 *   subtotal_paise: number,
 *   item_count: number,
 *   total_quantity: number,
 *   created_at: Date | string,
 *   updated_at: Date | string
 * }}
 */
export function toCartDTO(cart, items) {
  if (!cart) {
    return {
      id: null,
      user_id: null,
      items: [],
      subtotal_paise: 0,
      item_count: 0,
      total_quantity: 0,
      created_at: null,
      updated_at: null,
    };
  }

  const rawCart = typeof cart.toJSON === 'function' ? cart.toJSON() : cart;
  const rawItems = items || rawCart.items || [];

  const serializedItems = rawItems
    .map((item) => toCartItemDTO(item))
    .filter(Boolean);

  const subtotalPaise = serializedItems.reduce((sum, item) => sum + item.line_total_paise, 0);
  const totalQuantity = serializedItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    id: rawCart.id,
    user_id: rawCart.user_id,
    items: serializedItems,
    subtotal_paise: subtotalPaise,
    item_count: serializedItems.length,
    total_quantity: totalQuantity,
    created_at: rawCart.created_at,
    updated_at: rawCart.updated_at,
  };
}

export default {
  toCartItemDTO,
  toCartDTO,
};
