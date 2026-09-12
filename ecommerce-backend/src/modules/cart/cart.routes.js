import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { verifyCsrf } from '../auth/csrf.js';
import {
  addItemSchema,
  updateItemSchema,
  cartItemIdParamSchema,
  validateBody,
  validateParams,
} from './cart.validation.js';
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
} from './cart.controller.js';

export const cartRouter = Router();

// All Cart routes require server-side session authentication
cartRouter.use(requireAuth);

// Mutating routes require Double-Submit CSRF token validation
cartRouter.use(verifyCsrf);

/**
 * GET /api/cart
 * Retrieve the active shopping cart for the authenticated user.
 */
cartRouter.get('/', getCart);

/**
 * POST /api/cart/items
 * Add a product to the user's cart or increment quantity.
 */
cartRouter.post(
  '/items',
  validateBody(addItemSchema),
  addItem
);

/**
 * PATCH /api/cart/items/:itemId
 * Update quantity for a specific line item in the user's cart.
 */
cartRouter.patch(
  '/items/:itemId',
  validateParams(cartItemIdParamSchema),
  validateBody(updateItemSchema),
  updateItem
);

/**
 * DELETE /api/cart/items/:itemId
 * Remove a specific line item from the user's cart.
 */
cartRouter.delete(
  '/items/:itemId',
  validateParams(cartItemIdParamSchema),
  removeItem
);

/**
 * DELETE /api/cart
 * Clear all items in the user's cart.
 */
cartRouter.delete('/', clearCart);

export default cartRouter;
