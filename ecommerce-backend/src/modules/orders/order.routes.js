import { Router } from 'express';
import { requireAuth, optionalAuth, requireAuthOrGuestToken } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import { requireIdempotency } from '../idempotency/idempotency.middleware.js';
import { guestLimiter } from '../../middleware/rateLimiter.js';
import {
  createOrderSchema,
  orderIdParamSchema,
  listOrdersQuerySchema,
  validateBody,
  validateParams,
  validateQuery,
} from './order.validation.js';
import {
  createOrder,
  getOrder,
  getGuestOrder,
  listOrders,
} from './order.controller.js';

export const orderRouter = Router();

/**
 * GET /api/orders/guest/:orderId
 * Retrieve detailed order metadata and immutable item snapshots for a guest order.
 * Protected by strict IP rate limiting (15 req/15min) and X-Guest-Token header verification.
 */
orderRouter.get(
  '/guest/:orderId',
  guestLimiter,
  validateParams(orderIdParamSchema),
  getGuestOrder
);

/**
 * POST /api/orders
 * Create an order from the authenticated user's cart.
 * Requires Double-Submit CSRF token validation, Idempotency-Key validation, and strict Zod payload validation.
 */
orderRouter.post(
  '/',
  requireAuth,
  verifyCsrf,
  validateBody(createOrderSchema),
  requireIdempotency,
  createOrder
);

/**
 * GET /api/orders
 * List paginated orders for the authenticated customer.
 */
orderRouter.get(
  '/',
  requireAuth,
  validateQuery(listOrdersQuerySchema),
  listOrders
);

/**
 * GET /api/orders/:orderId
 * Retrieve detailed order metadata and immutable item snapshots.
 * Supports authenticated session ownership or guest token validation via X-Guest-Token header.
 * Enforces Anti-IDOR ownership verification (sanitized 404).
 */
orderRouter.get(
  '/:orderId',
  optionalAuth,
  requireAuthOrGuestToken,
  validateParams(orderIdParamSchema),
  getOrder
);

export default orderRouter;
