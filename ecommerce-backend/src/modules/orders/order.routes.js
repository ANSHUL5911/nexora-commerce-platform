import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
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
  listOrders,
} from './order.controller.js';

export const orderRouter = Router();

// All Order routes require server-side session authentication
orderRouter.use(requireAuth);

/**
 * POST /api/orders
 * Create an order from the authenticated user's cart.
 * Requires Double-Submit CSRF token validation and strict Zod payload validation.
 */
orderRouter.post(
  '/',
  verifyCsrf,
  validateBody(createOrderSchema),
  createOrder
);

/**
 * GET /api/orders
 * List paginated orders for the authenticated customer.
 */
orderRouter.get(
  '/',
  validateQuery(listOrdersQuerySchema),
  listOrders
);

/**
 * GET /api/orders/:orderId
 * Retrieve detailed order metadata and immutable item snapshots.
 * Enforces Anti-IDOR customer ownership verification.
 */
orderRouter.get(
  '/:orderId',
  validateParams(orderIdParamSchema),
  getOrder
);

export default orderRouter;
