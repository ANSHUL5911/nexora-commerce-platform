import { paymentService } from './payment.service.js';

export const paymentController = {
  /**
   * POST /api/payments/create-order
   * Initiate a payment attempt for a PENDING_PAYMENT order.
   */
  async createPaymentOrder(req, res, next) {
    try {
      const { orderId } = req.body;
      const result = await paymentService.initiatePayment({
        orderId,
        userId: req.user?.id,
        role: req.user?.role,
      });

      res.status(201).json({
        success: true,
        data: result,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/payments/retry
   * Retry payment on an existing PENDING_PAYMENT order without creating duplicate orders.
   */
  async retryPayment(req, res, next) {
    try {
      const { orderId } = req.body;
      const result = await paymentService.retryPayment({
        orderId,
        userId: req.user?.id,
        role: req.user?.role,
      });

      res.status(200).json({
        success: true,
        data: result,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/payments/verify
   * Reconcile client checkout result via server-side signature and gateway verification.
   */
  async verifyPayment(req, res, next) {
    try {
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
      const result = await paymentService.verifyPayment({
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        userId: req.user?.id,
        role: req.user?.role,
      });

      res.status(200).json({
        success: true,
        data: result,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

export default paymentController;
