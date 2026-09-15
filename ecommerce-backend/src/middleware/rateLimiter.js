import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Creates standardized rate limit handler returning Nexora standard error JSON.
 * Emits structured rate_limit.rejected operational event without sensitive input.
 * @param {string} customMessage
 */
export function createRateLimitHandler(customMessage = 'Too many requests. Please try again later.') {
  return (req, res) => {
    const reqId = req.id || req.requestId || 'unknown';
    const rawPath = req.baseUrl ? `${req.baseUrl}${req.path}` : (req.originalUrl || req.url || req.path);
    const normalizedPath = (rawPath || '/').split('?')[0].replace(/\/+$/, '') || '/';

    logger.warn('Rate limit exceeded', {
      event: 'rate_limit.rejected',
      requestId: reqId,
      path: normalizedPath,
      method: req.method,
      statusCode: 429,
    });

    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: customMessage,
        requestId: reqId,
      },
    });
  };
}

/**
 * General application-wide rate limiter.
 * Default: 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_GENERAL,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || '127.0.0.1',
  handler: createRateLimitHandler('General rate limit exceeded. Please wait before making more requests.'),
});

/**
 * Authentication rate limiter.
 * Strict: 5 requests per 1 minute per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.RATE_LIMIT_MAX_AUTH, // 5 requests / min / IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || '127.0.0.1',
  handler: createRateLimitHandler('Too many authentication attempts. Please try again in 1 minute.'),
});

/**
 * Checkout initiation rate limiter.
 * Strict: 10 requests per 15 minutes per IP.
 */
export const checkoutLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_CHECKOUT,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || '127.0.0.1',
  handler: createRateLimitHandler('Checkout rate limit exceeded. Please wait before attempting checkout again.'),
});

/**
 * Guest session / lookup rate limiter.
 * Strict: 15 requests per 15 minutes per IP.
 */
export const guestLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_GUEST,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || '127.0.0.1',
  handler: createRateLimitHandler('Guest action rate limit exceeded. Please try again later.'),
});

export default {
  generalLimiter,
  authLimiter,
  checkoutLimiter,
  guestLimiter,
};
