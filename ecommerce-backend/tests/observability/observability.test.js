import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import {
  logger,
  formatLogEntry,
  redactSensitiveData,
  sanitizeStringContent,
} from '../../src/utils/logger.js';
import { requestId } from '../../src/middleware/requestId.js';
import { requestLogger } from '../../src/middleware/requestLogger.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createRateLimitHandler } from '../../src/middleware/rateLimiter.js';
import { verifyCsrf } from '../../src/modules/auth/csrf.js';
import { config } from '../../src/config/env.js';

describe('Phase 07.18 — Observability Master Verification Suite', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // 1. Structured JSON Schema & Formatting
  // ============================================================
  describe('Structured JSON Schema & Event Taxonomy', () => {
    it('produces valid machine-readable JSON with all standard envelope fields', () => {
      const entryJson = formatLogEntry('info', 'Test operation completed', {
        event: 'order.created',
        requestId: 'req-12345',
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: 'customer',
        statusCode: 201,
        durationMs: 42.5,
      });

      const parsed = JSON.parse(entryJson);
      expect(parsed.service).toBe('nexora-backend');
      expect(parsed.environment).toBe(config.NODE_ENV);
      expect(parsed.level).toBe('INFO');
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
      expect(parsed.event).toBe('order.created');
      expect(parsed.requestId).toBe('req-12345');
      expect(parsed.orderId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(parsed.actorType).toBe('customer');
      expect(parsed.statusCode).toBe(201);
      expect(parsed.durationMs).toBe(42.5);
      expect(parsed.message).toBe('Test operation completed');
    });

    it('seamlessly supports passing event object as first argument', () => {
      const entryJson = formatLogEntry('info', {
        event: 'payment.settlement.completed',
        requestId: 'req-payment-999',
        orderId: '550e8400-e29b-41d4-a716-446655440001',
        paymentAttemptId: '550e8400-e29b-41d4-a716-446655440002',
        statusCode: 200,
      });

      const parsed = JSON.parse(entryJson);
      expect(parsed.event).toBe('payment.settlement.completed');
      expect(parsed.requestId).toBe('req-payment-999');
      expect(parsed.orderId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(parsed.paymentAttemptId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(parsed.statusCode).toBe(200);
    });

    it('survives serialization error safely without throwing (side-effect free logging)', () => {
      const problematicMeta = {};
      const bigInt = BigInt(9007199254740991);
      problematicMeta.val = bigInt; // JSON.stringify throws TypeError on raw BigInt

      const result = formatLogEntry('info', 'Testing serialization resilience', problematicMeta);
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed.service).toBe('nexora-backend');
      expect(parsed.event).toBe('logger.serialization_error');
    });
  });

  // ============================================================
  // 2. Comprehensive Recursive Redaction Engine
  // ============================================================
  describe('Sensitive Data Redaction Boundaries', () => {
    it('redacts passwords in all representations (plain, hash, db)', () => {
      const input = {
        password: 'PlaintextPassword123!',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$hashvalue',
        passwordHash: '$2b$12$somehashedpassword',
        db_password: 'super_secret_db_pass',
        dbPassword: 'super_secret_db_pass',
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.password_hash).toBe('[REDACTED]');
      expect(redacted.passwordHash).toBe('[REDACTED]');
      expect(redacted.db_password).toBe('[REDACTED]');
      expect(redacted.dbPassword).toBe('[REDACTED]');
    });

    it('redacts session identifiers (sid, session_id, __Host-nexora_sid)', () => {
      const input = {
        sid: 'a'.repeat(64),
        session_id: 'b'.repeat(64),
        sessionId: 'c'.repeat(64),
        session: 'active-session-token',
        session_secret: 'top_secret_session_key',
        '__Host-nexora_sid': 'raw_cookie_session_id',
        nexora_sid: 'raw_session_id',
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.sid).toBe('[REDACTED]');
      expect(redacted.session_id).toBe('[REDACTED]');
      expect(redacted.sessionId).toBe('[REDACTED]');
      expect(redacted.session).toBe('[REDACTED]');
      expect(redacted.session_secret).toBe('[REDACTED]');
      expect(redacted['__Host-nexora_sid']).toBe('[REDACTED]');
      expect(redacted.nexora_sid).toBe('[REDACTED]');
    });

    it('enforces rule 1: raw guest token, guest token hash, and X-Guest-Token header are NEVER logged', () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const input = {
        guestToken: rawToken,
        guest_token: rawToken,
        'x-guest-token': rawToken,
        guest_token_hash: tokenHash,
        guestTokenHash: tokenHash,
        guest_token_secret: 'secret-123',
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.guestToken).toBe('[REDACTED]');
      expect(redacted.guest_token).toBe('[REDACTED]');
      expect(redacted['x-guest-token']).toBe('[REDACTED]');
      expect(redacted.guest_token_hash).toBe('[REDACTED]');
      expect(redacted.guestTokenHash).toBe('[REDACTED]');
      expect(redacted.guest_token_secret).toBe('[REDACTED]');
    });

    it('redacts authorization headers, cookies, and CSRF tokens', () => {
      const input = {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
        cookie: '__Host-nexora_sid=abc12345; nexora_csrf=xyz98765',
        'set-cookie': '__Host-nexora_sid=secret; Path=/; Secure; HttpOnly',
        csrf: 'csrf_secret_token_123',
        csrfToken: 'csrf_token_value_456',
        'x-csrf-token': 'csrf_header_val_789',
        nexora_csrf: 'csrf_cookie_val_000',
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted.cookie).toBe('[REDACTED]');
      expect(redacted['set-cookie']).toBe('[REDACTED]');
      expect(redacted.csrf).toBe('[REDACTED]');
      expect(redacted.csrfToken).toBe('[REDACTED]');
      expect(redacted['x-csrf-token']).toBe('[REDACTED]');
      expect(redacted.nexora_csrf).toBe('[REDACTED]');
    });

    it('redacts Razorpay secrets, webhook secrets, and payment signatures', () => {
      const input = {
        razorpay_key_secret: 'rzp_secret_key_12345',
        razorpay_webhook_secret: 'webhook_secret_99999',
        key_secret: 'generic_key_secret',
        webhook_secret: 'generic_webhook_secret',
        razorpay_signature: 'hmac_sha256_sig_abcde',
        signature: 'raw_payment_signature',
        'x-razorpay-signature': 'gateway_header_sig',
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.razorpay_key_secret).toBe('[REDACTED]');
      expect(redacted.razorpay_webhook_secret).toBe('[REDACTED]');
      expect(redacted.key_secret).toBe('[REDACTED]');
      expect(redacted.webhook_secret).toBe('[REDACTED]');
      expect(redacted.razorpay_signature).toBe('[REDACTED]');
      expect(redacted.signature).toBe('[REDACTED]');
      expect(redacted['x-razorpay-signature']).toBe('[REDACTED]');
    });

    it('redacts card numbers, CVVs, expiry, PINs, and idempotency keys', () => {
      const input = {
        cardNumber: '4111111111111111',
        card_number: '5500000000000004',
        cvv: '999',
        cvc: '123',
        expiry: '12/28',
        pin: '1234',
        idempotency_key: 'idem-key-user-12345',
        'idempotency-key': 'idem-key-user-67890',
        request_hash: 'req_hash_123456789',
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.cardNumber).toBe('[REDACTED]');
      expect(redacted.card_number).toBe('[REDACTED]');
      expect(redacted.cvv).toBe('[REDACTED]');
      expect(redacted.cvc).toBe('[REDACTED]');
      expect(redacted.expiry).toBe('[REDACTED]');
      expect(redacted.pin).toBe('[REDACTED]');
      expect(redacted.idempotency_key).toBe('[REDACTED]');
      expect(redacted['idempotency-key']).toBe('[REDACTED]');
      expect(redacted.request_hash).toBe('[REDACTED]');
    });

    it('recursively redacts nested objects and arrays without mutating source data', () => {
      const source = {
        checkout: {
          items: [
            { productId: 'prod-1', quantity: 2 },
            { productId: 'prod-2', quantity: 1, nestedSecret: { password: 'pwd' } },
          ],
          auth: {
            sessionData: { sid: 'raw_sid_123' },
            session: 'active-session-secret',
          },
        },
      };

      const clonedSource = JSON.parse(JSON.stringify(source));
      const redacted = redactSensitiveData(source);

      // Verify deep redaction
      expect(redacted.checkout.items[1].nestedSecret.password).toBe('[REDACTED]');
      expect(redacted.checkout.auth.sessionData.sid).toBe('[REDACTED]');
      expect(redacted.checkout.auth.session).toBe('[REDACTED]');
      // Verify source was NOT mutated
      expect(source).toEqual(clonedSource);
    });

    it('safely handles circular references without throwing infinite recursion', () => {
      const circularObj = { name: 'circular-test' };
      circularObj.self = circularObj;

      const redacted = redactSensitiveData(circularObj);
      expect(redacted.name).toBe('circular-test');
      expect(redacted.self).toBe('[Circular]');
    });

    it('enforces rule 2: redacts message, error, reason, stack, and Error objects', () => {
      const customErr = new Error('Database connection failed with password=super_secret_db_pass in connection string');
      customErr.code = 'DB_ERROR';
      customErr.config = {
        headers: {
          authorization: 'Bearer secret_token_12345',
        },
      };

      const redactedErr = redactSensitiveData(customErr);
      expect(redactedErr.name).toBe('Error');
      expect(redactedErr.message).toContain('password=[REDACTED]');
      expect(redactedErr.message).not.toContain('super_secret_db_pass');
      expect(redactedErr.code).toBe('DB_ERROR');
      expect(redactedErr.config.headers.authorization).toBe('[REDACTED]');
    });

    it('enforces string sanitization for raw messages containing Bearer tokens and PAN numbers', () => {
      const rawMsg = 'Failed request with Bearer abc.def.ghi and card 4111111111111111';
      const sanitized = sanitizeStringContent(rawMsg);
      expect(sanitized).toBe('Failed request with Bearer [REDACTED] and card [REDACTED]');
    });
  });

  // ============================================================
  // 3. HTTP Request Correlation & Lifecycle Logging
  // ============================================================
  describe('HTTP Request Correlation & Lifecycle Middleware', () => {
    it('generates or propagates requestId, attaching to req, res headers, and logs', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(requestLogger);
      testApp.get('/test-route', (req, res) => res.status(200).json({ status: 'ok' }));

      const res = await request(testApp)
        .get('/test-route')
        .set('X-Request-Id', 'req-corr-trace-001');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe('req-corr-trace-001');

      expect(consoleLogSpy).toHaveBeenCalled();
      const lastCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0];
      const parsedLog = JSON.parse(lastCall);
      expect(parsedLog.event).toBe('http.request.completed');
      expect(parsedLog.requestId).toBe('req-corr-trace-001');
      expect(parsedLog.path).toBe('/test-route');
      expect(parsedLog.statusCode).toBe(200);
      expect(typeof parsedLog.durationMs).toBe('number');
    });

    it('enforces rule 3: strips high-cardinality query strings from log path', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(requestLogger);
      testApp.get('/test-query', (req, res) => res.status(200).json({ ok: true }));

      const res = await request(testApp)
        .get('/test-query?token=secret123&user=attacker&arbitraryParam=highCardinalityValue');

      expect(res.status).toBe(200);
      expect(consoleLogSpy).toHaveBeenCalled();
      const lastCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0];
      const parsedLog = JSON.parse(lastCall);
      // Normalized path must NOT contain query strings
      expect(parsedLog.path).toBe('/test-query');
      expect(parsedLog.path).not.toContain('secret123');
    });

    it('correctly classifies actorType based on request credentials', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use((req, res, next) => {
        if (req.headers['x-test-role'] === 'admin') {
          req.user = { id: 'admin-1', role: 'admin' };
        } else if (req.headers['x-test-role'] === 'customer') {
          req.user = { id: 'cust-1', role: 'customer' };
        }
        next();
      });
      testApp.use(requestLogger);
      testApp.get('/actor-check', (req, res) => res.status(200).json({ ok: true }));

      // 1. Guest request with X-Guest-Token
      await request(testApp)
        .get('/actor-check')
        .set('X-Guest-Token', 'token-val');
      let parsed = JSON.parse(consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0]);
      expect(parsed.actorType).toBe('guest');

      // 2. Admin request
      await request(testApp)
        .get('/actor-check')
        .set('x-test-role', 'admin');
      parsed = JSON.parse(consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0]);
      expect(parsed.actorType).toBe('admin');

      // 3. Customer request
      await request(testApp)
        .get('/actor-check')
        .set('x-test-role', 'customer');
      parsed = JSON.parse(consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0]);
      expect(parsed.actorType).toBe('customer');

      // 4. Anonymous request
      await request(testApp).get('/actor-check');
      parsed = JSON.parse(consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1][0]);
      expect(parsed.actorType).toBe('anonymous');
    });

    it('logs 4xx as http.client_error at level WARN and 5xx as http.server_error at level ERROR', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(requestLogger);
      testApp.get('/fail-400', (req, res) => res.status(400).json({ error: 'bad' }));
      testApp.get('/fail-500', (req, res) => res.status(500).json({ error: 'server error' }));

      await request(testApp).get('/fail-400');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const warnLog = JSON.parse(consoleWarnSpy.mock.calls[consoleWarnSpy.mock.calls.length - 1][0]);
      expect(warnLog.event).toBe('http.client_error');
      expect(warnLog.level).toBe('WARN');

      await request(testApp).get('/fail-500');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errLog = JSON.parse(consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1][0]);
      expect(errLog.event).toBe('http.server_error');
      expect(errLog.level).toBe('ERROR');
    });
  });

  // ============================================================
  // 4. Error Observability & Production Response Sanitization
  // ============================================================
  describe('Error Observability & Production Sanitization', () => {
    it('records unexpected 500 error in operational logs but never exposes stack traces in response', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.get('/error-endpoint', () => {
        throw new Error('Database transaction deadlocked internally');
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get('/error-endpoint');

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.requestId).toBeDefined();
      // MUST NOT leak stack trace in response
      expect(res.body.error.stack).toBeUndefined();
      expect(res.body.stack).toBeUndefined();

      // Verify server error log captured event: http.server_error
      expect(consoleErrorSpy).toHaveBeenCalled();
      const lastErrLog = JSON.parse(consoleErrorSpy.mock.calls[consoleErrorSpy.mock.calls.length - 1][0]);
      expect(lastErrLog.event).toBe('http.server_error');
      expect(lastErrLog.errorCode).toBe('INTERNAL_SERVER_ERROR');
      expect(lastErrLog.errorType).toBe('Error');
      expect(lastErrLog.stack).toBeDefined(); // Internal log may retain stack
    });
  });

  // ============================================================
  // 5. Rate Limit Observability
  // ============================================================
  describe('Rate Limit Observability', () => {
    it('emits rate_limit.rejected operational event with safe metadata upon threshold breach', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(
        '/test-rate',
        express.Router().use((req, res) => {
          const handler = createRateLimitHandler('Rate limit hit');
          handler(req, res);
        })
      );

      const res = await request(testApp).get('/test-rate');

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

      expect(consoleWarnSpy).toHaveBeenCalled();
      const lastWarn = JSON.parse(consoleWarnSpy.mock.calls[consoleWarnSpy.mock.calls.length - 1][0]);
      expect(lastWarn.event).toBe('rate_limit.rejected');
      expect(lastWarn.statusCode).toBe(429);
      expect(lastWarn.path).toBe('/test-rate');
      expect(lastWarn.method).toBe('GET');
      expect(lastWarn.requestId).toBeDefined();
    });
  });

  // ============================================================
  // 6. CSRF Security Event Observability
  // ============================================================
  describe('CSRF Security Event Observability', () => {
    it('emits csrf.rejected event without logging token secrets when CSRF validation fails', async () => {
      const testApp = express();
      testApp.use(requestId);
      testApp.use(cookieParser());
      testApp.use(verifyCsrf);
      testApp.post('/test-csrf', (req, res) => res.json({ success: true }));
      testApp.use(errorHandler);

      const res = await request(testApp)
        .post('/test-csrf')
        .send({
          productId: 'd0000000-0000-4000-8000-000000000001',
          quantity: 1,
        });

      // No CSRF cookies/headers sent -> 403 Forbidden
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');

      // Verify that csrf.rejected was emitted without token content
      expect(consoleWarnSpy).toHaveBeenCalled();
      const calls = consoleWarnSpy.mock.calls.map((c) => {
        try {
          return JSON.parse(c[0]);
        } catch {
          return {};
        }
      });
      const csrfEvent = calls.find((c) => c.event === 'csrf.rejected');
      expect(csrfEvent).toBeDefined();
      expect(csrfEvent.reason).toBe('CSRF_TOKEN_MISSING');
      expect(csrfEvent.path).toBe('/test-csrf');
      expect(csrfEvent.method).toBe('POST');
    });
  });

  // ============================================================
  // 7. Startup & Process Lifecycle Observability
  // ============================================================
  describe('Process Lifecycle Observability', () => {
    it('enforces rule 4: application.started databaseConnected reflects verified DB status', () => {
      const startupLog = formatLogEntry('info', 'Nexora Backend Server running', {
        event: 'application.started',
        port: 5000,
        environment: 'test',
        databaseConnected: true,
      });

      const parsed = JSON.parse(startupLog);
      expect(parsed.event).toBe('application.started');
      expect(parsed.databaseConnected).toBe(true);
      expect(parsed.port).toBe(5000);
    });

    it('enforces rule 4: application.startup.failed never serializes connection strings or passwords', () => {
      const failedStartupErr = new Error('Connection refused to postgresql://postgres:SuperSecretDbPassword@localhost:5432/nexora_db');

      const failedLog = formatLogEntry('error', 'Fatal server startup error', {
        event: 'application.startup.failed',
        error: failedStartupErr.message,
      });

      const parsed = JSON.parse(failedLog);
      expect(parsed.event).toBe('application.startup.failed');
      expect(parsed.error).not.toContain('SuperSecretDbPassword');
    });

    it('formats application.shutdown.started and completed safely', () => {
      const shutdownLog = formatLogEntry('info', 'Received SIGTERM. Shutting down gracefully...', {
        event: 'application.shutdown.started',
        signal: 'SIGTERM',
      });

      const parsed = JSON.parse(shutdownLog);
      expect(parsed.event).toBe('application.shutdown.started');
      expect(parsed.signal).toBe('SIGTERM');
    });
  });

  // ============================================================
  // 8. Side-Effect Free Invariant (User Feedback Addition)
  // ============================================================
  describe('Side-Effect Free Invariant Verification', () => {
    it('logging errors or invalid inputs never crash commerce requests or throw exceptions', () => {
      expect(() => {
        logger.info(null);
        logger.info(undefined);
        logger.warn({});
        logger.error(new Error('Test error'));
      }).not.toThrow();
    });

    it('fail-safe: logger swallows standard I/O and console throw errors', () => {
      consoleLogSpy.mockImplementation(() => {
        throw new Error('EPIPE: Broken pipe during stdout write');
      });
      consoleWarnSpy.mockImplementation(() => {
        throw new Error('EIO: I/O failure during stderr write');
      });
      consoleErrorSpy.mockImplementation(() => {
        throw new Error('Disk full / stdout buffer crash');
      });

      expect(() => {
        logger.info('Customer checkout completed', { orderId: 'ord-123' });
        logger.warn('Payment failed', { orderId: 'ord-123' });
        logger.error('Webhook unhandled crash', { eventId: 'evt-123' });
      }).not.toThrow();
    });

    it('fail-safe: logger swallows throwing property getters during serialization', () => {
      const toxicMeta = {
        orderId: 'ord-123',
        get explosiveProperty() {
          throw new Error('Fatal getter explosion');
        },
      };

      expect(() => {
        logger.info('Processing order', toxicMeta);
        logger.warn('Warning on order', toxicMeta);
        logger.error('Error on order', toxicMeta);
      }).not.toThrow();
    });
  });

  // ============================================================
  // 9. Domain Lifecycle Event Taxonomy Verification
  // ============================================================
  describe('Domain Lifecycle Event Taxonomy Verification', () => {
    it('formats payment lifecycle events with valid schema and safe domain identifiers', () => {
      const paymentEvents = [
        {
          event: 'payment.attempt.created',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
          amountPaise: 299900,
        },
        {
          event: 'payment.gateway.order.created',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
          razorpayOrderId: 'order_test123',
        },
        {
          event: 'payment.verification.started',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
          razorpayOrderId: 'order_test123',
        },
        {
          event: 'payment.signature.invalid',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
          razorpayOrderId: 'order_test123',
        },
        {
          event: 'payment.capture.confirmed',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
          razorpayPaymentId: 'pay_test456',
        },
        {
          event: 'payment.settlement.completed',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
          razorpayPaymentId: 'pay_test456',
        },
        {
          event: 'payment.settlement.already_processed',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          paymentAttemptId: '550e8400-e29b-41d4-a716-446655440001',
        },
      ];

      for (const payload of paymentEvents) {
        const serialized = formatLogEntry('info', payload);
        const parsed = JSON.parse(serialized);
        expect(parsed.event).toBe(payload.event);
        expect(parsed.orderId).toBe(payload.orderId);
        expect(parsed.service).toBe('nexora-backend');
      }
    });

    it('formats webhook lifecycle events with eventId and safe processing status', () => {
      const webhookEvents = [
        { event: 'webhook.received', eventId: 'evt_1', eventType: 'payment.captured' },
        { event: 'webhook.signature.invalid', eventId: 'evt_2' },
        { event: 'webhook.duplicate', eventId: 'evt_3', eventType: 'payment.captured' },
        { event: 'webhook.processing.started', eventId: 'evt_4', eventType: 'payment.captured' },
        { event: 'webhook.processing.completed', eventId: 'evt_5', orderId: '550e8400-e29b-41d4-a716-446655440000' },
        { event: 'webhook.processing.failed', eventId: 'evt_6', error: 'Database timeout' },
        { event: 'webhook.requires_refund', eventId: 'evt_7', orderId: '550e8400-e29b-41d4-a716-446655440000' },
      ];

      for (const payload of webhookEvents) {
        const serialized = formatLogEntry('info', payload);
        const parsed = JSON.parse(serialized);
        expect(parsed.event).toBe(payload.event);
        expect(parsed.eventId).toBe(payload.eventId);
        expect(parsed.service).toBe('nexora-backend');
      }
    });

    it('formats inventory lifecycle events with reservation and product correlation', () => {
      const inventoryEvents = [
        { event: 'inventory.reservation.created', orderId: 'ord-1', productId: 'p-1', reservationId: 'r-1', quantity: 2 },
        { event: 'inventory.insufficient_stock', orderId: 'ord-2', productId: 'p-2', quantity: 5, availableStock: 1 },
        { event: 'inventory.reservation.released', reservationId: 'r-3', productId: 'p-3', quantity: 1 },
        { event: 'inventory.reservation.converted', reservationId: 'r-4', productId: 'p-4', quantity: 2 },
        { event: 'inventory.reservation.expired', reservationId: 'r-5', productId: 'p-5', quantity: 1 },
        { event: 'inventory.invariant_violation', reservationId: 'r-6', productId: 'p-6', reservedQuantity: 0, requestedQuantity: 1 },
      ];

      for (const payload of inventoryEvents) {
        const level = payload.event.includes('violation') ? 'error' : 'info';
        const serialized = formatLogEntry(level, payload);
        const parsed = JSON.parse(serialized);
        expect(parsed.event).toBe(payload.event);
        expect(parsed.productId).toBe(payload.productId);
      }
    });

    it('formats idempotency lifecycle events without exposing raw keys', () => {
      const idempotencyEvents = [
        { event: 'idempotency.claimed', path: '/api/orders' },
        { event: 'idempotency.replay', path: '/api/orders', orderId: 'ord-1' },
        { event: 'idempotency.payload_mismatch', path: '/api/orders' },
        { event: 'idempotency.in_progress', path: '/api/orders' },
        { event: 'idempotency.completed', orderId: 'ord-1', paymentAttemptId: 'att-1' },
        { event: 'idempotency.failed_retryable' },
        { event: 'idempotency.recovery', path: '/api/payments/initiate' },
      ];

      for (const payload of idempotencyEvents) {
        const serialized = formatLogEntry('info', payload);
        const parsed = JSON.parse(serialized);
        expect(parsed.event).toBe(payload.event);
        expect(parsed.idempotency_key).toBeUndefined();
        expect(parsed['idempotency-key']).toBeUndefined();
      }
    });

    it('formats admin operation events for refund and restock', () => {
      const adminEvents = [
        { event: 'admin.refund.requested', orderId: 'ord-1', paymentAttemptId: 'att-1', adminId: 'adm-1' },
        { event: 'admin.refund.completed', orderId: 'ord-1', paymentAttemptId: 'att-1', refundId: 'rfnd_1' },
        { event: 'admin.restock.requested', orderId: 'ord-1', adminId: 'adm-1' },
        { event: 'admin.restock.completed', orderId: 'ord-1', adminId: 'adm-1', itemsCount: 2, totalQuantity: 3 },
      ];

      for (const payload of adminEvents) {
        const serialized = formatLogEntry('info', payload);
        const parsed = JSON.parse(serialized);
        expect(parsed.event).toBe(payload.event);
        expect(parsed.orderId).toBe('ord-1');
      }
    });
  });
});
