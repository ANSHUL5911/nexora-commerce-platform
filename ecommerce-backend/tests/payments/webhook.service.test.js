import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { webhookService } from '../../src/modules/payments/webhook.service.js';
import { paymentEventRepository } from '../../src/modules/payments/paymentEvent.repository.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  createTestReservation,
  createTestPaymentAttempt,
  generateWebhookSignature,
  generateCapturedWebhookPayload,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';
import {
  WebhookSignatureVerificationError,
  WebhookPayloadValidationError,
  PaymentAttemptNotFoundError,
  PaymentVerificationError,
} from '../../src/modules/payments/payment.errors.js';

describe('Phase 07.9 — Webhook Service & Authoritative Settlement Unit Tests', () => {
  let user;
  let product;
  let order;
  let reservation;
  let paymentAttempt;
  const orderTotalPaise = 510000;

  beforeEach(async () => {
    await cleanupPaymentTables();

    user = await createTestUser();
    product = await createTestProduct({
      pricePaise: 500000,
      stockQuantity: 10,
      reservedQuantity: 1,
    });
    order = await createTestOrder({
      userId: user.id,
      totalCostPaise: orderTotalPaise,
      orderStatus: 'PENDING_PAYMENT',
    });
    reservation = await createTestReservation({
      orderId: order.id,
      productId: product.id,
      quantity: 1,
      status: 'ACTIVE',
    });
    paymentAttempt = await createTestPaymentAttempt({
      orderId: order.id,
      amountPaise: orderTotalPaise,
      status: 'INITIATED',
    });
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

  describe('A. Authoritative payment.captured Normal Settlement', () => {
    it('1. successfully settles captured payment, transitioning Order -> PAID, Attempt -> SUCCESS, Reservation -> CONVERTED', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
        currency: 'INR',
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });

      expect(result.status).toBe('processed');
      expect(result.details.settled).toBe(true);

      // Verify Order transition
      await order.reload();
      expect(order.order_status).toBe('PAID');

      // Verify PaymentAttempt transition
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('SUCCESS');
      expect(paymentAttempt.razorpay_payment_id).toBe(
        payload.payload.payment.entity.id
      );

      // Verify Reservation transition
      await reservation.reload();
      expect(reservation.status).toBe('CONVERTED');

      // Verify Product inventory permanently deducted
      await product.reload();
      expect(product.stock_quantity).toBe(9);
      expect(product.reserved_quantity).toBe(0);

      // Verify PaymentEvent recorded as PROCESSED
      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event).toBeDefined();
      expect(event.processing_status).toBe('PROCESSED');
      expect(event.order_id).toBe(order.id);
      expect(event.payment_attempt_id).toBe(paymentAttempt.id);
    });

    it('2. handles duplicate webhook delivery idempotently without double stock deduction', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      // First webhook delivery
      const res1 = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });
      expect(res1.status).toBe('processed');

      // Check stock after first
      await product.reload();
      expect(product.stock_quantity).toBe(9);

      // Second delivery with identical event_id
      const res2 = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });
      expect(res2.status).toBe('ignored_duplicate');

      // Stock must NOT be deducted again
      await product.reload();
      expect(product.stock_quantity).toBe(9);
      expect(product.reserved_quantity).toBe(0);
    });

    it('3. safely processes a new event ID for an already settled order (idempotent)', async () => {
      const payload1 = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody1 = JSON.stringify(payload1);
      const sig1 = generateWebhookSignature(rawBody1);

      await webhookService.processRazorpayWebhook({
        rawBody: rawBody1,
        signature: sig1,
        payload: payload1,
      });

      // Second webhook with DIFFERENT event ID but SAME order
      const payload2 = generateCapturedWebhookPayload({
        eventId: `evt_second_${crypto.randomBytes(4).toString('hex')}`,
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        razorpayPaymentId: payload1.payload.payment.entity.id,
        amountPaise: orderTotalPaise,
      });
      const rawBody2 = JSON.stringify(payload2);
      const sig2 = generateWebhookSignature(rawBody2);

      const res2 = await webhookService.processRazorpayWebhook({
        rawBody: rawBody2,
        signature: sig2,
        payload: payload2,
      });

      expect(res2.status).toBe('processed');
      expect(res2.details.idempotent).toBe(true);

      // Stock remains exactly 9 (one deduction only)
      await product.reload();
      expect(product.stock_quantity).toBe(9);
    });
  });

  describe('B. Signature & Payload Validation Failures', () => {
    it('4. rejects invalid webhook signature with WebhookSignatureVerificationError', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
      });
      const rawBody = JSON.stringify(payload);

      await expect(
        webhookService.processRazorpayWebhook({
          rawBody,
          signature: 'invalid_signature_hex',
          payload,
        })
      ).rejects.toThrow(WebhookSignatureVerificationError);
    });

    it('5. rejects payload missing event ID with WebhookPayloadValidationError', async () => {
      const payload = { event: 'payment.captured' };
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      await expect(
        webhookService.processRazorpayWebhook({
          rawBody,
          signature,
          payload,
        })
      ).rejects.toThrow(WebhookPayloadValidationError);
    });

    it('6. rejects payload missing payment entity', async () => {
      const payload = {
        id: 'evt_no_entity_123',
        event: 'payment.captured',
        payload: {},
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      await expect(
        webhookService.processRazorpayWebhook({
          rawBody,
          signature,
          payload,
        })
      ).rejects.toThrow(WebhookPayloadValidationError);
    });

    it('7. rejects non-INR currency webhook and marks PaymentEvent FAILED', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
        currency: 'USD',
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      await expect(
        webhookService.processRazorpayWebhook({
          rawBody,
          signature,
          payload,
        })
      ).rejects.toThrow(PaymentVerificationError);

      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('FAILED');
    });

    it('8. rejects amount mismatch against server-authoritative order total', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: 999999, // Mismatched amount
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      await expect(
        webhookService.processRazorpayWebhook({
          rawBody,
          signature,
          payload,
        })
      ).rejects.toThrow(PaymentVerificationError);

      // PaymentAttempt marked FAILED
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('FAILED');

      // Order remains PENDING_PAYMENT
      await order.reload();
      expect(order.order_status).toBe('PENDING_PAYMENT');

      // Stock is untouched
      await product.reload();
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(1);
    });

    it('9. rejects unmapped Razorpay Order ID with PaymentAttemptNotFoundError', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: 'order_completely_unknown_999',
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      await expect(
        webhookService.processRazorpayWebhook({
          rawBody,
          signature,
          payload,
        })
      ).rejects.toThrow(PaymentAttemptNotFoundError);

      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('FAILED');
    });
  });

  describe('C. Late Captured Payment Handling (REQUIRES_REFUND)', () => {
    it('10. flags PaymentEvent as REQUIRES_REFUND when payment arrives after Order is EXPIRED', async () => {
      // Transition order to EXPIRED
      await order.update({ order_status: 'EXPIRED' });

      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });

      expect(result.status).toBe('requires_refund');
      expect(result.details.lateCapture).toBe(true);

      // Invariant: Order must REMAIN EXPIRED (never converted to PAID)
      await order.reload();
      expect(order.order_status).toBe('EXPIRED');

      // Invariant: PaymentAttempt records financial capture truth as SUCCESS
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('SUCCESS');

      // Invariant: Inventory is NOT converted or mutated
      await product.reload();
      expect(product.stock_quantity).toBe(10);

      // Invariant: PaymentEvent is REQUIRES_REFUND
      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('REQUIRES_REFUND');
      expect(event.metadata_json.late_capture).toBe(true);
    });

    it('11. flags PaymentEvent as REQUIRES_REFUND when inventory reservation has expired at DB level', async () => {
      // Set reservation expiry in the past
      await reservation.update({
        expires_at: Sequelize.literal("CURRENT_TIMESTAMP - INTERVAL '5 minutes'"),
      });

      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });

      expect(result.status).toBe('requires_refund');

      // Order becomes EXPIRED
      await order.reload();
      expect(order.order_status).toBe('EXPIRED');

      // PaymentEvent is REQUIRES_REFUND
      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('REQUIRES_REFUND');
    });
  });

  describe('D. Unhandled Event Types', () => {
    it('12. safely records non-capture events (e.g. payment.failed) without mutating orders', async () => {
      const payload = {
        id: 'evt_unhandled_001',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_123',
              order_id: paymentAttempt.razorpay_order_id,
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });

      expect(result.status).toBe('ignored_unhandled_event');

      // Order remains PENDING_PAYMENT
      await order.reload();
      expect(order.order_status).toBe('PENDING_PAYMENT');

      // PaymentAttempt remains INITIATED
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('INITIATED');

      // PaymentEvent marked PROCESSED
      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('PROCESSED');
    });
  });

  describe('E. PaymentEvent Failure Recovery & Retry Semantics', () => {
    it('13. safely recovers and settles a previously FAILED PaymentEvent on webhook retry', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      // Simulate a previously failed event in DB with the same event_id
      await paymentEventRepository.createPaymentEvent({
        event_id: payload.id,
        event_type: 'payment.captured',
        processing_status: 'FAILED',
        metadata_json: { error: 'Transient connection timeout during previous attempt' },
      });

      // Webhook arrives as a retry from Razorpay with the SAME event_id
      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });

      expect(result.status).toBe('processed');
      expect(result.details.settled).toBe(true);

      // Order transitioned to PAID
      await order.reload();
      expect(order.order_status).toBe('PAID');

      // PaymentAttempt transitioned to SUCCESS
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('SUCCESS');

      // Stock deducted
      await product.reload();
      expect(product.stock_quantity).toBe(9);

      // Existing PaymentEvent recovered and transitioned from FAILED to PROCESSED
      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('PROCESSED');
    });

    it('14. safely recovers and settles an incomplete RECEIVED / PROCESSING PaymentEvent on retry', async () => {
      const payload = generateCapturedWebhookPayload({
        razorpayOrderId: paymentAttempt.razorpay_order_id,
        amountPaise: orderTotalPaise,
      });
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody);

      // Simulate an uncommitted / crashed previous delivery left in RECEIVED status
      await paymentEventRepository.createPaymentEvent({
        event_id: payload.id,
        event_type: 'payment.captured',
        processing_status: 'RECEIVED',
      });

      // Webhook arrives as a retry
      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload,
      });

      expect(result.status).toBe('processed');
      expect(result.details.settled).toBe(true);

      await order.reload();
      expect(order.order_status).toBe('PAID');

      const event = await paymentEventRepository.findByEventId(payload.id);
      expect(event.processing_status).toBe('PROCESSED');
    });
  });
});
