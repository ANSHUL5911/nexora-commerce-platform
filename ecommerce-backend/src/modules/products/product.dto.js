/**
 * Product DTO Serializer
 * Explicit allowlist mapping from Sequelize Product instance / raw object to public JSON response.
 * Guarantees internal attributes and model instances are never serialized blindly.
 *
 * @param {import('../../models/Product.js').Product | Record<string, unknown>} product
 * @returns {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   price_paise: number,
 *   category: string,
 *   image_url: string,
 *   stock_quantity: number,
 *   reserved_quantity: number,
 *   available_quantity: number,
 *   created_at: Date | string,
 *   updated_at: Date | string
 * } | null}
 */
export function toProductDTO(product) {
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
    category: raw.category,
    image_url: raw.image_url,
    stock_quantity: stockQuantity,
    reserved_quantity: reservedQuantity,
    available_quantity: availableQuantity,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export default {
  toProductDTO,
};
