import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { RazorpayGatewayError } from './payment.errors.js';

export class RazorpayGateway {
  constructor({
    keyId = config.RAZORPAY_KEY_ID,
    keySecret = config.RAZORPAY_KEY_SECRET,
    webhookSecret = config.RAZORPAY_WEBHOOK_SECRET,
    client = null,
  } = {}) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
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
   * Issue a refund on Razorpay Gateway for a settled payment.
   *
   * @param {{
   *   paymentId: string,
   *   amountPaise: number,
   *   notes?: Record<string, string>,
   *   speed?: string
   * }} params
   * @returns {Promise<{ id: string, payment_id: string, amount: number, currency: string, status: string }>}
   */
  async refundPayment({ paymentId, amountPaise, notes = {}, speed = 'normal' }) {
    try {
      logger.info('Initiating Razorpay refund on gateway', {
        paymentId,
        amountPaise,
        speed,
      });

      const refund = await this.client.payments.refund(paymentId, {
        amount: Math.round(amountPaise),
        notes,
        speed,
      });

      logger.info('Razorpay refund created successfully', {
        refundId: refund.id,
        paymentId: refund.payment_id,
        status: refund.status,
      });

      return refund;
    } catch (err) {
      logger.error('Razorpay refund failed', {
        paymentId,
        error: err.message,
        statusCode: err.statusCode,
      });
      throw new RazorpayGatewayError(
        'Failed to process refund on payment gateway.',
        { gatewayError: err.message }
      );
    }
  }

  /**
   * Timing-safe HMAC-SHA256 Razorpay payment signature verification (frontend verify endpoint).
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

  /**
   * Timing-safe HMAC-SHA256 Razorpay webhook signature verification over raw request body.
   *
   * @param {{
   *   rawBody: Buffer | string,
   *   signature: string,
   *   secret?: string
   * }} params
   * @returns {boolean}
   */
  verifyWebhookSignature({
    rawBody,
    signature,
    secret = this.webhookSecret,
  }) {
    if (!rawBody || !signature || !secret) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch (err) {
      logger.warn('Razorpay webhook signature comparison error', {
        error: err.message,
      });
      return false;
    }
  }
}

export const razorpayGateway = new RazorpayGateway();
export default razorpayGateway;
