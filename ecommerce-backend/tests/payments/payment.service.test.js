import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { paymentService } from '../../src/modules/payments/payment.service.js';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import { PaymentAttempt } from '../../src/models/PaymentAttempt.js';
import { Order } from '../../src/models/Order.js';
import { Product } from '../../src/models/Product.js';
import { InventoryReservation } from '../../src/models/InventoryReservation.js';
import {
  OrderNotFoundError,
} from '../../src/modules/orders/order.errors.js';
import {
  OrderNotPayableError,
  PaymentVerificationError,
  InvalidPaymentSignatureError,
  RazorpayGatewayError,
} from '../../src/modules/payments/payment.errors.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  createTestReservation,
  createTestPaymentAttempt,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';

describe('Phase 07.8 — Payment Service Business Logic & Concurrency Tests', () => {
  beforeEach(async () => {
    await cleanupPaymentTables();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
    vi.restoreAllMocks();
  });

  describe('1. Payment Initiation & Amount Integrity', () => {
    it('creates PaymentAttempt strictly from server-side order total and returns safe DTO', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ pricePaise: 500000, stockQuantity: 10, reservedQuantity: 1 });
      const order = await createTestOrder({
        userId: user.id,
        orderStatus: 'PENDING_PAYMENT',
        totalCostPaise: 510000, // ₹5,100.00
      });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 1, status: 'ACTIVE' });

      const mockRzpOrder = {
        id: 'order_rzp_mock_123',
        amount: 510000,
        currency: 'INR',
        status: 'created',
      };
      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValue(mockRzpOrder);

      const result = await paymentService.initiatePayment({
        orderId: order.id,
        userId: user.id,
        role: 'customer',
      });

      expect(result.orderId).toBe(order.id);
      expect(result.amountPaise).toBe(510000);
      expect(result.currency).toBe('INR');
      expect(result.attemptNumber).toBe(1);
      expect(result.razorpayOrderId).toBe('order_rzp_mock_123');
      expect(result.razorpayKeyId).toBeDefined();

      const attemptInDb = await PaymentAttempt.findOne({ where: { order_id: order.id } });
      expect(attemptInDb).not.toBeNull();
      expect(attemptInDb.status).toBe('INITIATED');
      expect(attemptInDb.amount_paise).toBe(510000);
      expect(attemptInDb.razorpay_order_id).toBe('order_rzp_mock_123');
    });

    it('rejects payment initiation when order status is not PENDING_PAYMENT', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({
        userId: user.id,
        orderStatus: 'CANCELLED',
      });
      await createTestReservation({ orderId: order.id, productId: product.id });

      await expect(
        paymentService.initiatePayment({
          orderId: order.id,
          userId: user.id,
          role: 'customer',
        })
      ).rejects.toThrow(OrderNotPayableError);
    });

    it('rejects payment initiation when inventory reservation is missing or expired', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({
        userId: user.id,
        orderStatus: 'PENDING_PAYMENT',
      });
      // No reservation created

      await expect(
        paymentService.initiatePayment({
          orderId: order.id,
          userId: user.id,
          role: 'customer',
        })
      ).rejects.toThrow(OrderNotPayableError);
    });
  });

  describe('2. Anti-IDOR Authorization Defenses', () => {
    it('rejects User B attempting to initiate payment on User A order with sanitized 404', async () => {
      const userA = await createTestUser({ email: 'usera@example.com' });
      const userB = await createTestUser({ email: 'userb@example.com' });
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: userA.id });
      await createTestReservation({ orderId: order.id, productId: product.id });

      await expect(
        paymentService.initiatePayment({
          orderId: order.id,
          userId: userB.id,
          role: 'customer',
        })
      ).rejects.toThrow(OrderNotFoundError);
    });

    it('rejects User B attempting to verify payment on User A order with sanitized 404', async () => {
      const userA = await createTestUser({ email: 'usera2@example.com' });
      const userB = await createTestUser({ email: 'userb2@example.com' });
      const order = await createTestOrder({ userId: userA.id });

      await expect(
        paymentService.verifyPayment({
          orderId: order.id,
          razorpayOrderId: 'order_123',
          razorpayPaymentId: 'pay_123',
          razorpaySignature: 'sig_123',
          userId: userB.id,
          role: 'customer',
        })
      ).rejects.toThrow(OrderNotFoundError);
    });
  });

  describe('3. Transaction Boundary & Gateway Failure Recovery', () => {
    it('commits PaymentAttempt to PostgreSQL BEFORE invoking external Razorpay API', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });
      await createTestReservation({ orderId: order.id, productId: product.id });

      let recordExistedDuringGatewayCall = false;

      vi.spyOn(razorpayGateway, 'createOrder').mockImplementation(async ({ notes }) => {
        // Query database outside the transaction to verify it was committed
        const attempt = await PaymentAttempt.findByPk(notes.paymentAttemptId);
        if (attempt && attempt.status === 'INITIATED') {
          recordExistedDuringGatewayCall = true;
        }
        return {
          id: 'order_rzp_tx_verified',
          amount: 510000,
          currency: 'INR',
          status: 'created',
        };
      });

      await paymentService.initiatePayment({
        orderId: order.id,
        userId: user.id,
        role: 'customer',
      });

      expect(recordExistedDuringGatewayCall).toBe(true);
    });

    it('transitions PaymentAttempt to FAILED on gateway error, leaving Order PENDING_PAYMENT and stock untouched', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });
      const order = await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 2 });

      vi.spyOn(razorpayGateway, 'createOrder').mockRejectedValue(
        new Error('Network timeout to gateway')
      );

      await expect(
        paymentService.initiatePayment({
          orderId: order.id,
          userId: user.id,
          role: 'customer',
        })
      ).rejects.toThrow(RazorpayGatewayError);

      const attempt = await PaymentAttempt.findOne({ where: { order_id: order.id } });
      expect(attempt).not.toBeNull();
      expect(attempt.status).toBe('FAILED');
      expect(attempt.failure_reason).toBe('GATEWAY_ERROR');

      // Order must remain PENDING_PAYMENT
      const reloadedOrder = await Order.findByPk(order.id);
      expect(reloadedOrder.order_status).toBe('PENDING_PAYMENT');

      // Inventory must remain unchanged
      const reloadedProduct = await Product.findByPk(product.id);
      expect(reloadedProduct.stock_quantity).toBe(10);
      expect(reloadedProduct.reserved_quantity).toBe(2);
    });
  });

  describe('4. Payment Retry Engine', () => {
    it('creates attempt #2 with new Razorpay Order ID referencing SAME ecommerce Order', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });
      await createTestReservation({ orderId: order.id, productId: product.id });

      // Attempt 1: Failed on gateway
      await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        razorpayOrderId: 'order_rzp_first_failed',
        status: 'FAILED',
        failureReason: 'GATEWAY_ERROR',
      });

      vi.spyOn(razorpayGateway, 'createOrder').mockResolvedValue({
        id: 'order_rzp_second_retry',
        amount: 510000,
        currency: 'INR',
        status: 'created',
      });

      const retryResult = await paymentService.retryPayment({
        orderId: order.id,
        userId: user.id,
        role: 'customer',
      });

      expect(retryResult.orderId).toBe(order.id);
      expect(retryResult.attemptNumber).toBe(2);
      expect(retryResult.razorpayOrderId).toBe('order_rzp_second_retry');

      const attempts = await PaymentAttempt.findAll({
        where: { order_id: order.id },
        order: [['attempt_number', 'ASC']],
      });

      expect(attempts).toHaveLength(2);
      expect(attempts[0].attempt_number).toBe(1);
      expect(attempts[0].status).toBe('FAILED');
      expect(attempts[0].razorpay_order_id).toBe('order_rzp_first_failed');

      expect(attempts[1].attempt_number).toBe(2);
      expect(attempts[1].status).toBe('INITIATED');
      expect(attempts[1].razorpay_order_id).toBe('order_rzp_second_retry');

      // Assert only 1 ecommerce Order exists
      const orderCount = await Order.count({ where: { id: order.id } });
      expect(orderCount).toBe(1);
    });
  });

  describe('5. Shared Domain Settlement (settleCapturedPayment)', () => {
    it('atomically marks PaymentAttempt SUCCESS, Order PAID, and converts inventory reservation', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });
      const order = await createTestOrder({ userId: user.id, totalCostPaise: 500000 });
      const res = await createTestReservation({ orderId: order.id, productId: product.id, quantity: 2 });
      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        amountPaise: 500000,
        status: 'INITIATED',
      });

      const result = await paymentService.settleCapturedPayment({
        orderId: order.id,
        paymentAttemptId: attempt.id,
        razorpayPaymentId: 'pay_rzp_success_001',
      });

      expect(result.settled).toBe(true);
      expect(result.order.order_status).toBe('PAID');
      expect(result.paymentAttempt.status).toBe('SUCCESS');
      expect(result.paymentAttempt.razorpay_payment_id).toBe('pay_rzp_success_001');

      // Verify reservation was CONVERTED
      const updatedRes = await InventoryReservation.findByPk(res.id);
      expect(updatedRes.status).toBe('CONVERTED');

      // Verify product stock was permanently deducted (10 - 2 = 8, reserved 2 - 2 = 0)
      const updatedProduct = await Product.findByPk(product.id);
      expect(updatedProduct.stock_quantity).toBe(8);
      expect(updatedProduct.reserved_quantity).toBe(0);
    });

    it('is idempotent on duplicate settlement calls without double inventory deduction', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 10, reservedQuantity: 2 });
      const order = await createTestOrder({ userId: user.id, totalCostPaise: 500000 });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 2 });
      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        amountPaise: 500000,
        status: 'INITIATED',
      });

      // First call
      await paymentService.settleCapturedPayment({
        orderId: order.id,
        paymentAttemptId: attempt.id,
        razorpayPaymentId: 'pay_rzp_001',
      });

      // Second call (replay / duplicate)
      const replayResult = await paymentService.settleCapturedPayment({
        orderId: order.id,
        paymentAttemptId: attempt.id,
        razorpayPaymentId: 'pay_rzp_001',
      });

      expect(replayResult.settled).toBe(true);

      // Stock must NOT be deducted a second time (still 8, not 6)
      const productAfterReplay = await Product.findByPk(product.id);
      expect(productAfterReplay.stock_quantity).toBe(8);
      expect(productAfterReplay.reserved_quantity).toBe(0);
    });
  });

  describe('6. Payment Verification Flow (verifyPayment)', () => {
    it('verifies signature, checks gateway capture, and settles payment', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ stockQuantity: 5, reservedQuantity: 1 });
      const order = await createTestOrder({ userId: user.id, totalCostPaise: 500000 });
      await createTestReservation({ orderId: order.id, productId: product.id, quantity: 1 });
      const rzpOrderId = 'order_valid_rzp_123';
      const rzpPaymentId = 'pay_valid_rzp_456';

      await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        amountPaise: 500000,
        status: 'INITIATED',
      });

      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      vi.spyOn(razorpayGateway, 'fetchPayment').mockResolvedValue({
        id: rzpPaymentId,
        order_id: rzpOrderId,
        status: 'captured',
        amount: 500000,
        currency: 'INR',
        captured: true,
      });

      const verificationResult = await paymentService.verifyPayment({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: 'valid_mock_signature',
        userId: user.id,
        role: 'customer',
      });

      expect(verificationResult.settled).toBe(true);
      expect(verificationResult.orderStatus).toBe('PAID');
      expect(verificationResult.paymentStatus).toBe('SUCCESS');
      expect(verificationResult.razorpayPaymentId).toBe(rzpPaymentId);

      const reloadedOrder = await Order.findByPk(order.id);
      expect(reloadedOrder.order_status).toBe('PAID');
    });

    it('rejects invalid signature and marks PaymentAttempt FAILED', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });
      const rzpOrderId = 'order_invalid_sig';
      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        status: 'INITIATED',
      });

      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(false);

      await expect(
        paymentService.verifyPayment({
          orderId: order.id,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: 'pay_123',
          razorpaySignature: 'invalid_signature_string',
          userId: user.id,
          role: 'customer',
        })
      ).rejects.toThrow(InvalidPaymentSignatureError);

      const reloadedAttempt = await PaymentAttempt.findByPk(attempt.id);
      expect(reloadedAttempt.status).toBe('FAILED');
      expect(reloadedAttempt.failure_reason).toBe('INVALID_SIGNATURE');
    });

    it('rejects payment if gateway status is not captured', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id, totalCostPaise: 500000 });
      const rzpOrderId = 'order_not_captured';
      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        amountPaise: 500000,
        status: 'INITIATED',
      });

      vi.spyOn(razorpayGateway, 'verifySignature').mockReturnValue(true);
      vi.spyOn(razorpayGateway, 'fetchPayment').mockResolvedValue({
        id: 'pay_authorized_only',
        order_id: rzpOrderId,
        status: 'authorized', // Not captured
        amount: 500000,
        currency: 'INR',
        captured: false,
      });

      await expect(
        paymentService.verifyPayment({
          orderId: order.id,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: 'pay_authorized_only',
          razorpaySignature: 'valid_sig',
          userId: user.id,
          role: 'customer',
        })
      ).rejects.toThrow(PaymentVerificationError);

      const reloadedAttempt = await PaymentAttempt.findByPk(attempt.id);
      expect(reloadedAttempt.status).toBe('FAILED');
      expect(reloadedAttempt.failure_reason).toBe('NOT_CAPTURED');
    });
  });
});
