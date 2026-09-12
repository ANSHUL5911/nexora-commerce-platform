import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import { checkoutLimiter } from '../../middleware/rateLimiter.js';
import {
  createPaymentSchema,
  retryPaymentSchema,
  verifyPaymentSchema,
  validateBody,
} from './payment.validation.js';
import { paymentController } from './payment.controller.js';

export const paymentRouter = Router();

// All payment endpoints require server-side session authentication
paymentRouter.use(requireAuth);

/**
 * POST /api/payments/create-order
 * Initiate a Razorpay payment attempt for a PENDING_PAYMENT order.
 * Protected by Auth, CSRF double-submit, Rate Limiting, and strict Zod validation.
 */
paymentRouter.post(
  '/create-order',
  checkoutLimiter,
  verifyCsrf,
  validateBody(createPaymentSchema),
  paymentController.createPaymentOrder
);

/**
 * POST /api/payments/retry
 * Retry payment on an existing PENDING_PAYMENT order (creates new PaymentAttempt + Razorpay Order).
 * Protected by Auth, CSRF double-submit, Rate Limiting, and strict Zod validation.
 */
paymentRouter.post(
  '/retry',
  checkoutLimiter,
  verifyCsrf,
  validateBody(retryPaymentSchema),
  paymentController.retryPayment
);

/**
 * POST /api/payments/verify
 * Reconcile frontend checkout result with server-side HMAC-SHA256 signature and gateway capture verification.
 * Protected by Auth, CSRF double-submit, Rate Limiting, and strict Zod validation.
 */
paymentRouter.post(
  '/verify',
  checkoutLimiter,
  verifyCsrf,
  validateBody(verifyPaymentSchema),
  paymentController.verifyPayment
);

export default paymentRouter;
