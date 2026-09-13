import apiClient, { generateIdempotencyKey } from './client.js';

/**
 * Payments API Service
 * Interacts with POST /api/payments/* endpoints.
 */
export const paymentsApi = {
  /**
   * Initiate a Razorpay payment attempt on a PENDING_PAYMENT order.
   *
   * @param {{ orderId: string }} payload
   * @param {string} [idempotencyKey]
   * @param {string} [guestToken]
   * @returns {Promise<{
   *   success: boolean,
   *   data: {
   *     orderId: string,
   *     paymentAttemptId: string,
   *     attemptNumber: number,
   *     razorpayOrderId: string,
   *     razorpayKeyId: string,
   *     amountPaise: number,
   *     currency: string
   *   },
   *   meta?: { requestId?: string, timestamp?: string }
   * }>}
   */
  async createPaymentOrder({ orderId, guestToken: gTokInPayload } = {}, idempotencyKey = generateIdempotencyKey(), guestToken = null) {
    const effectiveGuestToken = guestToken || gTokInPayload;
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    if (effectiveGuestToken) {
      headers['X-Guest-Token'] = effectiveGuestToken;
    }

    const response = await apiClient.post('/payments/create-order', { orderId }, { headers });
    return response.data;
  },

  /**
   * Retry payment on an existing PENDING_PAYMENT order (creates new PaymentAttempt + Razorpay Order on same Order).
   *
   * @param {{ orderId: string, guestToken?: string }} payload
   * @param {string} [idempotencyKey]
   * @param {string} [guestToken]
   * @returns {Promise<{
   *   success: boolean,
   *   data: {
   *     orderId: string,
   *     paymentAttemptId: string,
   *     attemptNumber: number,
   *     razorpayOrderId: string,
   *     razorpayKeyId: string,
   *     amountPaise: number,
   *     currency: string
   *   },
   *   meta?: { requestId?: string, timestamp?: string }
   * }>}
   */
  async retryPayment({ orderId, guestToken: gTokInPayload } = {}, idempotencyKey = generateIdempotencyKey(), guestToken = null) {
    const effectiveGuestToken = guestToken || gTokInPayload;
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    if (effectiveGuestToken) {
      headers['X-Guest-Token'] = effectiveGuestToken;
    }

    const response = await apiClient.post('/payments/retry', { orderId }, { headers });
    return response.data;
  },

  /**
   * Reconcile client checkout result via server-side signature and gateway verification.
   *
   * @param {{
   *   orderId: string,
   *   razorpayOrderId: string,
   *   razorpayPaymentId: string,
   *   razorpaySignature: string,
   *   guestToken?: string
   * }} payload
   * @param {string} [idempotencyKey]
   * @param {string} [guestToken]
   * @returns {Promise<{
   *   success: boolean,
   *   data: {
   *     orderId: string,
   *     orderStatus: string,
   *     paymentAttemptId: string,
   *     paymentStatus: string,
   *     razorpayPaymentId: string,
   *     razorpayOrderId: string,
   *     amountPaise: number,
   *     settled: boolean
   *   },
   *   meta?: { requestId?: string, timestamp?: string }
   * }>}
   */
  async verifyPayment(
    { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, guestToken: gTokInPayload } = {},
    idempotencyKey = generateIdempotencyKey(),
    guestToken = null
  ) {
    const effectiveGuestToken = guestToken || gTokInPayload;
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    if (effectiveGuestToken) {
      headers['X-Guest-Token'] = effectiveGuestToken;
    }

    const response = await apiClient.post(
      '/payments/verify',
      { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
      { headers }
    );
    return response.data;
  },

};

export default paymentsApi;
