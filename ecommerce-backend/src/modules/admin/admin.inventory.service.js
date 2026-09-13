import { Op, Sequelize } from 'sequelize';
import { Product } from '../../models/index.js';
import { toAdminInventoryDTO } from './admin.dto.js';

/**
 * Escape LIKE / iLIKE wildcard characters to prevent wildcard injection/abuse.
 * @param {string} str
 * @returns {string}
 */
function escapeLikeWildcards(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

export const adminInventoryService = {
  /**
   * Retrieve an administrative overview of product inventory levels.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   category?: string,
   *   search?: string,
   *   lowStockOnly?: boolean
   * }} query
   * @returns {Promise<{
   *   inventory: ReturnType<typeof toAdminInventoryDTO>[],
   *   pagination: { page: number, limit: number, total: number, totalPages: number }
   * }>}
   */
  async getInventoryOverview(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const whereConditions = {
      is_deleted: false,
    };

    if (query.category) {
      whereConditions.category = query.category;
    }

    if (query.search && query.search.trim().length > 0) {
      const sanitized = escapeLikeWildcards(query.search.trim());
      whereConditions[Op.or] = [
        { name: { [Op.iLike]: `%${sanitized}%` } },
        { description: { [Op.iLike]: `%${sanitized}%` } },
      ];
    }

    if (query.lowStockOnly) {
      whereConditions[Op.and] = Sequelize.where(
        Sequelize.literal('(stock_quantity - reserved_quantity)'),
        Op.lte,
        5
      );
    }

    const { rows, count } = await Product.findAndCountAll({
      where: whereConditions,
      order: [
        ['stock_quantity', 'ASC'],
        ['id', 'ASC'],
      ],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit) || (count === 0 ? 0 : 1);
    const inventory = rows.map(toAdminInventoryDTO);

    return {
      inventory,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    };
  },
};

export default adminInventoryService;
