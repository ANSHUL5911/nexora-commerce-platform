/**
 * Phase 07.6 — Inventory DTO Serializers
 */

/**
 * Serialize an InventoryReservation entity into a sanitized client/service DTO.
 *
 * @param {import('../../models/InventoryReservation.js').InventoryReservation | Record<string, unknown>} reservation
 * @returns {{
 *   id: string,
 *   order_id: string,
 *   orderId: string,
 *   product_id: string,
 *   productId: string,
 *   quantity: number,
 *   status: string,
 *   expires_at: Date | string,
 *   expiresAt: Date | string,
 *   released_at: Date | string | null,
 *   releasedAt: Date | string | null,
 *   created_at: Date | string,
 *   createdAt: Date | string,
 *   updated_at: Date | string,
 *   updatedAt: Date | string,
 *   product?: {
 *     id: string,
 *     name: string,
 *     price_paise: number,
 *     available_quantity: number
 *   }
 * } | null}
 */
export function toReservationDTO(reservation) {
  if (!reservation) return null;

  const raw = typeof reservation.toJSON === 'function' ? reservation.toJSON() : reservation;

  const dto = {
    id: raw.id,
    order_id: raw.order_id,
    orderId: raw.order_id,
    product_id: raw.product_id,
    productId: raw.product_id,
    quantity: Number(raw.quantity),
    status: raw.status,
    expires_at: raw.expires_at,
    expiresAt: raw.expires_at,
    released_at: raw.released_at ?? null,
    releasedAt: raw.released_at ?? null,
    created_at: raw.created_at,
    createdAt: raw.created_at,
    updated_at: raw.updated_at,
    updatedAt: raw.updated_at,
  };

  if (raw.product) {
    const rawProd = typeof raw.product.toJSON === 'function' ? raw.product.toJSON() : raw.product;
    const stock = Number(rawProd.stock_quantity ?? 0);
    const reserved = Number(rawProd.reserved_quantity ?? 0);
    dto.product = {
      id: rawProd.id,
      name: rawProd.name ?? '',
      price_paise: typeof rawProd.price_paise === 'string'
        ? parseInt(rawProd.price_paise, 10)
        : Number(rawProd.price_paise ?? 0),
      available_quantity: Math.max(0, stock - reserved),
    };
  }

  return dto;
}

/**
 * Serialize a Product's inventory state.
 *
 * @param {import('../../models/Product.js').Product | Record<string, unknown>} product
 * @returns {{
 *   id: string,
 *   stock_quantity: number,
 *   stockQuantity: number,
 *   reserved_quantity: number,
 *   reservedQuantity: number,
 *   available_quantity: number,
 *   availableQuantity: number
 * } | null}
 */
export function toProductInventoryDTO(product) {
  if (!product) return null;

  const raw = typeof product.toJSON === 'function' ? product.toJSON() : product;
  const stockQuantity = Number(raw.stock_quantity ?? 0);
  const reservedQuantity = Number(raw.reserved_quantity ?? 0);
  const availableQuantity = Math.max(0, stockQuantity - reservedQuantity);

  return {
    id: raw.id,
    stock_quantity: stockQuantity,
    stockQuantity,
    reserved_quantity: reservedQuantity,
    reservedQuantity,
    available_quantity: availableQuantity,
    availableQuantity,
  };
}

export default {
  toReservationDTO,
  toProductInventoryDTO,
};
