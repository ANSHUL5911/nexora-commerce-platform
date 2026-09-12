import { Router } from 'express';
import { webhookController } from './webhook.controller.js';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/razorpay
 * Ingest asynchronous Razorpay server-to-server webhook notifications.
 *
 * Security Model:
 * - Public to Razorpay gateway servers (no customer session auth).
 * - No CSRF cookie validation.
 * - Authenticated strictly via timing-safe HMAC-SHA256 signature verification over raw request body.
 */
webhookRouter.post('/razorpay', webhookController.handleRazorpayWebhook);

export default webhookRouter;
