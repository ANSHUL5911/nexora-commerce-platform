import { refundService } from './refund.service.js';
import { restockService } from './restock.service.js';
import { adminProductService } from './admin.product.service.js';
import { adminInventoryService } from './admin.inventory.service.js';
import { adminOrderService } from './admin.order.service.js';
import { auditService } from './admin.audit.service.js';

export const adminController = {
  // ----------------------------------------------------
  // PRODUCTS
  // ----------------------------------------------------

  /**
   * List catalog products with administrative filters.
   * GET /api/admin/products
   */
  async listProducts(req, res, next) {
    try {
      const result = await adminProductService.listProducts(req.query);
      return res.status(200).json({
        success: true,
        data: result.products,
        pagination: result.pagination,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve a single product by UUID.
   * GET /api/admin/products/:id
   */
  async getProduct(req, res, next) {
    try {
      const { id } = req.params;
      const product = await adminProductService.getProductById(id);
      return res.status(200).json({
        success: true,
        data: product,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Create a new product in the catalog.
   * POST /api/admin/products
   */
  async createProduct(req, res, next) {
    try {
      const adminId = req.user.id;
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const product = await adminProductService.createProduct(req.body, { adminId, ipAddress });

      return res.status(201).json({
        success: true,
        data: product,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Update catalog-owned fields of a product.
   * PATCH /api/admin/products/:id
   */
  async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const product = await adminProductService.updateProduct(id, req.body, { adminId, ipAddress });

      return res.status(200).json({
        success: true,
        data: product,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Soft-delete a product from the catalog.
   * DELETE /api/admin/products/:id
   */
  async deleteProduct(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const result = await adminProductService.deleteProduct(id, { adminId, ipAddress });

      return res.status(200).json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  // ----------------------------------------------------
  // INVENTORY (READ-ONLY)
  // ----------------------------------------------------

  /**
   * Retrieve an administrative overview of product inventory.
   * GET /api/admin/inventory
   */
  async getInventoryOverview(req, res, next) {
    try {
      const result = await adminInventoryService.getInventoryOverview(req.query);
      return res.status(200).json({
        success: true,
        data: result.inventory,
        pagination: result.pagination,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  // ----------------------------------------------------
  // ORDERS
  // ----------------------------------------------------

  /**
   * List orders with administrative filtering.
   * GET /api/admin/orders
   */
  async listOrders(req, res, next) {
    try {
      const result = await adminOrderService.listOrders(req.query);
      return res.status(200).json({
        success: true,
        data: result.orders,
        pagination: result.pagination,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve full operational order detail.
   * GET /api/admin/orders/:orderId
   */
  async getOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const order = await adminOrderService.getOrderById(orderId);
      return res.status(200).json({
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Advance or cancel order status adhering to explicit state machine.
   * PATCH /api/admin/orders/:orderId/status
   */
  async updateOrderStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const adminId = req.user.id;
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const order = await adminOrderService.updateOrderStatus(orderId, req.body, { adminId, ipAddress });

      return res.status(200).json({
        success: true,
        data: order,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  // ----------------------------------------------------
  // AUDIT LOGS
  // ----------------------------------------------------

  /**
   * Query immutable operational audit log trail.
   * GET /api/admin/audit-logs
   */
  async listAuditLogs(req, res, next) {
    try {
      const result = await auditService.listAuditLogs(req.query);
      return res.status(200).json({
        success: true,
        data: result.auditLogs,
        pagination: result.pagination,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  // ----------------------------------------------------
  // REFUNDS & RESTOCKS (SEALED PHASE 07.12)
  // ----------------------------------------------------

  /**
   * Handle admin full refund initiation.
   * POST /api/admin/orders/:orderId/refund
   */
  async refundOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const { reason } = req.body || {};
      const adminId = req.user.id;
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

      const result = await refundService.refundOrder({
        orderId,
        adminId,
        reason,
        ipAddress,
        idempotencyRecord: req.idempotencyRecord,
      });

      return res.status(200).json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Handle admin explicit inventory restocking.
   * POST /api/admin/orders/:orderId/restock
   */
  async restockOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const { reason, items } = req.body;
      const adminId = req.user.id;
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';

      const result = await restockService.restockOrder({
        orderId,
        adminId,
        reason,
        items,
        ipAddress,
        idempotencyRecord: req.idempotencyRecord,
      });

      return res.status(200).json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  },
};

export default adminController;

