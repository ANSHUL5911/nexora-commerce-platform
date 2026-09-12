import { Cart } from '../../models/Cart.js';
import { CartItem } from '../../models/CartItem.js';
import { Product } from '../../models/Product.js';

export const CART_PUBLIC_ATTRIBUTES = ['id', 'user_id', 'created_at', 'updated_at'];
export const CART_ITEM_PUBLIC_ATTRIBUTES = ['id', 'cart_id', 'product_id', 'quantity', 'created_at', 'updated_at'];
export const PRODUCT_CART_ATTRIBUTES = ['id', 'name', 'price_paise', 'stock_quantity', 'reserved_quantity', 'image_url'];

export const cartRepository = {
  /**
   * Find existing cart or create a new one for a user atomically.
   * Handles unique constraint concurrency races safely.
   *
   * @param {string} userId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<Cart>}
   */
  async findOrCreateCartByUserId(userId, options = {}) {
    const existing = await Cart.findOne({
      where: { user_id: userId },
      attributes: CART_PUBLIC_ATTRIBUTES,
      transaction: options.transaction,
      lock: options.lock,
    });

    if (existing) {
      return existing;
    }

    try {
      const [cart] = await Cart.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId },
        attributes: CART_PUBLIC_ATTRIBUTES,
        transaction: options.transaction,
      });
      return cart;
    } catch (err) {
      // Handle concurrent race where another request created the cart simultaneously
      const created = await Cart.findOne({
        where: { user_id: userId },
        attributes: CART_PUBLIC_ATTRIBUTES,
        transaction: options.transaction,
      });
      if (created) return created;
      throw err;
    }
  },

  /**
   * Retrieve cart with eager-loaded active products.
   * Uses bounded single/joined querying to completely eliminate N+1 queries.
   *
   * @param {string} userId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<Cart | null>}
   */
  async getCartWithItemsByUserId(userId, options = {}) {
    return Cart.findOne({
      where: { user_id: userId },
      attributes: CART_PUBLIC_ATTRIBUTES,
      include: [
        {
          model: CartItem,
          as: 'items',
          attributes: CART_ITEM_PUBLIC_ATTRIBUTES,
          include: [
            {
              model: Product,
              as: 'product',
              where: { is_deleted: false },
              required: false,
              attributes: PRODUCT_CART_ATTRIBUTES,
            },
          ],
        },
      ],
      order: [
        [{ model: CartItem, as: 'items' }, 'created_at', 'ASC'],
        [{ model: CartItem, as: 'items' }, 'id', 'ASC'],
      ],
      transaction: options.transaction,
    });
  },

  /**
   * Find a cart item by cartId and productId.
   * Supports row-level locking for atomic duplicate additions.
   *
   * @param {string} cartId
   * @param {string} productId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean | import('sequelize').Transaction.LOCK }} [options]
   * @returns {Promise<CartItem | null>}
   */
  async findCartItemByCartAndProduct(cartId, productId, options = {}) {
    return CartItem.findOne({
      where: {
        cart_id: cartId,
        product_id: productId,
      },
      attributes: CART_ITEM_PUBLIC_ATTRIBUTES,
      transaction: options.transaction,
      lock: options.lock,
    });
  },

  /**
   * Find a cart item by ID ensuring it belongs to the authenticated user.
   * Anti-IDOR: Enforces ownership at the database query level via Cart join.
   *
   * @param {string} itemId
   * @param {string} userId
   * @param {{ transaction?: import('sequelize').Transaction, lock?: boolean | import('sequelize').Transaction.LOCK }} [options]
   * @returns {Promise<CartItem | null>}
   */
  async findCartItemByIdAndUserId(itemId, userId, options = {}) {
    return CartItem.findOne({
      where: { id: itemId },
      attributes: CART_ITEM_PUBLIC_ATTRIBUTES,
      include: [
        {
          model: Cart,
          as: 'cart',
          where: { user_id: userId },
          attributes: ['id', 'user_id'],
          required: true,
        },
      ],
      transaction: options.transaction,
      lock: options.lock,
    });
  },

  /**
   * Create a new CartItem record.
   *
   * @param {{ cartId: string, productId: string, quantity: number }} data
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<CartItem>}
   */
  async createCartItem({ cartId, productId, quantity }, options = {}) {
    return CartItem.create(
      {
        cart_id: cartId,
        product_id: productId,
        quantity,
      },
      {
        transaction: options.transaction,
      }
    );
  },

  /**
   * Update quantity for an existing cart item.
   *
   * @param {string} itemId
   * @param {number} quantity
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<[number]>}
   */
  async updateCartItemQuantity(itemId, quantity, options = {}) {
    return CartItem.update(
      { quantity },
      {
        where: { id: itemId },
        transaction: options.transaction,
      }
    );
  },

  /**
   * Delete a single cart item by ID.
   *
   * @param {string} itemId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>}
   */
  async deleteCartItem(itemId, options = {}) {
    return CartItem.destroy({
      where: { id: itemId },
      transaction: options.transaction,
    });
  },

  /**
   * Clear all cart items belonging to a cart.
   *
   * @param {string} cartId
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<number>}
   */
  async clearCartItems(cartId, options = {}) {
    return CartItem.destroy({
      where: { cart_id: cartId },
      transaction: options.transaction,
    });
  },
};

export default cartRepository;
