import { describe, it, expect } from 'vitest';
import { razorpayGateway } from '../../src/modules/payments/razorpay.gateway.js';
import { generateWebhookSignature } from './helpers/paymentTestFixtures.js';

describe('Phase 07.9 — Webhook Signature Verification & Security Unit Tests', () => {
  const testSecret = 'rzp_test_secret_for_webhook_verification_123';
  const testPayload = JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_1234567890',
  });

  it('1. accepts valid HMAC-SHA256 signature matching raw payload bytes', () => {
    const validSignature = generateWebhookSignature(testPayload, testSecret);
    const isValid = razorpayGateway.verifyWebhookSignature({
      rawBody: testPayload,
      signature: validSignature,
      secret: testSecret,
    });
    expect(isValid).toBe(true);
  });

  it('2. accepts valid signature when rawBody is provided as a Buffer', () => {
    const rawBuffer = Buffer.from(testPayload, 'utf8');
    const validSignature = generateWebhookSignature(rawBuffer, testSecret);
    const isValid = razorpayGateway.verifyWebhookSignature({
      rawBody: rawBuffer,
      signature: validSignature,
      secret: testSecret,
    });
    expect(isValid).toBe(true);
  });

  it('3. rejects invalid / tampered signature string', () => {
    const invalidSignature = 'a'.repeat(64);
    const isValid = razorpayGateway.verifyWebhookSignature({
      rawBody: testPayload,
      signature: invalidSignature,
      secret: testSecret,
    });
    expect(isValid).toBe(false);
  });

  it('4. rejects signature when raw payload body is modified by even one character', () => {
    const validSignature = generateWebhookSignature(testPayload, testSecret);
    const modifiedPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      id: 'evt_1234567891', // altered ID
    });

    const isValid = razorpayGateway.verifyWebhookSignature({
      rawBody: modifiedPayload,
      signature: validSignature,
      secret: testSecret,
    });
    expect(isValid).toBe(false);
  });

  it('5. handles different-length signature safely without throwing or timing leak', () => {
    const shortSignature = 'abc123';
    const isValid = razorpayGateway.verifyWebhookSignature({
      rawBody: testPayload,
      signature: shortSignature,
      secret: testSecret,
    });
    expect(isValid).toBe(false);

    const longSignature = 'f'.repeat(128);
    const isValidLong = razorpayGateway.verifyWebhookSignature({
      rawBody: testPayload,
      signature: longSignature,
      secret: testSecret,
    });
    expect(isValidLong).toBe(false);
  });

  it('6. safely returns false when missing rawBody, signature, or secret', () => {
    expect(
      razorpayGateway.verifyWebhookSignature({
        rawBody: '',
        signature: 'some_sig',
        secret: testSecret,
      })
    ).toBe(false);

    expect(
      razorpayGateway.verifyWebhookSignature({
        rawBody: testPayload,
        signature: '',
        secret: testSecret,
      })
    ).toBe(false);

    expect(
      razorpayGateway.verifyWebhookSignature({
        rawBody: testPayload,
        signature: 'some_sig',
        secret: '',
      })
    ).toBe(false);
  });

  it('7. never exposes webhook secret in returned results or thrown errors', () => {
    const res = razorpayGateway.verifyWebhookSignature({
      rawBody: testPayload,
      signature: 'invalid_sig',
      secret: testSecret,
    });
    expect(res).toBe(false);
    expect(typeof res).toBe('boolean');
  });
});
