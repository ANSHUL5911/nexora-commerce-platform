import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * Creates standardized rate limit handler returning Nexora standard error JSON.
 * @param {string} customMessage
 */
function createRateLimitHandler(customMessage = 'Too many requests. Please try again later.') {
  return (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: customMessage,
        requestId: req.id || req.requestId || 'unknown',
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
  handler: createRateLimitHandler('Guest action rate limit exceeded. Please try again later.'),
});

export default {
  generalLimiter,
  authLimiter,
  checkoutLimiter,
  guestLimiter,
};
