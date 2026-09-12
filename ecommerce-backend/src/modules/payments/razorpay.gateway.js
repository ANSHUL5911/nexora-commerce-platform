import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { RazorpayGatewayError } from './payment.errors.js';

export class RazorpayGateway {
  constructor({
    keyId = config.RAZORPAY_KEY_ID,
    keySecret = config.RAZORPAY_KEY_SECRET,
    client = null,
  } = {}) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.client =
      client ||
      new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
  }

  /**
   * Create an external Razorpay Order.
   *
   * @param {{
   *   amountPaise: number,
   *   currency?: string,
   *   receipt?: string,
   *   notes?: Record<string, string>
   * }} params
   * @returns {Promise<{ id: string, amount: number, currency: string, status: string, receipt?: string }>}
   */
  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    try {
      logger.info('Creating Razorpay order on gateway', {
        amountPaise,
        currency,
        receipt,
      });

      const order = await this.client.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt,
        notes,
      });

      logger.info('Razorpay order created successfully', {
        razorpayOrderId: order.id,
        status: order.status,
      });

      return order;
    } catch (err) {
      logger.error('Razorpay order creation failed', {
        error: err.message,
        statusCode: err.statusCode,
      });
      throw new RazorpayGatewayError(
        'Failed to create order on payment gateway.',
        { gatewayError: err.message }
      );
    }
  }

  /**
   * Fetch payment details from Razorpay to verify authoritative capture status.
   *
   * @param {string} paymentId
   * @returns {Promise<{ id: string, order_id: string, status: string, amount: number, currency: string, captured: boolean }>}
   */
  async fetchPayment(paymentId) {
    try {
      const payment = await this.client.payments.fetch(paymentId);
      return payment;
    } catch (err) {
      logger.error('Razorpay payment fetch failed', {
        paymentId,
        error: err.message,
      });
      throw new RazorpayGatewayError(
        'Failed to fetch payment details from payment gateway.',
        { gatewayError: err.message }
      );
    }
  }

  /**
   * Timing-safe HMAC-SHA256 Razorpay signature verification.
   * Never leaks raw signatures or secrets to logs or exceptions.
   *
   * @param {{
   *   razorpayOrderId: string,
   *   razorpayPaymentId: string,
   *   razorpaySignature: string
   * }} params
   * @returns {boolean}
   */
  verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return false;
    }

    try {
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(payload)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(razorpaySignature, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch (err) {
      logger.warn('Razorpay signature comparison error', {
        error: err.message,
      });
      return false;
    }
  }
}

export const razorpayGateway = new RazorpayGateway();
export default razorpayGateway;
