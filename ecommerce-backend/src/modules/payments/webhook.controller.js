import { webhookService } from './webhook.service.js';
import { logger } from '../../utils/logger.js';
import { WebhookSignatureVerificationError } from './payment.errors.js';

export const webhookController = {
  /**
   * Handle incoming Razorpay Webhook notification.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async handleRazorpayWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = req.rawBody;

      if (!signature || typeof signature !== 'string') {
        throw new WebhookSignatureVerificationError(
          'Missing Razorpay webhook signature header.'
        );
      }

      if (!rawBody) {
        throw new WebhookSignatureVerificationError(
          'Missing raw request body for webhook signature verification.'
        );
      }

      logger.info('Received Razorpay webhook event', {
        requestId: req.id,
        eventId: req.body?.id || req.body?.event_id,
        eventType: req.body?.event || req.body?.event_type,
      });

      const result = await webhookService.processRazorpayWebhook({
        rawBody,
        signature,
        payload: req.body,
      });

      // Minimal safe acknowledgement
      return res.status(200).json({
        received: true,
        status: result.status,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default webhookController;
