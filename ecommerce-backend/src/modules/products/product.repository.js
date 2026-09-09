import { Op, Sequelize } from 'sequelize';
import { Product } from '../../models/Product.js';

/**
 * Escape LIKE / iLIKE wildcard characters to prevent wildcard injection/abuse.
 * @param {string} str
 * @returns {string}
 */
function escapeLikeWildcards(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Strict allowlisted sort order mapping.
 * Enforces deterministic sorting with secondary sort on 'id'.
 *
 * @param {string} [sortBy]
 * @param {string} [sortOrder]
 * @returns {Array<[string | import('sequelize').Utils.Literal, 'ASC' | 'DESC']>}
 */
function buildDeterministicOrder(sortBy, sortOrder = 'DESC') {
  const normalizedOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  switch (sortBy) {
  case 'price':
    return [['price_paise', normalizedOrder], ['id', 'DESC']];
  case 'price_asc':
    return [['price_paise', 'ASC'], ['id', 'DESC']];
  case 'price_desc':
    return [['price_paise', 'DESC'], ['id', 'DESC']];
  case 'name':
    return [['name', normalizedOrder], ['id', 'DESC']];
  case 'createdAt':
  case 'created_at':
    return [['created_at', normalizedOrder], ['id', 'DESC']];
  case 'newest':
    return [['created_at', 'DESC'], ['id', 'DESC']];
  case 'oldest':
    return [['created_at', 'ASC'], ['id', 'ASC']];
  default:
    // Default deterministic ordering: newest first, secondary sort by id
    return [['created_at', 'DESC'], ['id', 'DESC']];
  }

}

/**
 * Allowed explicit column selection to prevent over-fetching and SELECT *
 */
export const PRODUCT_PUBLIC_ATTRIBUTES = [
  'id',
  'name',
  'description',
  'price_paise',
  'stock_quantity',
  'reserved_quantity',
  'category',
  'image_url',
  'is_deleted',
  'created_at',
  'updated_at',
];

/**
 * Product Repository
 * Encapsulates all PostgreSQL/Sequelize database queries for the Product domain.
 */
export const productRepository = {
  /**
   * Find paginated products matching filters with deterministic ordering.
   *
   * @param {{
   *   page: number,
   *   limit: number,
   *   category?: string,
   *   search?: string,
   *   sortBy?: string,
   *   sortOrder?: string,
   *   inStockOnly?: boolean
   * }} options
   * @returns {Promise<{ rows: Product[], count: number }>}
   */
  async findAndCountAll({
    page = 1,
    limit = 10,
    category,
    search,
    sortBy,
    sortOrder,
    inStockOnly = false,
  }) {
    const whereConditions = {
      is_deleted: false,
    };

    if (category) {
      whereConditions.category = category;
    }

    if (search && search.trim().length > 0) {
      const sanitized = escapeLikeWildcards(search.trim());
      whereConditions[Op.or] = [
        { name: { [Op.iLike]: `%${sanitized}%` } },
        { description: { [Op.iLike]: `%${sanitized}%` } },
      ];
    }

    if (inStockOnly) {
      whereConditions[Op.and] = Sequelize.where(
        Sequelize.literal('(stock_quantity - reserved_quantity)'),
        Op.gt,
        0
      );
    }

    const order = buildDeterministicOrder(sortBy, sortOrder);
    const offset = (page - 1) * limit;

    const result = await Product.findAndCountAll({
      where: whereConditions,
      attributes: PRODUCT_PUBLIC_ATTRIBUTES,
      order,
      limit,
      offset,
    });

    return result;
  },

  /**
   * Find a single product by UUID.
   *
   * @param {string} id
   * @returns {Promise<Product | null>}
   */
  async findById(id) {
    return Product.findOne({
      where: {
        id,
        is_deleted: false,
      },
      attributes: PRODUCT_PUBLIC_ATTRIBUTES,
    });
  },
};

export default productRepository;
