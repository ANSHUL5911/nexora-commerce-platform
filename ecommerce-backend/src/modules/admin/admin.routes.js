import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireAdmin } from '../auth/rbac.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import { requireIdempotency } from '../idempotency/idempotency.middleware.js';
import {
  productIdParamSchema,
  orderIdParamSchema,
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  listInventoryQuerySchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  listAuditLogsQuerySchema,
  refundOrderSchema,
  restockOrderSchema,
  validateParams,
  validateBody,
  validateQuery,
} from './admin.validation.js';
import { adminController } from './admin.controller.js';

export const adminRouter = Router();

// Apply session authentication and RBAC to all administrative routes
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

// ============================================================
// PRODUCTS
// ============================================================

/**
 * GET /api/admin/products
 * List catalog products with administrative filters (active, deleted, or all).
 */
adminRouter.get(
  '/products',
  validateQuery(listProductsQuerySchema),
  adminController.listProducts
);

/**
 * GET /api/admin/products/:id
 * Retrieve single product by UUID for administrative view.
 */
adminRouter.get(
  '/products/:id',
  validateParams(productIdParamSchema),
  adminController.getProduct
);

/**
 * POST /api/admin/products
 * Create a new catalog product with initial stock.
 */
adminRouter.post(
  '/products',
  verifyCsrf,
  validateBody(createProductSchema),
  adminController.createProduct
);

/**
 * PATCH /api/admin/products/:id
 * Update catalog-owned fields of a product (stock and reserved quantities rejected).
 */
adminRouter.patch(
  '/products/:id',
  verifyCsrf,
  validateParams(productIdParamSchema),
  validateBody(updateProductSchema),
  adminController.updateProduct
);

/**
 * DELETE /api/admin/products/:id
 * Soft-delete product from catalog (preserves historical order snapshots).
 */
adminRouter.delete(
  '/products/:id',
  verifyCsrf,
  validateParams(productIdParamSchema),
  adminController.deleteProduct
);

// ============================================================
// INVENTORY (READ-ONLY)
// ============================================================

/**
 * GET /api/admin/inventory
 * Operational overview of catalog inventory levels.
 */
adminRouter.get(
  '/inventory',
  validateQuery(listInventoryQuerySchema),
  adminController.getInventoryOverview
);

// ============================================================
// ORDERS
// ============================================================

/**
 * GET /api/admin/orders
 * Paginated list of all system orders with multi-parameter filtering.
 */
adminRouter.get(
  '/orders',
  validateQuery(listOrdersQuerySchema),
  adminController.listOrders
);

/**
 * GET /api/admin/orders/:orderId
 * Comprehensive operational order details (items, payments, restocks, customer).
 */
adminRouter.get(
  '/orders/:orderId',
  validateParams(orderIdParamSchema),
  adminController.getOrder
);

/**
 * PATCH /api/admin/orders/:orderId/status
 * Explicit order state machine transition.
 */
adminRouter.patch(
  '/orders/:orderId/status',
  verifyCsrf,
  validateParams(orderIdParamSchema),
  validateBody(updateOrderStatusSchema),
  adminController.updateOrderStatus
);

// ============================================================
// REFUNDS & RESTOCKING (SEALED PHASE 07.12)
// ============================================================

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

// ============================================================
// AUDIT LOGS
// ============================================================

/**
 * GET /api/admin/audit-logs
 * Paginated query over immutable operational audit logs.
 */
adminRouter.get(
  '/audit-logs',
  validateQuery(listAuditLogsQuerySchema),
  adminController.listAuditLogs
);

export default adminRouter;

