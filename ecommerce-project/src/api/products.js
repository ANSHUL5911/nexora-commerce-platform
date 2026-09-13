import apiClient from './client.js';

/**
 * Products & Catalog API Service
 */
export const productsApi = {
  /**
   * List products matching search, category, and pagination queries.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   category?: string,
   *   search?: string,
   *   sortBy?: string,
   *   sortOrder?: string,
   *   inStockOnly?: boolean
   * }} [params]
   * @returns {Promise<{
   *   products: Array<{
   *     id: string,
   *     name: string,
   *     description: string,
   *     price_paise: number,
   *     category: string,
   *     image_url: string,
   *     available_quantity: number,
   *     created_at: string,
   *     updated_at: string
   *   }>,
   *   pagination: { page: number, limit: number, total: number, totalPages: number },
   *   requestId?: string
   * }>}
   */
  async listProducts(params = {}) {
    const response = await apiClient.get('/products', { params });
    return response.data;
  },

  /**
   * Retrieve a single product by UUID.
   *
   * @param {string} id
   * @returns {Promise<{
   *   product: {
   *     id: string,
   *     name: string,
   *     description: string,
   *     price_paise: number,
   *     category: string,
   *     image_url: string,
   *     available_quantity: number,
   *     created_at: string,
   *     updated_at: string
   *   },
   *   requestId?: string
   * }>}
   */
  async getProductById(id) {
    const response = await apiClient.get(`/products/${id}`);
    return response.data;
  },
};

export default productsApi;
