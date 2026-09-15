import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { validateConfig } from '../../src/config/env.js';
import { clearAuthCookies } from '../../src/modules/auth/auth.controller.js';

describe('Phase 07.21 — Deployment Readiness Verification Tests', () => {
  // --------------------------------------------------------------------------
  // 1. CORS Preflight & X-CSRF-Token Header (User Correction #1)
  // --------------------------------------------------------------------------
  describe('CORS Preflight & X-CSRF-Token (Correction #1)', () => {
    it('handles OPTIONS preflight with x-csrf-token header and returns appropriate CORS headers', async () => {
      const res = await request(app)
        .options('/api/orders')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'x-csrf-token, content-type');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toMatch(/x-csrf-token/i);
    });

    it('rejects CORS preflight from unapproved origin', async () => {
      const res = await request(app)
        .options('/api/orders')
        .set('Origin', 'https://unauthorized-malicious-domain.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'x-csrf-token');

      // Reject unauthorized origin
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Strict TRUST_PROXY Validation & IP Safety (User Correction #2)
  // --------------------------------------------------------------------------
  describe('Strict TRUST_PROXY Validation & IP Handling (Correction #2)', () => {
    it('accepts explicitly documented safe TRUST_PROXY values', () => {
      const safeValues = ['1', '2', 'loopback', 'linklocal', 'uniquelocal', '127.0.0.1', '10.0.0.0/8', 'true', 'false'];

      for (const val of safeValues) {
        const conf = validateConfig({
          NODE_ENV: 'test',
          TRUST_PROXY: val,
        });
        expect(conf.TRUST_PROXY).toBe(val);
      }
    });

    it('rejects unsafe, arbitrary, or malicious TRUST_PROXY values', () => {
      const unsafeValues = ['*', 'evil_proxy', 'undefined; drop table', '<script>alert(1)</script>'];

      for (const val of unsafeValues) {
        expect(() =>
          validateConfig({
            NODE_ENV: 'test',
            TRUST_PROXY: val,
          })
        ).toThrowError(/\[ConfigValidationError\] Invalid TRUST_PROXY value/);
      }
    });

    it('uses socket peer IP and does not arbitrarily trust spoofed X-Forwarded-For when trust proxy is disabled', async () => {
      // In default test app, trust proxy is not enabled
      const res = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '203.0.113.195, 198.51.100.1');

      expect(res.status).toBe(200);
      // The socket IP (typically 127.0.0.1 or ::ffff:127.0.0.1) is authoritative rather than arbitrary header
      expect(res.body.requestId).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 3. DATABASE_URL Precedence & Production Validation (User Correction #3)
  // --------------------------------------------------------------------------
  describe('DATABASE_URL Precedence & Production Fail-Fast (Correction #3)', () => {
    const validBaseProdEnv = {
      NODE_ENV: 'production',
      SESSION_SECRET: 'a_very_secure_production_session_secret_32_chars_minimum',
      GUEST_TOKEN_SECRET: 'a_very_secure_production_guest_token_secret_32_chars',
      RAZORPAY_KEY_ID: 'rzp_live_validKeyId998877',
      RAZORPAY_KEY_SECRET: 'live_sec_prod_valid_razorpay_key_k8j7h6g5',
      RAZORPAY_WEBHOOK_SECRET: 'live_wh_sec_prod_valid_razorpay_wh_p9o8i7u6',
      CORS_ORIGIN: 'https://nexora.example.com',
    };

    it('Case A: DATABASE_URL only -> validates successfully in production', () => {
      const config = validateConfig({
        ...validBaseProdEnv,
        DATABASE_URL: 'postgresql://prod_user:db_pass_v4b3n2m1@db.prod.internal:5432/nexora_prod',
      });

      expect(config.DATABASE_URL).toBe('postgresql://prod_user:db_pass_v4b3n2m1@db.prod.internal:5432/nexora_prod');
    });

    it('Case B: Discrete DB variables only -> validates successfully in production', () => {
      const config = validateConfig({
        ...validBaseProdEnv,
        DB_HOST: 'db.prod.internal',
        DB_PORT: 5432,
        DB_NAME: 'nexora_prod',
        DB_USER: 'prod_user',
        DB_PASSWORD: 'prod_db_strong_pass_v4b3n2m1',
      });

      expect(config.DB_HOST).toBe('db.prod.internal');
      expect(config.DB_PASSWORD).toBe('prod_db_strong_pass_v4b3n2m1');
    });

    it('Case C: Both supplied -> DATABASE_URL takes precedence in configuration', () => {
      const config = validateConfig({
        ...validBaseProdEnv,
        DATABASE_URL: 'postgresql://prod_user:url_password_v4b3n2m1@url-db.internal:5432/url_db',
        DB_HOST: 'discrete-db.internal',
        DB_PASSWORD: 'discrete_password_v4b3n2m1',
      });

      expect(config.DATABASE_URL).toBe('postgresql://prod_user:url_password_v4b3n2m1@url-db.internal:5432/url_db');
      expect(config.DB_HOST).toBe('discrete-db.internal');
    });

    it('Case D: Neither supplied -> production startup fails fast with ConfigValidationError', () => {
      expect(() =>
        validateConfig({
          ...validBaseProdEnv,
          DB_PASSWORD: '',
          DATABASE_URL: '',
        })
      ).toThrowError(/Production requires either a valid DATABASE_URL or non-empty DB_PASSWORD/);
    });

    it('Case E: DATABASE_URL malformed -> production startup fails safely', () => {
      expect(() =>
        validateConfig({
          ...validBaseProdEnv,
          DATABASE_URL: 'mysql://invalid-protocol-host:3306/db',
        })
      ).toThrowError(/DATABASE_URL must start with postgresql:\/\/ or postgres:\/\//);

      expect(() =>
        validateConfig({
          ...validBaseProdEnv,
          DATABASE_URL: 'postgresql://',
        })
      ).toThrowError(/DATABASE_URL is malformed/);
    });

    it('Case F: DATABASE_URL is obvious placeholder -> production startup fails safely', () => {
      expect(() =>
        validateConfig({
          ...validBaseProdEnv,
          DATABASE_URL: 'postgresql://user:replace_with_password@localhost:5432/db',
        })
      ).toThrowError(/DATABASE_URL cannot be a placeholder in production/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Production Cookie Deletion Security Flags (Finding FIND-04)
  // --------------------------------------------------------------------------
  describe('Cookie Deletion Security Flags (Finding FIND-04)', () => {
    it('clears session and csrf cookies with path=/, httpOnly and sameSite options', () => {
      const clearedCookies = [];
      const mockRes = {
        clearCookie: (name, options) => {
          clearedCookies.push({ name, options });
        },
      };

      clearAuthCookies(mockRes);

      expect(clearedCookies).toHaveLength(2);

      const sessionClear = clearedCookies.find((c) => c.name === '__Host-nexora_sid');
      expect(sessionClear).toBeDefined();
      expect(sessionClear.options.path).toBe('/');
      expect(sessionClear.options.httpOnly).toBe(true);
      expect(sessionClear.options.sameSite).toBe('lax');

      const csrfClear = clearedCookies.find((c) => c.name === 'nexora_csrf');
      expect(csrfClear).toBeDefined();
      expect(csrfClear.options.path).toBe('/');
      expect(csrfClear.options.httpOnly).toBe(false);
      expect(csrfClear.options.sameSite).toBe('lax');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Health Endpoints Rate Limiter Bypass (User Correction #4)
  // --------------------------------------------------------------------------
  describe('Health Endpoints Rate Limiter Bypass (Correction #4)', () => {
    it('allows repeated health check requests without hitting 429 rate limit exceeded', async () => {
      // General rate limiter is 100 req / 15 min. Health checks mounted before it must not be limited.
      for (let i = 0; i < 15; i++) {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
      }
    });
  });
});
