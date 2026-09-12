import { Router } from 'express';
import { optionalAuth, requireAuthOrGuestToken } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import { requireIdempotency } from '../idempotency/idempotency.middleware.js';
import { checkoutLimiter } from '../../middleware/rateLimiter.js';
import {
  createPaymentSchema,
  retryPaymentSchema,
  verifyPaymentSchema,
  validateBody,
} from './payment.validation.js';
import { paymentController } from './payment.controller.js';

export const paymentRouter = Router();

// Payment endpoints inspect session context
paymentRouter.use(optionalAuth);

/**
 * POST /api/payments/create-order
 * Initiate a Razorpay payment attempt for a PENDING_PAYMENT order.
 * Protected by Auth / X-Guest-Token, CSRF double-submit, Rate Limiting, Idempotency-Key, and strict Zod validation.
 */
paymentRouter.post(
  '/create-order',
  requireAuthOrGuestToken,
  checkoutLimiter,
  verifyCsrf,
  validateBody(createPaymentSchema),
  requireIdempotency,
  paymentController.createPaymentOrder
);

/**
 * POST /api/payments/retry
 * Retry payment on an existing PENDING_PAYMENT order (creates new PaymentAttempt + Razorpay Order).
 * Protected by Auth / X-Guest-Token, CSRF double-submit, Rate Limiting, Idempotency-Key, and strict Zod validation.
 */
paymentRouter.post(
  '/retry',
  requireAuthOrGuestToken,
  checkoutLimiter,
  verifyCsrf,
  validateBody(retryPaymentSchema),
  requireIdempotency,
  paymentController.retryPayment
);

/**
 * POST /api/payments/verify
 * Reconcile frontend checkout result with server-side HMAC-SHA256 signature and gateway capture verification.
 * Protected by Auth / X-Guest-Token, CSRF double-submit, Rate Limiting, Idempotency-Key, and strict Zod validation.
 */
paymentRouter.post(
  '/verify',
  requireAuthOrGuestToken,
  checkoutLimiter,
  verifyCsrf,
  validateBody(verifyPaymentSchema),
  requireIdempotency,
  paymentController.verifyPayment
);

export default paymentRouter;

