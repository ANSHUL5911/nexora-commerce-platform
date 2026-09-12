import { Router } from 'express';
import { optionalAuth } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import { requireIdempotency } from '../idempotency/idempotency.middleware.js';
import { checkoutLimiter } from '../../middleware/rateLimiter.js';
import {
  checkoutInitiateSchema,
  validateBody,
} from '../orders/order.validation.js';
import { orderService } from '../orders/order.service.js';
import { ValidationError } from '../../utils/errors.js';

export const checkoutRouter = Router();

/**
 * POST /api/checkout/initiate
 * Single unified checkout entry point for both authenticated customers and guest buyers.
 *
 * Flow:
 * - Authenticated customer (no direct items array): builds Order from user's server-authoritative cart.
 * - Guest buyer (direct items array provided): builds Order directly from items payload.
 *
 * Security:
 * - Protected by strict rate limiting (10 req/15 min / IP).
 * - Protected by Double-Submit Anti-CSRF verification.
 * - Protected by request-level API idempotency (Idempotency-Key).
 * - Enforces Phase A ACID PostgreSQL transactional inventory reservation.
 * - For guest checkout: generates 256-bit CSPRNG guest token, stores SHA-256 hash at rest,
 *   and returns raw token exactly once in the 201 response.
 */
checkoutRouter.post(
  '/initiate',
  checkoutLimiter,
  optionalAuth,
  verifyCsrf,
  validateBody(checkoutInitiateSchema),
  requireIdempotency,
  async (req, res, next) => {
    try {
      const isGuestCheckout = !req.user || Boolean(req.body.items);

      if (isGuestCheckout && (!req.body.items || req.body.items.length === 0)) {
        throw new ValidationError('Checkout items are required for guest checkout.');
      }

      let orderDTO;
      if (isGuestCheckout) {
        orderDTO = await orderService.createGuestOrder(req.body, {
          idempotencyRecord: req.idempotencyRecord,
        });
      } else {
        orderDTO = await orderService.createOrderFromCart(req.user.id, req.body, {
          idempotencyRecord: req.idempotencyRecord,
        });
      }

      return res.status(201).json({
        success: true,
        data: orderDTO,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default checkoutRouter;
