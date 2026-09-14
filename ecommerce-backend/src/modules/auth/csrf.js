import crypto from 'crypto';
import { ForbiddenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export const CSRF_COOKIE_NAME = 'nexora_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Generate a cryptographically secure 256-bit random CSRF token.
 * Generated independently from session IDs.
 *
 * @returns {string}
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compare two token strings in constant time.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * CSRF Protection Middleware for state-changing browser requests.
 * Uses Double-Submit Cookie Pattern with timing-safe validation.
 *
 * Boundaries:
 * - Safe HTTP methods (GET, HEAD, OPTIONS) bypass validation.
 * - Razorpay webhook endpoint (/api/webhooks/*) is explicitly exempt from CSRF
 *   because it authenticates via external gateway HMAC-SHA256 signature verification.
 * - State-changing mutations (POST, PUT, PATCH, DELETE) require valid header & cookie.
 */
export function verifyCsrf(req, res, next) {
  // 1. Safe/read-only HTTP methods bypass CSRF
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // 2. Explicit Webhook Exemption Boundary (e.g. Razorpay webhook endpoint)
  // Webhooks use HMAC-SHA256 signature verification, not browser cookies.
  if (req.originalUrl && req.originalUrl.startsWith('/api/webhooks')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers?.[CSRF_HEADER_NAME] || req.headers?.['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    const rawPath = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || req.path);
    logger.warn('CSRF validation rejected: missing token', {
      event: 'csrf.rejected',
      requestId: req.id || req.requestId || 'unknown',
      path: (rawPath || '/').split('?')[0],
      method: req.method,
      reason: 'CSRF_TOKEN_MISSING',
    });

    return next(
      new ForbiddenError('CSRF token missing from request cookie or header', 'CSRF_TOKEN_MISSING')
    );
  }

  if (!timingSafeCompare(cookieToken, headerToken)) {
    const rawPath = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || req.path);
    logger.warn('CSRF validation rejected: invalid token', {
      event: 'csrf.rejected',
      requestId: req.id || req.requestId || 'unknown',
      path: (rawPath || '/').split('?')[0],
      method: req.method,
      reason: 'CSRF_INVALID',
    });

    return next(new ForbiddenError('Invalid or mismatched CSRF token', 'CSRF_INVALID'));
  }

  return next();
}

export default {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  timingSafeCompare,
  verifyCsrf,
};
