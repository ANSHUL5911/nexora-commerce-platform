import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireAdmin } from '../auth/rbac.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import { requireIdempotency } from '../idempotency/idempotency.middleware.js';
import {
  orderIdParamSchema,
  refundOrderSchema,
  restockOrderSchema,
  validateParams,
  validateBody,
} from './admin.validation.js';
import { adminController } from './admin.controller.js';

export const adminRouter = Router();

// Apply session authentication and RBAC to all administrative routes
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

/**
 * POST /api/admin/orders/:orderId/refund
 * Administrative full refund for a settled order.
 * Protected by Auth (admin), CSRF double-submit, Idempotency-Key, and strict Zod validation.
 */
adminRouter.post(
  '/orders/:orderId/refund',
  verifyCsrf,
  validateParams(orderIdParamSchema),
  validateBody(refundOrderSchema),
  requireIdempotency,
  adminController.refundOrder
);

/**
 * POST /api/admin/orders/:orderId/restock
 * Administrative explicit inventory restocking for a refunded order.
 * Protected by Auth (admin), CSRF double-submit, Idempotency-Key, and strict Zod validation.
 */
adminRouter.post(
  '/orders/:orderId/restock',
  verifyCsrf,
  validateParams(orderIdParamSchema),
  validateBody(restockOrderSchema),
  requireIdempotency,
  adminController.restockOrder
);

export default adminRouter;
