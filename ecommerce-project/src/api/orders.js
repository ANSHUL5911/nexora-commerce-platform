import apiClient from './client.js';

/**
 * Orders API Service
 * Interacts with GET /api/orders and GET /api/orders/:orderId.
 */
export const ordersApi = {
  /**
   * List paginated orders for the authenticated customer.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string
   * }} [params]
   * @returns {Promise<{
   *   success: boolean,
   *   data: Array<{
   *     id: string,
   *     userId: string,
   *     status: string,
   *     orderStatus: string,
   *     subtotalPaise: number,
   *     shippingFeePaise: number,
   *     totalPaise: number,
   *     totalCostPaise: number,
   *     itemCount: number,
   *     reservationExpiresAt: string,
   *     createdAt: string,
   *     updatedAt: string
   *   }>,
   *   pagination: { page: number, limit: number, totalItems: number, totalPages: number }
   * }>}
   */
  async listOrders(params = {}) {
    const response = await apiClient.get('/orders', { params });
    return response.data;
  },

  /**
   * Retrieve order details by ID for authenticated customer or guest buyer (via X-Guest-Token).
   *
   * @param {string} orderId
   * @param {string} [guestToken]
   * @returns {Promise<{
   *   success: boolean,
   *   data: {
   *     id: string,
   *     userId: string|null,
   *     status: string,
   *     orderStatus: string,
   *     subtotalPaise: number,
   *     shippingFeePaise: number,
   *     totalPaise: number,
   *     totalCostPaise: number,
   *     shippingAddress: {
   *       fullName: string,
   *       addressLine1: string,
   *       city: string,
   *       state: string,
   *       pincode: string,
   *       phone: string
   *     },
   *     reservationExpiresAt: string,
   *     items: Array<{
   *       id: string,
   *       orderId: string,
   *       productId: string,
   *       productName: string,
   *       unitPricePaise: number,
   *       quantity: number,
   *       lineTotalPaise: number,
   *       createdAt: string,
   *       updatedAt: string
   *     }>,
   *     createdAt: string,
   *     updatedAt: string
   *   }
   * }>}
   */
  async getOrder(orderId, guestTokenOrOptions = null) {
    const headers = {};
    const guestToken = typeof guestTokenOrOptions === 'object' && guestTokenOrOptions !== null
      ? guestTokenOrOptions.guestToken
      : guestTokenOrOptions;

    if (guestToken) {
      headers['X-Guest-Token'] = guestToken;
    }

    const response = await apiClient.get(`/orders/${orderId}`, { headers });
    return response.data;
  },

};

export default ordersApi;
