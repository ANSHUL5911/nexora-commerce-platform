import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { IdempotencyRecord } from '../../src/models/index.js';
import {
  createTestUser,
  createTestOrder,
  createTestPaymentAttempt,
  cleanupPaymentTables,
} from '../payments/helpers/paymentTestFixtures.js';

describe('Phase 07.10 — IdempotencyRecord Model & Database Integrity Tests', () => {
  beforeEach(async () => {
    await cleanupPaymentTables();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

  describe('1. Model Attributes & Defaults', () => {
    it('creates an IdempotencyRecord with valid UUID and default IN_PROGRESS status', async () => {
      const key = `key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test_payload').digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const record = await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/orders',
        request_hash: hash,
        expires_at: expiresAt,
      });

      expect(record.id).toBeDefined();
      expect(record.idempotency_key).toBe(key);
      expect(record.request_path).toBe('/api/orders');
      expect(record.status).toBe('IN_PROGRESS');
      expect(record.request_hash).toBe(hash);
      expect(record.expires_at).toBeDefined();
      expect(record.created_at).toBeDefined();
      expect(record.updated_at).toBeDefined();
    });

    it('rejects null idempotency_key with ValidationError', async () => {
      const hash = crypto.createHash('sha256').update('test').digest('hex');
      await expect(
        IdempotencyRecord.create({
          idempotency_key: null,
          request_path: '/api/orders',
          request_hash: hash,
          expires_at: new Date(),
        })
      ).rejects.toThrow();
    });

    it('rejects null request_path with ValidationError', async () => {
      const hash = crypto.createHash('sha256').update('test').digest('hex');
      await expect(
        IdempotencyRecord.create({
          idempotency_key: 'test_key',
          request_path: null,
          request_hash: hash,
          expires_at: new Date(),
        })
      ).rejects.toThrow();
    });

    it('rejects null request_hash with ValidationError', async () => {
      await expect(
        IdempotencyRecord.create({
          idempotency_key: 'test_key',
          request_path: '/api/orders',
          request_hash: null,
          expires_at: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  describe('2. Lifecycle Status & CHECK Constraints', () => {
    it('accepts all valid statuses (IN_PROGRESS, COMPLETED, FAILED_RETRYABLE)', async () => {
      const hash = crypto.createHash('sha256').update('test').digest('hex');

      for (const status of ['IN_PROGRESS', 'COMPLETED', 'FAILED_RETRYABLE']) {
        const record = await IdempotencyRecord.create({
          idempotency_key: `key_${crypto.randomUUID()}`,
          request_path: '/api/orders',
          status,
          request_hash: hash,
          expires_at: new Date(Date.now() + 100000),
        });

        expect(record.status).toBe(status);
      }
    });

    it('rejects invalid status values via PostgreSQL CHECK constraint', async () => {
      const hash = crypto.createHash('sha256').update('test').digest('hex');
      await expect(
        IdempotencyRecord.create({
          idempotency_key: 'invalid_status_key',
          request_path: '/api/orders',
          status: 'INVALID_STATUS',
          request_hash: hash,
          expires_at: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Scoped Uniqueness Constraint (uq_idempotency_scope)', () => {
    it('rejects duplicate (idempotency_key, request_path) records', async () => {
      const key = `key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test').digest('hex');

      await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/orders',
        status: 'IN_PROGRESS',
        request_hash: hash,
        expires_at: new Date(Date.now() + 100000),
      });

      await expect(
        IdempotencyRecord.create({
          idempotency_key: key,
          request_path: '/api/orders',
          status: 'IN_PROGRESS',
          request_hash: hash,
          expires_at: new Date(Date.now() + 100000),
        })
      ).rejects.toThrow();
    });

    it('permits identical idempotency_key across different request_path scopes', async () => {
      const key = `shared_key_${crypto.randomUUID()}`;
      const hash = crypto.createHash('sha256').update('test').digest('hex');

      const recordA = await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/orders',
        status: 'IN_PROGRESS',
        request_hash: hash,
        expires_at: new Date(Date.now() + 100000),
      });

      const recordB = await IdempotencyRecord.create({
        idempotency_key: key,
        request_path: '/api/payments/create-order',
        status: 'IN_PROGRESS',
        request_hash: hash,
        expires_at: new Date(Date.now() + 100000),
      });

      expect(recordA.id).toBeDefined();
      expect(recordB.id).toBeDefined();
      expect(recordA.id).not.toBe(recordB.id);
    });
  });

  describe('4. Associations & Foreign Keys', () => {
    it('links to Order and PaymentAttempt with ON DELETE SET NULL', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });
      const attempt = await createTestPaymentAttempt({ orderId: order.id });
      const hash = crypto.createHash('sha256').update('test').digest('hex');

      const record = await IdempotencyRecord.create({
        idempotency_key: `key_${crypto.randomUUID()}`,
        request_path: '/api/payments/create-order',
        status: 'COMPLETED',
        request_hash: hash,
        order_id: order.id,
        payment_attempt_id: attempt.id,
        response_code: 201,
        response_body: { success: true },
        expires_at: new Date(Date.now() + 100000),
      });

      expect(record.order_id).toBe(order.id);
      expect(record.payment_attempt_id).toBe(attempt.id);

      // Verify ON DELETE SET NULL
      await attempt.destroy();
      await record.reload();
      expect(record.payment_attempt_id).toBeNull();
      expect(record.order_id).toBe(order.id);
    });
  });
});
