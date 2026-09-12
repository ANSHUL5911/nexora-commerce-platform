import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { idempotencyRepository } from '../../src/modules/idempotency/idempotency.repository.js';
import { IdempotencyRecord } from '../../src/models/index.js';
import {
  IdempotencyPayloadMismatchError,
  IdempotencyInProgressError,
} from '../../src/modules/idempotency/idempotency.errors.js';
import {
  createTestUser,
  createTestOrder,
  createTestOrderItem,
  createTestProduct,
  createTestPaymentAttempt,
  cleanupPaymentTables,
} from '../payments/helpers/paymentTestFixtures.js';

describe('Phase 07.10 — Idempotency Repository Unit & Recovery Tests', () => {
  beforeEach(async () => {
    await cleanupPaymentTables();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

  describe('1. Atomic Key Claiming', () => {
    it('successfully claims a new idempotency key (status: IN_PROGRESS)', async () => {
      const key = `order_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test_payload').digest('hex');

      const result = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      expect(result.claimed).toBe(true);
      expect(result.replayed).toBe(false);
      expect(result.record).toBeDefined();
      expect(result.record.idempotency_key).toBe(key);
      expect(result.record.status).toBe('IN_PROGRESS');
      expect(result.record.request_hash).toBe(hash);
    });

    it('rejects concurrent/in-progress duplicate request with IdempotencyInProgressError', async () => {
      const key = `order_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test_payload').digest('hex');

      await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      await expect(
        idempotencyRepository.claimKey({
          idempotencyKey: key,
          requestPath: '/api/orders',
          requestHash: hash,
        })
      ).rejects.toThrow(IdempotencyInProgressError);
    });

    it('rejects reused key with different request payload hash with IdempotencyPayloadMismatchError', async () => {
      const key = `order_key_${crypto.randomUUID()}`;
      const hashA = crypto.createHash('sha256').update('payload_A').digest('hex');
      const hashB = crypto.createHash('sha256').update('payload_B').digest('hex');

      await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hashA,
      });

      await expect(
        idempotencyRepository.claimKey({
          idempotencyKey: key,
          requestPath: '/api/orders',
          requestHash: hashB,
        })
      ).rejects.toThrow(IdempotencyPayloadMismatchError);
    });

    it('returns cached replay when key is in COMPLETED status with matching hash', async () => {
      const key = `order_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test_payload').digest('hex');

      const firstClaim = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      const mockResponseBody = { success: true, orderId: crypto.randomUUID() };
      await idempotencyRepository.completeRecord(firstClaim.record.id, {
        responseCode: 201,
        responseBody: mockResponseBody,
      });

      const replayResult = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      expect(replayResult.claimed).toBe(false);
      expect(replayResult.replayed).toBe(true);
      expect(replayResult.record.status).toBe('COMPLETED');
      expect(replayResult.record.response_code).toBe(201);
      expect(replayResult.record.response_body).toEqual(mockResponseBody);
    });

    it('safely re-claims an idempotency key when status is FAILED_RETRYABLE', async () => {
      const key = `order_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test_payload').digest('hex');

      const claim = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      await idempotencyRepository.markFailedRetryable(claim.record.id);

      const reClaim = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      expect(reClaim.claimed).toBe(true);
      expect(reClaim.replayed).toBe(false);
      expect(reClaim.record.status).toBe('IN_PROGRESS');
    });
  });

  describe('2. Crash & Interrupted IN_PROGRESS Recovery', () => {
    it('recovers and completes an IN_PROGRESS order creation when Order was already committed to DB', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });
      await createTestOrderItem({ orderId: order.id, productId: product.id });

      const key = `order_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('order_payload').digest('hex');

      // Simulate crash after Phase A DB commit: order_id is linked to IN_PROGRESS record
      await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/orders',
        status: 'IN_PROGRESS',
        request_hash: hash,
        order_id: order.id,
        expires_at: new Date(Date.now() + 100000),
      });

      const recoveryResult = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/orders',
        requestHash: hash,
      });

      expect(recoveryResult.claimed).toBe(false);
      expect(recoveryResult.replayed).toBe(true);
      expect(recoveryResult.record.status).toBe('COMPLETED');
      expect(recoveryResult.record.response_code).toBe(201);
      expect(recoveryResult.record.response_body.id).toBe(order.id);
    });

    it('recovers and completes an IN_PROGRESS payment initiation when PaymentAttempt has razorpay_order_id', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });
      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: 'order_rzp_persisted_999',
      });

      const key = `payment_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('payment_payload').digest('hex');

      // Simulate crash after razorpay_order_id persisted: payment_attempt_id is linked
      await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/payments/create-order',
        status: 'IN_PROGRESS',
        request_hash: hash,
        order_id: order.id,
        payment_attempt_id: attempt.id,
        expires_at: new Date(Date.now() + 100000),
      });

      const recoveryResult = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/payments/create-order',
        requestHash: hash,
      });

      expect(recoveryResult.claimed).toBe(false);
      expect(recoveryResult.replayed).toBe(true);
      expect(recoveryResult.record.status).toBe('COMPLETED');
      expect(recoveryResult.record.response_code).toBe(201);
      expect(recoveryResult.record.response_body.razorpayOrderId).toBe('order_rzp_persisted_999');
    });

    it('marks attempt FAILED and idempotency FAILED_RETRYABLE when attempt has NULL razorpay_order_id', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });
      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        razorpayOrderId: null,
      });

      const key = `payment_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('payment_payload').digest('hex');

      await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/payments/create-order',
        status: 'IN_PROGRESS',
        request_hash: hash,
        order_id: order.id,
        payment_attempt_id: attempt.id,
        expires_at: new Date(Date.now() + 100000),
      });

      await expect(
        idempotencyRepository.claimKey({
          idempotencyKey: key,
          requestPath: '/api/payments/create-order',
          requestHash: hash,
        })
      ).rejects.toThrow(IdempotencyInProgressError);

      await attempt.reload();
      expect(attempt.status).toBe('FAILED');
      expect(attempt.failure_reason).toBe('GATEWAY_ERROR');

      const updatedRecord = await IdempotencyRecord.findOne({
        where: { idempotency_key: key, request_path: '/api/payments/create-order' },
      });
      expect(updatedRecord.status).toBe('FAILED_RETRYABLE');
    });
  });
});
