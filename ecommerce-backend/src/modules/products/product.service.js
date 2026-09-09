import { productRepository } from './product.repository.js';
import { toProductDTO } from './product.dto.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Product Service
 * Business decisions and response shaping for the Product catalog domain.
 */
export const productService = {
  /**
   * List catalog products with pagination, search, category filtering, and sorting.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   category?: string,
   *   search?: string,
   *   sortBy?: string,
   *   sortOrder?: string,
   *   inStockOnly?: boolean
   * }} query
   * @returns {Promise<{
   *   products: ReturnType<typeof toProductDTO>[],
   *   pagination: { page: number, limit: number, total: number, totalPages: number }
   * }>}
   */
  async listProducts(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));

    const { rows, count } = await productRepository.findAndCountAll({
      page,
      limit,
      category: query.category,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      inStockOnly: Boolean(query.inStockOnly),
    });

    const totalPages = Math.ceil(count / limit) || (count === 0 ? 0 : 1);
    const products = rows.map((product) => toProductDTO(product));

    return {
      products,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    };
  },

  /**
   * Retrieve a single product by UUID.
   *
   * @param {string} id
   * @returns {Promise<ReturnType<typeof toProductDTO>>}
   */
  async getProductById(id) {
    const product = await productRepository.findById(id);

    if (!product) {
      throw new NotFoundError(`Product with ID '${id}' was not found.`, 'PRODUCT_NOT_FOUND');
    }

    return toProductDTO(product);
  },
};

export default productService;
