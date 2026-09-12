import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import {
  createReservationSchema,
  reservationIdParamSchema,
  productIdParamSchema,
  validateBody,
  validateParams,
} from './inventory.validation.js';
import {
  createReservation,
  getReservation,
  releaseReservation,
  convertReservation,
  getProductInventory,
} from './inventory.controller.js';

export const inventoryRouter = Router();

/**
 * POST /api/inventory/reservations
 * Create a transactional inventory reservation bound to an existing Order.
 */
inventoryRouter.post(
  '/reservations',
  requireAuth,
  verifyCsrf,
  validateBody(createReservationSchema),
  createReservation
);

/**
 * GET /api/inventory/reservations/:reservationId
 * Retrieve reservation details with customer ownership verification.
 */
inventoryRouter.get(
  '/reservations/:reservationId',
  requireAuth,
  validateParams(reservationIdParamSchema),
  getReservation
);

/**
 * POST /api/inventory/reservations/:reservationId/release
 * Release an active reservation.
 */
inventoryRouter.post(
  '/reservations/:reservationId/release',
  requireAuth,
  verifyCsrf,
  validateParams(reservationIdParamSchema),
  releaseReservation
);

/**
 * POST /api/inventory/reservations/:reservationId/convert
 * Convert an active reservation into a permanent stock deduction.
 */
inventoryRouter.post(
  '/reservations/:reservationId/convert',
  requireAuth,
  verifyCsrf,
  validateParams(reservationIdParamSchema),
  convertReservation
);

/**
 * GET /api/inventory/products/:productId
 * Public stock counter lookup.
 */
inventoryRouter.get(
  '/products/:productId',
  validateParams(productIdParamSchema),
  getProductInventory
);

export default inventoryRouter;
