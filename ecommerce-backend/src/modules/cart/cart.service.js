import { sequelize } from '../../config/database.js';
import { cartRepository } from './cart.repository.js';
import { productRepository } from '../products/product.repository.js';
import { toCartDTO, toCartItemDTO } from './cart.dto.js';
import { AppError, NotFoundError } from '../../utils/errors.js';

export const cartService = {
  /**
   * Retrieve active cart and derived totals for the authenticated user.
   *
   * @param {string} userId
   * @returns {Promise<ReturnType<typeof toCartDTO>>}
   */
  async getCart(userId) {
    let cart = await cartRepository.getCartWithItemsByUserId(userId);

    if (!cart) {
      cart = await cartRepository.findOrCreateCartByUserId(userId);
      cart = await cartRepository.getCartWithItemsByUserId(userId);
    }

    const activeItems = (cart.items || []).filter((item) => Boolean(item.product));

    return toCartDTO(cart, activeItems);
  },

  /**
   * Add a product to the user's cart or increment quantity if already present.
   * Enforces available stock validation and max quantity limit (10).
   *
   * @param {string} userId
   * @param {{ productId: string, quantity: number }} payload
   * @returns {Promise<{
   *   cart: ReturnType<typeof toCartDTO>,
   *   item: ReturnType<typeof toCartItemDTO>
   * }>}
   */
  async addItem(userId, { productId, quantity = 1 }) {
    // 1. Authoritative Product verification via repository
    const product = await productRepository.findById(productId);
    if (!product || product.is_deleted) {
      throw new NotFoundError(`Product with ID '${productId}' was not found.`, 'PRODUCT_NOT_FOUND');
    }

    // 2. Authoritative available stock calculation
    const stockQuantity = Number(product.stock_quantity ?? 0);
    const reservedQuantity = Number(product.reserved_quantity ?? 0);
    const availableQuantity = Math.max(0, stockQuantity - reservedQuantity);

    let targetItemId;

    // 3. Database transaction for Cart & CartItem mutation consistency
    await sequelize.transaction(async (transaction) => {
      // Find or create the user's isolated cart
      const cart = await cartRepository.findOrCreateCartByUserId(userId, { transaction });

      // Check if CartItem already exists with row-level lock for race safety
      const existingItem = await cartRepository.findCartItemByCartAndProduct(
        cart.id,
        productId,
        { transaction, lock: transaction.LOCK.UPDATE }
      );

      if (existingItem) {
        const targetQuantity = existingItem.quantity + quantity;

        if (targetQuantity > 10) {
          throw new AppError(
            'Total quantity of this item in the cart cannot exceed 10.',
            400,
            'QUANTITY_LIMIT_EXCEEDED',
            [{ field: 'quantity', message: 'Total quantity of this item in the cart cannot exceed 10.' }]
          );
        }

        if (targetQuantity > availableQuantity) {
          throw new AppError(
            'Requested quantity exceeds available stock.',
            400,
            'INSUFFICIENT_STOCK',
            [{ field: 'quantity', message: 'Requested quantity exceeds available stock.' }]
          );
        }

        await cartRepository.updateCartItemQuantity(existingItem.id, targetQuantity, { transaction });
        targetItemId = existingItem.id;
      } else {
        if (quantity > 10) {
          throw new AppError(
            'Quantity cannot exceed 10.',
            400,
            'QUANTITY_LIMIT_EXCEEDED',
            [{ field: 'quantity', message: 'Quantity cannot exceed 10.' }]
          );
        }

        if (quantity > availableQuantity) {
          throw new AppError(
            'Requested quantity exceeds available stock.',
            400,
            'INSUFFICIENT_STOCK',
            [{ field: 'quantity', message: 'Requested quantity exceeds available stock.' }]
          );
        }

        const newItem = await cartRepository.createCartItem(
          {
            cartId: cart.id,
            productId,
            quantity,
          },
          { transaction }
        );
        targetItemId = newItem.id;
      }
    });

    // 4. Retrieve refreshed cart with eager loaded products
    const refreshedCart = await cartRepository.getCartWithItemsByUserId(userId);
    const activeItems = (refreshedCart?.items || []).filter((item) => Boolean(item.product));
    const targetItem = activeItems.find((item) => item.id === targetItemId);

    return {
      cart: toCartDTO(refreshedCart, activeItems),
      item: toCartItemDTO(targetItem),
    };
  },

  /**
   * Update quantity of an existing cart item.
   * Enforces Anti-IDOR ownership verification, stock validation, and quantity limits.
   *
   * @param {string} userId
   * @param {string} itemId
   * @param {number} quantity
   * @returns {Promise<{
   *   cart: ReturnType<typeof toCartDTO>,
   *   item: ReturnType<typeof toCartItemDTO>
   * }>}
   */
  async updateItemQuantity(userId, itemId, quantity) {
    await sequelize.transaction(async (transaction) => {
      // Find item ensuring ownership via user's cart with row-level lock
      const item = await cartRepository.findCartItemByIdAndUserId(
        itemId,
        userId,
        { transaction, lock: transaction.LOCK.UPDATE }
      );

      if (!item) {
        throw new NotFoundError('Cart item not found.', 'CART_ITEM_NOT_FOUND');
      }

      // Authoritative product stock lookup via repository
      const product = await productRepository.findById(item.product_id);
      if (!product || product.is_deleted) {
        throw new NotFoundError('Product is no longer available.', 'PRODUCT_NOT_FOUND');
      }

      const stockQuantity = Number(product.stock_quantity ?? 0);
      const reservedQuantity = Number(product.reserved_quantity ?? 0);
      const availableQuantity = Math.max(0, stockQuantity - reservedQuantity);

      if (quantity > availableQuantity) {
        throw new AppError(
          'Requested quantity exceeds available stock.',
          400,
          'INSUFFICIENT_STOCK',
          [{ field: 'quantity', message: 'Requested quantity exceeds available stock.' }]
        );
      }

      await cartRepository.updateCartItemQuantity(itemId, quantity, { transaction });
    });

    const refreshedCart = await cartRepository.getCartWithItemsByUserId(userId);
    const activeItems = (refreshedCart?.items || []).filter((item) => Boolean(item.product));
    const updatedItem = activeItems.find((item) => item.id === itemId);

    return {
      cart: toCartDTO(refreshedCart, activeItems),
      item: toCartItemDTO(updatedItem),
    };
  },

  /**
   * Remove a specific line item from the user's cart.
   * Anti-IDOR: Returns sanitized 404 if item does not belong to the user.
   *
   * @param {string} userId
   * @param {string} itemId
   * @returns {Promise<{ cart: ReturnType<typeof toCartDTO> }>}
   */
  async removeItem(userId, itemId) {
    await sequelize.transaction(async (transaction) => {
      const item = await cartRepository.findCartItemByIdAndUserId(itemId, userId, { transaction });

      if (!item) {
        throw new NotFoundError('Cart item not found.', 'CART_ITEM_NOT_FOUND');
      }

      await cartRepository.deleteCartItem(itemId, { transaction });
    });

    const refreshedCart = await cartRepository.getCartWithItemsByUserId(userId);
    const activeItems = (refreshedCart?.items || []).filter((item) => Boolean(item.product));

    return {
      cart: toCartDTO(refreshedCart, activeItems),
    };
  },

  /**
   * Clear all items in the user's cart.
   * Idempotent: safe if the cart is already empty.
   *
   * @param {string} userId
   * @returns {Promise<{ cart: ReturnType<typeof toCartDTO> }>}
   */
  async clearCart(userId) {
    let cart = await cartRepository.findOrCreateCartByUserId(userId);

    await sequelize.transaction(async (transaction) => {
      await cartRepository.clearCartItems(cart.id, { transaction });
    });

    cart = await cartRepository.getCartWithItemsByUserId(userId);

    return {
      cart: toCartDTO(cart, []),
    };
  },
};

export default cartService;
