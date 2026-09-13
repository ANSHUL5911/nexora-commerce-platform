import apiClient from './client.js';

/**
 * Cart API Service
 * Interacts with backend /api/cart endpoints.
 */
export const cartApi = {
  /**
   * Retrieve active cart for current authenticated session.
   *
   * @returns {Promise<{
   *   cart: {
   *     id: string|null,
   *     user_id: string|null,
   *     items: Array<{
   *       id: string,
   *       cart_id: string,
   *       product_id: string,
   *       name: string,
   *       image_url: string,
   *       price_paise: number,
   *       quantity: number,
   *       line_total_paise: number,
   *       available_quantity: number
   *     }>,
   *     subtotal_paise: number,
   *     item_count: number,
   *     total_quantity: number,
   *     created_at: string|null,
   *     updated_at: string|null
   *   },
   *   requestId?: string
   * }>}
   */
  async getCart() {
    const response = await apiClient.get('/cart');
    return response.data;
  },

  /**
   * Add a product to the user's cart or increment quantity.
   *
   * @param {{ productId: string, quantity?: number }} payload
   * @returns {Promise<{
   *   message: string,
   *   cart: object,
   *   item: object,
   *   requestId?: string
   * }>}
   */
  async addItem({ productId, quantity = 1 }) {
    const response = await apiClient.post('/cart/items', { productId, quantity });
    return response.data;
  },

  /**
   * Update quantity for a specific line item in the cart.
   *
   * @param {string} itemId - UUID of the CartItem
   * @param {{ quantity: number }} payload
   * @returns {Promise<{
   *   message: string,
   *   cart: object,
   *   item: object,
   *   requestId?: string
   * }>}
   */
  async updateItem(itemId, { quantity }) {
    const response = await apiClient.patch(`/cart/items/${itemId}`, { quantity });
    return response.data;
  },

  /**
   * Remove a line item from the user's cart.
   *
   * @param {string} itemId - UUID of the CartItem
   * @returns {Promise<{
   *   message: string,
   *   cart: object,
   *   requestId?: string
   * }>}
   */
  async removeItem(itemId) {
    const response = await apiClient.delete(`/cart/items/${itemId}`);
    return response.data;
  },

  /**
   * Clear all items from the user's cart.
   *
   * @returns {Promise<{
   *   message: string,
   *   cart: object,
   *   requestId?: string
   * }>}
   */
  async clearCart() {
    const response = await apiClient.delete('/cart');
    return response.data;
  },
};

export default cartApi;
