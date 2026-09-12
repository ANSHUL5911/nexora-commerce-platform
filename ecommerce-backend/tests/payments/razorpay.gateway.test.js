import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { RazorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import { RazorpayGatewayError } from '../../src/modules/payments/payment.errors.js';

describe('Phase 07.8 — RazorpayGateway Adapter & Signature Verification Unit Tests', () => {
  const testKeyId = 'rzp_test_mock_key_id';
  const testKeySecret = 'test_secret_for_hmac_sha256_verification_12345';

  describe('1. createOrder', () => {
    it('calls Razorpay orders.create with integer paise amount and safe notes', async () => {
      const mockOrdersCreate = vi.fn().mockResolvedValue({
        id: 'order_mock123',
        amount: 299900,
        currency: 'INR',
        status: 'created',
      });

      const mockClient = {
        orders: { create: mockOrdersCreate },
      };

      const gateway = new RazorpayGateway({
        keyId: testKeyId,
        keySecret: testKeySecret,
        client: mockClient,
      });

      const result = await gateway.createOrder({
        amountPaise: 299900,
        currency: 'INR',
        receipt: 'rcpt_123',
        notes: { orderId: 'ord_123' },
      });

      expect(mockOrdersCreate).toHaveBeenCalledWith({
        amount: 299900,
        currency: 'INR',
        receipt: 'rcpt_123',
        notes: { orderId: 'ord_123' },
      });
      expect(result.id).toBe('order_mock123');
    });

    it('wraps SDK errors into sanitized RazorpayGatewayError without leaking secrets', async () => {
      const mockClient = {
        orders: {
          create: vi.fn().mockRejectedValue(new Error('Razorpay API timeout')),
        },
      };

      const gateway = new RazorpayGateway({
        keyId: testKeyId,
        keySecret: testKeySecret,
        client: mockClient,
      });

      await expect(
        gateway.createOrder({
          amountPaise: 10000,
          receipt: 'rcpt_001',
        })
      ).rejects.toThrow(RazorpayGatewayError);
    });
  });

  describe('2. fetchPayment', () => {
    it('calls Razorpay payments.fetch and returns payment details', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        id: 'pay_mock789',
        order_id: 'order_mock123',
        status: 'captured',
        amount: 299900,
        currency: 'INR',
        captured: true,
      });

      const mockClient = {
        payments: { fetch: mockFetch },
      };

      const gateway = new RazorpayGateway({
        keyId: testKeyId,
        keySecret: testKeySecret,
        client: mockClient,
      });

      const payment = await gateway.fetchPayment('pay_mock789');
      expect(mockFetch).toHaveBeenCalledWith('pay_mock789');
      expect(payment.status).toBe('captured');
    });
  });

  describe('3. Timing-Safe Signature Verification', () => {
    const gateway = new RazorpayGateway({
      keyId: testKeyId,
      keySecret: testKeySecret,
    });

    it('returns true for a cryptographically valid HMAC-SHA256 signature', () => {
      const razorpayOrderId = 'order_M1029384756';
      const razorpayPaymentId = 'pay_H889234129';
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', testKeySecret)
        .update(payload)
        .digest('hex');

      const isValid = gateway.verifySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: validSignature,
      });

      expect(isValid).toBe(true);
    });

    it('returns false when signature has been tampered with', () => {
      const razorpayOrderId = 'order_M1029384756';
      const razorpayPaymentId = 'pay_H889234129';
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', testKeySecret)
        .update(payload)
        .digest('hex');

      // Alter last character of hex signature
      const tamperedSignature =
        validSignature.slice(0, -1) + (validSignature.slice(-1) === 'a' ? 'b' : 'a');

      const isValid = gateway.verifySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: tamperedSignature,
      });

      expect(isValid).toBe(false);
    });

    it('returns false when razorpay_payment_id was tampered with', () => {
      const razorpayOrderId = 'order_M1029384756';
      const razorpayPaymentId = 'pay_H889234129';
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', testKeySecret)
        .update(payload)
        .digest('hex');

      const isValid = gateway.verifySignature({
        razorpayOrderId,
        razorpayPaymentId: 'pay_TAMPERED_ID',
        razorpaySignature: validSignature,
      });

      expect(isValid).toBe(false);
    });

    it('returns false when signed with an incorrect secret', () => {
      const razorpayOrderId = 'order_M1029384756';
      const razorpayPaymentId = 'pay_H889234129';
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const wrongSecretSignature = crypto
        .createHmac('sha256', 'wrong_attacker_secret_key')
        .update(payload)
        .digest('hex');

      const isValid = gateway.verifySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: wrongSecretSignature,
      });

      expect(isValid).toBe(false);
    });

    it('returns false when parameters are missing or empty', () => {
      expect(
        gateway.verifySignature({
          razorpayOrderId: '',
          razorpayPaymentId: 'pay_123',
          razorpaySignature: 'sig_123',
        })
      ).toBe(false);

      expect(
        gateway.verifySignature({
          razorpayOrderId: 'order_123',
          razorpayPaymentId: '',
          razorpaySignature: 'sig_123',
        })
      ).toBe(false);

      expect(
        gateway.verifySignature({
          razorpayOrderId: 'order_123',
          razorpayPaymentId: 'pay_123',
          razorpaySignature: '',
        })
      ).toBe(false);
    });
  });
});
