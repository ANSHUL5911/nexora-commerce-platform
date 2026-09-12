import { cartService } from './cart.service.js';

/**
 * Handler for GET /api/cart
 * Returns the current authenticated user's cart with derived totals.
 */
export async function getCart(req, res, next) {
  try {
    const userId = req.user.id;
    const cart = await cartService.getCart(userId);

    return res.status(200).json({
      cart,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for POST /api/cart/items
 * Adds an item to the user's cart or increments quantity.
 */
export async function addItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { productId, quantity } = req.body;

    const { cart, item } = await cartService.addItem(userId, { productId, quantity });

    return res.status(200).json({
      message: 'Item added to cart successfully',
      cart,
      item,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for PATCH /api/cart/items/:itemId
 * Updates the quantity of an existing cart item.
 */
export async function updateItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    const { cart, item } = await cartService.updateItemQuantity(userId, itemId, quantity);

    return res.status(200).json({
      message: 'Cart item quantity updated successfully',
      cart,
      item,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for DELETE /api/cart/items/:itemId
 * Deletes a single item from the authenticated user's cart.
 */
export async function removeItem(req, res, next) {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const { cart } = await cartService.removeItem(userId, itemId);

    return res.status(200).json({
      message: 'Cart item removed successfully',
      cart,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for DELETE /api/cart
 * Clears all items from the authenticated user's cart.
 */
export async function clearCart(req, res, next) {
  try {
    const userId = req.user.id;
    const { cart } = await cartService.clearCart(userId);

    return res.status(200).json({
      message: 'Cart cleared successfully',
      cart,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

export default {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
