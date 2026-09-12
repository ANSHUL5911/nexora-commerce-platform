import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { Cart, CartItem, Product } from '../../models/index.js';
import { orderRepository } from './order.repository.js';
import { cartRepository } from '../cart/cart.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { idempotencyRepository } from '../idempotency/idempotency.repository.js';
import { toOrderDTO } from './order.dto.js';
import {
  ORDER_STATUS,
  ALLOWED_STATUS_TRANSITIONS,
  SHIPPING_FEES_PAISE,
  SHIPPING_METHODS,
} from './order.constants.js';
import {
  OrderNotFoundError,
  EmptyCartError,
  InvalidOrderStateError,
  InvalidShippingMethodError,
  ProductUnavailableError,
} from './order.errors.js';
import {
  generateGuestToken,
  verifyGuestToken,
  isGuestTokenExpired,
} from './guestToken.js';
import { ValidationError, AppError } from '../../utils/errors.js';

export const orderService = {
  /**
   * Transactionally create an Order and OrderItems from direct items payload for guest checkout.
   * Coordinates with Phase 07.6 Inventory Reservation service.
   * Generates a 256-bit CSPRNG guest token and stores ONLY its SHA-256 hash.
   *
   * @param {{
   *   items: Array<{ productId: string, quantity: number }>,
   *   shippingAddress: {
   *     fullName: string,
   *     addressLine1: string,
   *     city: string,
   *     state: string,
   *     pincode: string,
   *     phone: string
   *   },
   *   shippingMethod: string,
   *   email?: string
   * }} guestOrderInput
   * @param {{
   *   transaction?: import('sequelize').Transaction,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} [options]
   * @returns {Promise<ReturnType<typeof toOrderDTO> & { guestToken?: string }>}
   */
  async createGuestOrder(
    { items, shippingAddress, shippingMethod },
    { transaction: externalTx, idempotencyRecord } = {}
  ) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Checkout items are required for guest checkout.');
    }

    if (!shippingAddress) {
      throw new ValidationError('Shipping address is required.');
    }

    const resolvedShippingMethod = shippingMethod?.toUpperCase();
    if (!resolvedShippingMethod || !(resolvedShippingMethod in SHIPPING_METHODS)) {
      throw new InvalidShippingMethodError(
        `Invalid shipping method '${shippingMethod}'. Must be STANDARD, EXPRESS, or OVERNIGHT.`
      );
    }

    const shippingFeePaise = SHIPPING_FEES_PAISE[resolvedShippingMethod];

    const executeInTransaction = async (tx) => {
      // 1. Collect unique product IDs and sort deterministically in ascending order
      // to eliminate circular lock wait / deadlock conditions during inventory reservation.
      const rawProductIds = items.map((item) => item.productId);
      const uniqueSortedProductIds = [...new Set(rawProductIds)].sort();

      // 2. Fetch current active product records to obtain authoritative server pricing & names
      const products = await Product.findAll({
        where: {
          id: uniqueSortedProductIds,
          is_deleted: false,
        },
        order: [['id', 'ASC']],
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (products.length !== uniqueSortedProductIds.length) {
        throw new ProductUnavailableError(
          'One or more products in your checkout are no longer available or have been removed.'
        );
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 3. Aggregate quantities per product and calculate server-authoritative financials
      let subtotalPaise = 0;
      const orderItemsData = [];
      const productQuantities = new Map();

      for (const item of items) {
        const product = productMap.get(item.productId);
        const unitPricePaise = Number(product.price_paise);
        const quantity = Number(item.quantity);

        if (quantity < 1 || quantity > 10) {
          throw new ValidationError('Quantity must be between 1 and 10 per line item.');
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

        const lineTotalPaise = unitPricePaise * quantity;
        subtotalPaise += lineTotalPaise;

        const currentQty = productQuantities.get(item.productId) ?? 0;
        productQuantities.set(item.productId, currentQty + quantity);

        orderItemsData.push({
          id: crypto.randomUUID(),
          product_id: product.id,
          product_name_snapshot: product.name,
          quantity,
          unit_price_paise: unitPricePaise,
        });
      }

      const totalCostPaise = subtotalPaise + shippingFeePaise;
      const orderId = crypto.randomUUID();

      // 4. Generate 256-bit CSPRNG guest token & compute SHA-256 hash
      const { rawToken, tokenHash } = generateGuestToken();

      // 5. Create the real ecommerce Order row in PENDING_PAYMENT state with guest token hash
      const order = await orderRepository.createOrder(
        {
          id: orderId,
          user_id: null,
          order_status: ORDER_STATUS.PENDING_PAYMENT,
          total_cost_paise: totalCostPaise,
          shipping_fee_paise: shippingFeePaise,
          shipping_full_name: shippingAddress.fullName,
          shipping_address_line1: shippingAddress.addressLine1,
          shipping_city: shippingAddress.city,
          shipping_state: shippingAddress.state,
          shipping_pincode: shippingAddress.pincode,
          shipping_phone: shippingAddress.phone,
          guest_token_hash: tokenHash,
          reservation_expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        },
        { transaction: tx }
      );

      // 6. Sort order items deterministically by product_id ASC to guarantee deadlock-free locking
      orderItemsData.sort((a, b) => a.product_id.localeCompare(b.product_id));
      orderItemsData.forEach((item) => {
        item.order_id = order.id;
      });
      await orderRepository.createOrderItems(orderItemsData, { transaction: tx });

      // 7. Transactionally coordinate with Phase 07.6 Inventory Reservation service
      for (const productId of uniqueSortedProductIds) {
        const requiredQty = productQuantities.get(productId);
        await inventoryService.reserveInventory(productId, requiredQty, {
          orderId: order.id,
          userId: null,
          transaction: tx,
        });
      }

      // 8. Load and return sanitized Order DTO with eagerly loaded items
      const createdOrderWithItems = await orderRepository.findOrderById(order.id, {
        transaction: tx,
        includeItems: true,
      });

      const orderDTO = toOrderDTO(createdOrderWithItems);

      // 9. Transactionally complete IdempotencyRecord inside same tx
      // Mandatory Rule: Raw token is NEVER stored in idempotency_records. response_body has guestToken: null.
      if (idempotencyRecord) {
        await idempotencyRepository.completeRecord(
          idempotencyRecord.id,
          {
            responseCode: 201,
            responseBody: {
              success: true,
              data: {
                ...orderDTO,
                guestToken: null,
              },
            },
            orderId: order.id,
          },
          { transaction: tx }
        );
      }

      // Return DTO with rawToken attached in-memory for the single live response
      return {
        ...orderDTO,
        guestToken: rawToken,
      };
    };

    try {
      if (externalTx) {
        return await executeInTransaction(externalTx);
      }
      return await sequelize.transaction(executeInTransaction);
    } catch (err) {
      if (idempotencyRecord) {
        try {
          await idempotencyRepository.markFailedRetryable(idempotencyRecord.id);
        } catch {
          // ignore cleanup errors and throw primary error
        }
      }
      throw err;
    }
  },

  /**
   * Transactionally create an Order and OrderItems from an authenticated user's cart.
   * Coordinates with Phase 07.6 Inventory Reservation service and clears the user's cart.
   *
   * @param {string} userId
   * @param {{
   *   shippingAddress: {
   *     fullName: string,
   *     addressLine1: string,
   *     city: string,
   *     state: string,
   *     pincode: string,
   *     phone: string
   *   },
   *   shippingMethod: string
   * }} orderInput
   * @param {{
   *   transaction?: import('sequelize').Transaction,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} [options]
   * @returns {Promise<ReturnType<typeof toOrderDTO>>}
   */
  async createOrderFromCart(
    userId,
    { shippingAddress, shippingMethod },
    { transaction: externalTx, idempotencyRecord } = {}
  ) {
    if (!userId) {
      throw new ValidationError('Authenticated user ID is required to create an order.');
    }

    if (!shippingAddress) {
      throw new ValidationError('Shipping address is required.');
    }

    const resolvedShippingMethod = shippingMethod?.toUpperCase();
    if (!resolvedShippingMethod || !(resolvedShippingMethod in SHIPPING_METHODS)) {
      throw new InvalidShippingMethodError(
        `Invalid shipping method '${shippingMethod}'. Must be STANDARD, EXPRESS, or OVERNIGHT.`
      );
    }

    const shippingFeePaise = SHIPPING_FEES_PAISE[resolvedShippingMethod];

    const executeInTransaction = async (tx) => {
      // 1. Concurrency Defense: Lock user's Cart row using SELECT ... FOR UPDATE
      // This ensures concurrent checkouts on the same cart serialize cleanly.
      const cart = await Cart.findOne({
        where: { user_id: userId },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (!cart) {
        throw new EmptyCartError('Shopping cart is empty. Cannot create an order.');
      }

      // 2. Load cart items
      const cartItems = await CartItem.findAll({
        where: { cart_id: cart.id },
        order: [
          ['created_at', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction: tx,
      });

      if (!cartItems || cartItems.length === 0) {
        throw new EmptyCartError('Shopping cart is empty. Cannot create an order.');
      }

      // 3. Collect unique product IDs and sort deterministically in ascending order
      // to eliminate circular lock wait / deadlock conditions during inventory reservation.
      const rawProductIds = cartItems.map((item) => item.product_id);
      const uniqueSortedProductIds = [...new Set(rawProductIds)].sort();

      // 4. Fetch current active product records to obtain authoritative server pricing & names
      const products = await Product.findAll({
        where: {
          id: uniqueSortedProductIds,
          is_deleted: false,
        },
        order: [['id', 'ASC']],
        transaction: tx,
      });

      if (products.length !== uniqueSortedProductIds.length) {
        throw new ProductUnavailableError(
          'One or more products in your cart are no longer available or have been removed.'
        );
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 5. Aggregate quantities per product and calculate server-authoritative financials
      // Invariant: Integer arithmetic in INR paise only (no floating point)
      let subtotalPaise = 0;
      const orderItemsData = [];
      const productQuantities = new Map();

      for (const item of cartItems) {
        const product = productMap.get(item.product_id);
        const unitPricePaise = Number(product.price_paise);
        const quantity = Number(item.quantity);
        const lineTotalPaise = unitPricePaise * quantity;

        subtotalPaise += lineTotalPaise;

        const currentQty = productQuantities.get(item.product_id) ?? 0;
        productQuantities.set(item.product_id, currentQty + quantity);

        orderItemsData.push({
          id: crypto.randomUUID(),
          product_id: product.id,
          product_name_snapshot: product.name,
          quantity,
          unit_price_paise: unitPricePaise,
        });
      }

      const totalCostPaise = subtotalPaise + shippingFeePaise;
      const orderId = crypto.randomUUID();

      // 6. Create the real ecommerce Order row in PENDING_PAYMENT state
      // orders.reservation_expires_at is a snapshot coordination field
      const order = await orderRepository.createOrder(
        {
          id: orderId,
          user_id: userId,
          order_status: ORDER_STATUS.PENDING_PAYMENT,
          total_cost_paise: totalCostPaise,
          shipping_fee_paise: shippingFeePaise,
          shipping_full_name: shippingAddress.fullName,
          shipping_address_line1: shippingAddress.addressLine1,
          shipping_city: shippingAddress.city,
          shipping_state: shippingAddress.state,
          shipping_pincode: shippingAddress.pincode,
          shipping_phone: shippingAddress.phone,
          reservation_expires_at: Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'"),
        },
        { transaction: tx }
      );

      // 7. Sort order items deterministically by product_id ASC to guarantee that
      // PostgreSQL foreign key checks (KEY SHARE locks) and inventory FOR UPDATE locks
      // acquire row locks in identical monotonic order, preventing deadlocks.
      orderItemsData.sort((a, b) => a.product_id.localeCompare(b.product_id));
      orderItemsData.forEach((item) => {
        item.order_id = order.id;
      });
      await orderRepository.createOrderItems(orderItemsData, { transaction: tx });

      // 8. Transactionally coordinate with Phase 07.6 Inventory Reservation service
      // Reserve inventory for each distinct product in ascending UUID order
      for (const productId of uniqueSortedProductIds) {
        const requiredQty = productQuantities.get(productId);
        await inventoryService.reserveInventory(productId, requiredQty, {
          orderId: order.id,
          userId,
          transaction: tx,
        });
      }

      // 9. Clear the user's cart items in the same transaction
      await cartRepository.clearCartItems(cart.id, { transaction: tx });

      // 10. Load and return sanitized Order DTO with eagerly loaded items
      const createdOrderWithItems = await orderRepository.findOrderById(order.id, {
        transaction: tx,
        includeItems: true,
      });

      const orderDTO = toOrderDTO(createdOrderWithItems);

      // 11. Transactionally complete IdempotencyRecord inside same tx
      if (idempotencyRecord) {
        await idempotencyRepository.completeRecord(
          idempotencyRecord.id,
          {
            responseCode: 201,
            responseBody: {
              success: true,
              data: orderDTO,
            },
            orderId: order.id,
          },
          { transaction: tx }
        );
      }

      return orderDTO;
    };

    try {
      if (externalTx) {
        return await executeInTransaction(externalTx);
      }
      return await sequelize.transaction(executeInTransaction);
    } catch (err) {
      if (idempotencyRecord) {
        try {
          await idempotencyRepository.markFailedRetryable(idempotencyRecord.id);
        } catch {
          // ignore cleanup errors and throw primary error
        }
      }
      throw err;
    }
  },

  /**
   * Retrieve a Guest Order by ID with strict token and expiry validation.
   * Sanitized 404 returned on missing, invalid, foreign, or expired tokens.
   *
   * @param {string} orderId
   * @param {string} rawGuestToken
   * @returns {Promise<ReturnType<typeof toOrderDTO>>}
   */
  async getGuestOrder(orderId, rawGuestToken) {
    if (!orderId) {
      throw new ValidationError('Order ID is required.');
    }

    if (!rawGuestToken || typeof rawGuestToken !== 'string' || rawGuestToken.trim() === '') {
      throw new OrderNotFoundError('Order was not found.');
    }

    const order = await orderRepository.findOrderById(orderId, { includeItems: true });
    if (!order) {
      throw new OrderNotFoundError('Order was not found.');
    }

    // Must be a guest order (user_id is null) and possess a stored token hash
    if (order.user_id !== null || !order.guest_token_hash) {
      throw new OrderNotFoundError('Order was not found.');
    }

    // Verify token hash in constant time
    const isValidToken = verifyGuestToken(rawGuestToken, order.guest_token_hash);
    if (!isValidToken) {
      throw new OrderNotFoundError('Order was not found.');
    }

    // Verify 30-day token lifetime relative to order.created_at
    if (isGuestTokenExpired(order.created_at)) {
      throw new OrderNotFoundError('Order was not found.');
    }

    return toOrderDTO(order);
  },

  /**
   * Retrieve an Order by ID with strict Anti-IDOR ownership verification.
   * Supports both authenticated user ownership and guest token authorization.
   * Foreign or unauthorized customer queries return sanitized 404 OrderNotFoundError.
   *
   * @param {string} orderId
   * @param {{ userId?: string, role?: string, guestToken?: string }} [options]
   * @returns {Promise<ReturnType<typeof toOrderDTO>>}
   */
  async getOrderById(orderId, { userId, role, guestToken } = {}) {
    if (!orderId) {
      throw new ValidationError('Order ID is required.');
    }

    const order = await orderRepository.findOrderById(orderId, { includeItems: true });
    if (!order) {
      throw new OrderNotFoundError('Order was not found.');
    }

    // 1. Admin authorization bypass
    if (userId && String(role || '').toLowerCase() === 'admin') {
      return toOrderDTO(order);
    }

    // 2. Guest Token authorization
    if (guestToken && typeof guestToken === 'string' && guestToken.trim() !== '') {
      if (order.user_id === null && order.guest_token_hash) {
        const isValidToken = verifyGuestToken(guestToken, order.guest_token_hash);
        if (isValidToken && !isGuestTokenExpired(order.created_at)) {
          return toOrderDTO(order);
        }
      }
      // If guest token is invalid, expired, or attempted against an authenticated user's order -> 404
      throw new OrderNotFoundError('Order was not found.');
    }

    // 3. Authenticated customer ownership check
    if (userId) {
      if (order.user_id === userId) {
        return toOrderDTO(order);
      }
      throw new OrderNotFoundError('Order was not found.');
    }

    // 4. Missing both authentication and guest token
    throw new OrderNotFoundError('Order was not found.');
  },

  /**
   * List paginated orders for an authenticated user with deterministic ordering.
   *
   * @param {string} userId
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string
   * }} [queryOptions]
   * @returns {Promise<{ orders: Array<ReturnType<typeof toOrderDTO>>, pagination: object }>}
   */
  async listUserOrders(userId, { page = 1, limit = 10, status } = {}) {
    if (!userId) {
      throw new ValidationError('User ID is required.');
    }

    const boundedPage = Math.max(1, Number(page) || 1);
    const boundedLimit = Math.min(50, Math.max(1, Number(limit) || 10));

    const [orders, totalItems] = await Promise.all([
      orderRepository.findOrdersByUserId(userId, {
        page: boundedPage,
        limit: boundedLimit,
        status,
      }),
      orderRepository.countOrdersByUserId(userId, { status }),
    ]);

    const totalPages = Math.ceil(totalItems / boundedLimit) || 1;

    return {
      orders: orders.map(toOrderDTO),
      pagination: {
        page: boundedPage,
        limit: boundedLimit,
        totalItems,
        totalPages,
      },
    };
  },

  /**
   * Transition order status adhering to the explicit Order State Machine.
   * Rejects invalid transitions with InvalidOrderStateError.
   *
   * @param {string} orderId
   * @param {string} targetStatus
   * @param {{
   *   userId?: string,
   *   role?: string,
   *   transaction?: import('sequelize').Transaction
   * }} [options]
   * @returns {Promise<ReturnType<typeof toOrderDTO>>}
   */
  async transitionOrderStatus(orderId, targetStatus, { userId, role, transaction: externalTx } = {}) {
    if (!orderId) {
      throw new ValidationError('Order ID is required.');
    }

    if (!targetStatus) {
      throw new ValidationError('Target order status is required.');
    }

    const executeInTransaction = async (tx) => {
      const order = await orderRepository.findOrderById(orderId, {
        transaction: tx,
        lock: true,
        includeItems: true,
      });

      if (!order) {
        throw new OrderNotFoundError('Order was not found.');
      }

      // Anti-IDOR ownership check if userId provided
      if (userId && String(role || '').toLowerCase() !== 'admin' && order.user_id !== userId) {
        throw new OrderNotFoundError('Order was not found.');
      }

      const currentStatus = order.order_status;
      const allowedTargets = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

      if (!allowedTargets.includes(targetStatus)) {
        throw new InvalidOrderStateError(
          `Cannot transition order '${orderId}' from status '${currentStatus}' to '${targetStatus}'.`
        );
      }

      await orderRepository.updateOrderStatus(orderId, targetStatus, { transaction: tx });
      const updatedOrder = await orderRepository.findOrderById(orderId, {
        transaction: tx,
        includeItems: true,
      });

      return toOrderDTO(updatedOrder);
    };

    if (externalTx) {
      return executeInTransaction(externalTx);
    }
    return sequelize.transaction(executeInTransaction);
  },
};

export default orderService;
