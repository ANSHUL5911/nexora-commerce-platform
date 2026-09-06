import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app } from '../src/app.js';
import { authLimiter } from '../src/middleware/rateLimiter.js';
import { requestId } from '../src/middleware/requestId.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { ValidationError } from '../src/utils/errors.js';

describe('Backend Foundation Middleware & API Infrastructure', () => {
  describe('Request ID Middleware', () => {
    it('generates a UUIDv4 when no X-Request-Id header is passed', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      // UUID format regex
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    it('propagates safe incoming X-Request-Id header', async () => {
      const customId = 'req-custom-trace-id-12345';
      const res = await request(app)
        .get('/api/health')
        .set('X-Request-Id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body.requestId).toBe(customId);
    });

    it('replaces malicious / overly long X-Request-Id with safe UUID', async () => {
      const maliciousId = 'a'.repeat(200) + '<script>alert(1)</script>';
      const res = await request(app)
        .get('/api/health')
        .set('X-Request-Id', maliciousId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).not.toBe(maliciousId);
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('Security Headers (Helmet)', () => {
    it('sets essential security headers on responses', async () => {
      const res = await request(app).get('/api/health');

      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain('checkout.razorpay.com');
      expect(res.headers['content-security-policy']).toContain('api.razorpay.com');
    });
  });

  describe('Strict CORS Policy', () => {
    it('accepts requests from configured origin with credentials enabled', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects requests from unauthorized origins', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-attacker-domain.com');

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('CORS_ORIGIN_DENIED');
    });
  });

  describe('404 & Centralized Error Handler', () => {
    it('returns standardized error JSON for unmatched /api routes', async () => {
      const res = await request(app).get('/api/non-existent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(res.body.error.message).toContain('/api/non-existent-endpoint');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('returns standardized JSON on validation errors', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(express.json());
      testApp.post('/test-validation', (req, res, next) => {
        next(new ValidationError('Invalid product quantity', [{ field: 'quantity', message: 'Must be positive' }]));
      });
      testApp.use(errorHandler);

      const res = await request(testApp).post('/test-validation').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Invalid product quantity');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('handles malformed JSON body with standard 400 error', async () => {
      const res = await request(app)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('{"bad_json":');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MALFORMED_JSON');
      expect(res.body.error.requestId).toBeDefined();
    });
  });

  describe('Rate Limiting Foundation', () => {
    it('enforces authentication rate limiting threshold with standard 429 response', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(authLimiter);
      testApp.get('/test-auth-limit', (req, res) => res.json({ ok: true }));
      testApp.use(errorHandler);

      // Max is 5 requests / min
      for (let i = 0; i < 5; i++) {
        const res = await request(testApp).get('/test-auth-limit');
        expect(res.status).toBe(200);
      }

      // 6th request must trigger 429
      const blockedRes = await request(testApp).get('/test-auth-limit');
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(blockedRes.body.error.message).toContain('Too many authentication attempts');
    });
  });
});
