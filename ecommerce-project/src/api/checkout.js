import apiClient, { generateIdempotencyKey } from './client.js';

/**
 * Checkout API Service
 * Interacts with POST /api/checkout/initiate.
 */
export const checkoutApi = {
  /**
   * Single unified checkout entry point for authenticated customers and guest buyers.
   * Creates the ecommerce Order in PENDING_PAYMENT status and reserves inventory.
   *
   * @param {{
   *   shippingAddress: {
   *     fullName: string,
   *     addressLine1: string,
   *     city: string,
   *     state: string,
   *     pincode: string,
   *     phone: string
   *   },
   *   shippingMethod: 'STANDARD'|'EXPRESS'|'OVERNIGHT',
   *   items?: Array<{ productId: string, quantity: number }>
   * }} payload
   * @param {string} [idempotencyKey]
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
   *     shippingAddress: object,
   *     reservationExpiresAt: string,
   *     items: Array<{
   *       id: string,
   *       orderId: string,
   *       productId: string,
   *       productName: string,
   *       unitPricePaise: number,
   *       quantity: number,
   *       lineTotalPaise: number
   *     }>,
   *     guestToken?: string
   *   },
   *   meta?: { requestId?: string, timestamp?: string }
   * }>}
   */
  async initiateCheckout(payload, idempotencyKey = generateIdempotencyKey()) {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await apiClient.post('/checkout/initiate', payload, { headers });
    return response.data;
  },
};

export default checkoutApi;
