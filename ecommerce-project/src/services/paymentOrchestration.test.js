import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openRazorpayCheckout, retryAndPayOrder } from './paymentOrchestration.js';
import { paymentsApi } from '../api/payments.js';

vi.mock('../api/payments.js', () => ({
  paymentsApi: {
    retryPayment: vi.fn(),
    verifyPayment: vi.fn(),
  },
  default: {
    retryPayment: vi.fn(),
    verifyPayment: vi.fn(),
  },
}));

describe('paymentOrchestration Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openRazorpayCheckout', () => {
    it('invokes onError when window.Razorpay SDK is missing', () => {
      const originalRazorpay = window.Razorpay;
      delete window.Razorpay;

      const onError = vi.fn();
      openRazorpayCheckout({
        paymentData: { razorpayOrderId: 'order_123', razorpayKeyId: 'rzp_key' },
        orderId: 'ord-abc',
        onError,
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Secure payment checkout could not be loaded. Please refresh and try again.',
        })
      );

      window.Razorpay = originalRazorpay;
    });

    it('invokes onError when paymentData is missing razorpayOrderId or razorpayKey', () => {
      window.Razorpay = vi.fn();
      const onError = vi.fn();

      openRazorpayCheckout({
        paymentData: { razorpayOrderId: null, razorpayKeyId: 'rzp_key' },
        orderId: 'ord-abc',
        onError,
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Secure payment checkout could not be loaded. Please refresh and try again.',
        })
      );
    });

    it('initializes window.Razorpay and invokes open()', () => {
      const mockOpen = vi.fn();
      let capturedOptions = null;
      window.Razorpay = vi.fn().mockImplementation((opts) => {
        capturedOptions = opts;
        return { open: mockOpen };
      });

      openRazorpayCheckout({
        paymentData: {
          razorpayOrderId: 'order_rzp_123',
          razorpayKeyId: 'rzp_test_key',
          amountPaise: 250000,
          currency: 'INR',
        },
        orderId: 'order-uuid-999',
      });

      expect(window.Razorpay).toHaveBeenCalled();
      expect(capturedOptions.key).toBe('rzp_test_key');
      expect(capturedOptions.amount).toBe(250000);
      expect(capturedOptions.order_id).toBe('order_rzp_123');
      expect(capturedOptions.currency).toBe('INR');
      expect(capturedOptions.name).toBe('Nexora Commerce');
      expect(capturedOptions.description).toBe('Order #order-uu');
      expect(mockOpen).toHaveBeenCalled();
    });

    it('handles successful verification via handler', async () => {
      let capturedOptions = null;
      window.Razorpay = vi.fn().mockImplementation((opts) => {
        capturedOptions = opts;
        return { open: vi.fn() };
      });

      const onBeforeVerify = vi.fn();
      const onVerified = vi.fn();
      const mockVerifyResult = { settled: true, orderStatus: 'PAID' };
      paymentsApi.verifyPayment.mockResolvedValue(mockVerifyResult);

      openRazorpayCheckout({
        paymentData: {
          razorpayOrderId: 'order_rzp_123',
          razorpayKeyId: 'rzp_test_key',
          amountPaise: 250000,
        },
        orderId: 'order-uuid-999',
        onBeforeVerify,
        onVerified,
      });

      await capturedOptions.handler({
        razorpay_payment_id: 'pay_123',
        razorpay_order_id: 'order_rzp_123',
        razorpay_signature: 'sig_abc',
      });

      expect(onBeforeVerify).toHaveBeenCalled();
      expect(paymentsApi.verifyPayment).toHaveBeenCalledWith({
        orderId: 'order-uuid-999',
        razorpayPaymentId: 'pay_123',
        razorpayOrderId: 'order_rzp_123',
        razorpaySignature: 'sig_abc',
      });
      expect(onVerified).toHaveBeenCalledWith(mockVerifyResult);
    });

    it('handles verification error via handler and passes error to onError', async () => {
      let capturedOptions = null;
      window.Razorpay = vi.fn().mockImplementation((opts) => {
        capturedOptions = opts;
        return { open: vi.fn() };
      });

      const onError = vi.fn();
      paymentsApi.verifyPayment.mockRejectedValue(new Error('Signature verification failed'));

      openRazorpayCheckout({
        paymentData: {
          razorpayOrderId: 'order_rzp_123',
          razorpayKeyId: 'rzp_test_key',
          amountPaise: 250000,
        },
        orderId: 'order-uuid-999',
        onError,
      });

      await capturedOptions.handler({
        razorpay_payment_id: 'pay_bad',
        razorpay_order_id: 'order_rzp_123',
        razorpay_signature: 'sig_bad',
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Signature verification failed',
        })
      );
    });

    it('triggers onDismiss when modal is closed', () => {
      let capturedOptions = null;
      window.Razorpay = vi.fn().mockImplementation((opts) => {
        capturedOptions = opts;
        return { open: vi.fn() };
      });

      const onDismiss = vi.fn();

      openRazorpayCheckout({
        paymentData: {
          razorpayOrderId: 'order_rzp_123',
          razorpayKeyId: 'rzp_test_key',
        },
        orderId: 'order-uuid-999',
        onDismiss,
      });

      capturedOptions.modal.ondismiss();
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('retryAndPayOrder', () => {
    it('calls paymentsApi.retryPayment and forwards to openRazorpayCheckout on success', async () => {
      const mockOpen = vi.fn();
      window.Razorpay = vi.fn().mockImplementation(() => ({ open: mockOpen }));

      paymentsApi.retryPayment.mockResolvedValue({
        success: true,
        data: {
          orderId: 'ord-123',
          paymentAttemptId: 'pa-2',
          attemptNumber: 2,
          razorpayOrderId: 'order_rzp_retry_456',
          razorpayKeyId: 'rzp_key_test',
          amountPaise: 300000,
          currency: 'INR',
        },
      });

      await retryAndPayOrder({
        orderId: 'ord-123',
      });

      expect(paymentsApi.retryPayment).toHaveBeenCalledWith({ orderId: 'ord-123' });
      expect(window.Razorpay).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalled();
    });

    it('invokes onError if paymentsApi.retryPayment fails', async () => {
      paymentsApi.retryPayment.mockRejectedValue(
        new Error('Inventory reservation for this order has expired. Please place a new order.')
      );

      const onError = vi.fn();
      await retryAndPayOrder({
        orderId: 'ord-expired',
        onError,
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Inventory reservation for this order has expired. Please place a new order.',
        })
      );
    });
  });
});
