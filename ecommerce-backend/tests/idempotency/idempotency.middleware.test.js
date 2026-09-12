import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import {
  requireIdempotency,
  computeRequestHash,
  canonicalizePayload,
} from '../../src/modules/idempotency/idempotency.middleware.js';
import { idempotencyRepository } from '../../src/modules/idempotency/idempotency.repository.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { cleanupPaymentTables } from '../payments/helpers/paymentTestFixtures.js';

describe('Phase 07.10 — Idempotency Middleware & Fingerprinting Tests', () => {
  beforeEach(async () => {
    await cleanupPaymentTables();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

  describe('1. Canonical Fingerprinting & Hash Calculations', () => {
    it('generates identical JSON canonicalization regardless of object key order', () => {
      const obj1 = { z: 10, a: 'apple', m: { y: 2, b: 1 } };
      const obj2 = { a: 'apple', m: { b: 1, y: 2 }, z: 10 };

      const canon1 = canonicalizePayload(obj1);
      const canon2 = canonicalizePayload(obj2);

      expect(canon1).toBe(canon2);
      expect(canon1).toBe('{"a":"apple","m":{"b":1,"y":2},"z":10}');
    });

    it('generates distinct request hashes for different authenticated users with same payload and path', () => {
      const body = { orderId: 'ord-123' };
      const path = '/api/payments/create-order';

      const hashUserA = computeRequestHash({ userId: 'user-a', path, body });
      const hashUserB = computeRequestHash({ userId: 'user-b', path, body });

      expect(hashUserA).not.toBe(hashUserB);
    });

    it('generates distinct request hashes for different payloads with same user and path', () => {
      const path = '/api/orders';
      const hash1 = computeRequestHash({ userId: 'user-1', path, body: { speed: 'STANDARD' } });
      const hash2 = computeRequestHash({ userId: 'user-1', path, body: { speed: 'EXPRESS' } });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('2. HTTP Header Validation & Error Responses', () => {
    const buildTestApp = () => {
      const app = express();
      app.use(express.json());
      app.post('/api/test-mutation', requireIdempotency, (req, res) => {
        res.status(200).json({ success: true, message: 'handler executed' });
      });
      app.use(errorHandler);
      return app;
    };

    it('rejects requests missing Idempotency-Key header with 400 MISSING_IDEMPOTENCY_KEY', async () => {
      const app = buildTestApp();
      const res = await request(app).post('/api/test-mutation').send({ data: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
      expect(res.body.error.message).toContain('Idempotency-Key header is required');
    });

    it('rejects empty or whitespace-only Idempotency-Key with 400 MISSING_IDEMPOTENCY_KEY', async () => {
      const app = buildTestApp();
      const res = await request(app)
        .post('/api/test-mutation')
        .set('Idempotency-Key', '   ')
        .send({ data: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('rejects oversized Idempotency-Key (>255 chars) with 400 INVALID_IDEMPOTENCY_KEY', async () => {
      const app = buildTestApp();
      const oversizedKey = 'a'.repeat(256);
      const res = await request(app)
        .post('/api/test-mutation')
        .set('Idempotency-Key', oversizedKey)
        .send({ data: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    });
  });

  describe('3. Replay Response Handling', () => {
    it('immediately returns cached response with X-Idempotency-Replay header without executing handler', async () => {
      const key = `replay_key_${crypto.randomUUID()}`;
      const cachedPayload = { success: true, orderId: 'order_persisted_999' };

      const claimResult = await idempotencyRepository.claimKey({
        idempotencyKey: key,
        requestPath: '/api/test-mutation',
        requestHash: computeRequestHash({
          userId: undefined,
          path: '/api/test-mutation',
          body: { action: 'checkout' },
        }),
      });

      await idempotencyRepository.completeRecord(claimResult.record.id, {
        responseCode: 201,
        responseBody: cachedPayload,
      });

      const handlerSpy = vi.fn((req, res) => res.status(200).json({ handlerExecuted: true }));

      const app = express();
      app.use(express.json());
      app.post('/api/test-mutation', requireIdempotency, handlerSpy);
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/test-mutation')
        .set('Idempotency-Key', key)
        .send({ action: 'checkout' });

      expect(res.status).toBe(201);
      expect(res.headers['x-idempotency-replay']).toBe('true');
      expect(res.body).toEqual(cachedPayload);
      expect(handlerSpy).not.toHaveBeenCalled();
    });
  });
});
