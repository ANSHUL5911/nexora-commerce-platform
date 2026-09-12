import { refundService } from './refund.service.js';
import { restockService } from './restock.service.js';

export const adminController = {
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
