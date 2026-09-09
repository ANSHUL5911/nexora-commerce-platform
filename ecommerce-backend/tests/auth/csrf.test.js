import { describe, it, expect, vi } from 'vitest';
import {
  generateCsrfToken,
  timingSafeCompare,
  verifyCsrf,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../../src/modules/auth/csrf.js';

describe('Phase 07.3 — CSRF Defense & Double-Submit Verification Tests', () => {
  it('generates 256-bit random CSRF tokens (64 hex chars)', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it('performs timing-safe comparison correctly', () => {
    const token = generateCsrfToken();
    const copy = `${token}`;
    const different = generateCsrfToken();

    expect(timingSafeCompare(token, copy)).toBe(true);
    expect(timingSafeCompare(token, different)).toBe(false);
    expect(timingSafeCompare(token, 'short_token')).toBe(false);
    expect(timingSafeCompare('', token)).toBe(false);
  });

  it('allows safe HTTP methods (GET, HEAD, OPTIONS) without CSRF token', () => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    for (const method of safeMethods) {
      const req = { method, cookies: {}, headers: {} };
      const res = {};
      const next = vi.fn();

      verifyCsrf(req, res, next);
      expect(next).toHaveBeenCalledWith();
    }
  });

  it('exempts webhook routes (/api/webhooks/*) from CSRF validation', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/webhooks/razorpay',
      cookies: {},
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    verifyCsrf(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects state-changing requests when CSRF cookie or header is missing', () => {
    const reqNoCookie = {
      method: 'POST',
      originalUrl: '/api/orders',
      cookies: {},
      headers: { [CSRF_HEADER_NAME]: 'some_token' },
    };
    const next1 = vi.fn();
    verifyCsrf(reqNoCookie, {}, next1);
    expect(next1).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_TOKEN_MISSING',
      })
    );

    const reqNoHeader = {
      method: 'POST',
      originalUrl: '/api/orders',
      cookies: { [CSRF_COOKIE_NAME]: 'some_token' },
      headers: {},
    };
    const next2 = vi.fn();
    verifyCsrf(reqNoHeader, {}, next2);
    expect(next2).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_TOKEN_MISSING',
      })
    );
  });

  it('rejects mismatched CSRF tokens with HTTP 403 CSRF_INVALID', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/orders',
      cookies: { [CSRF_COOKIE_NAME]: 'token_abc_12345' },
      headers: { [CSRF_HEADER_NAME]: 'token_xyz_67890' },
    };
    const next = vi.fn();
    verifyCsrf(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'CSRF_INVALID',
      })
    );
  });

  it('accepts matching double-submit cookie and header', () => {
    const validToken = generateCsrfToken();
    const req = {
      method: 'POST',
      originalUrl: '/api/orders',
      cookies: { [CSRF_COOKIE_NAME]: validToken },
      headers: { [CSRF_HEADER_NAME]: validToken },
    };
    const next = vi.fn();
    verifyCsrf(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });
});
