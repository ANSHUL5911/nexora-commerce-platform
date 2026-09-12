import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { orderService } from '../../src/modules/orders/order.service.js';
import { CartItem, Product, Order, OrderItem, InventoryReservation } from '../../src/models/index.js';
import {
  EmptyCartError,
  InvalidShippingMethodError,
  ProductUnavailableError,
  OrderNotFoundError,
  InvalidOrderStateError,
} from '../../src/modules/orders/order.errors.js';
import { InsufficientStockError } from '../../src/modules/inventory/inventory.errors.js';
import {
  createTestUser,
  createTestProduct,
  createTestCart,
  createTestCartItem,
  createTestOrder,
  createTestOrderItem,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.7 — Order Service Business Logic & State Machine Tests', () => {
  beforeEach(async () => {
    await cleanupOrderTables();
  });

  afterAll(async () => {
    await cleanupOrderTables();
  });

  const validAddress = {
    fullName: 'John Doe',
    addressLine1: '123 Tech Park Way',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    phone: '9876543210',
  };

  describe('1. Order Creation & Calculations', () => {
    it('creates Order and OrderItems from cart, reserving inventory and clearing cart', async () => {
      const user = await createTestUser();
      const product1 = await createTestProduct({
        name: 'Product A',
        pricePaise: 10000, // ₹100.00
        stockQuantity: 10,
      });
      const product2 = await createTestProduct({
        name: 'Product B',
        pricePaise: 25000, // ₹250.00
        stockQuantity: 5,
      });

      const cart = await createTestCart({ userId: user.id });
      await createTestCartItem({ cartId: cart.id, productId: product1.id, quantity: 2 }); // 20000 paise
      await createTestCartItem({ cartId: cart.id, productId: product2.id, quantity: 3 }); // 75000 paise

      const orderDTO = await orderService.createOrderFromCart(user.id, {
        shippingAddress: validAddress,
        shippingMethod: 'EXPRESS', // 10000 paise (₹100)
      });

      // Verification of calculations:
      // Subtotal = 20000 + 75000 = 95000 paise (₹950)
      // Shipping = 10000 paise (₹100)
      // Total = 105000 paise (₹1050)
      expect(orderDTO).toBeDefined();
      expect(orderDTO.status).toBe('PENDING_PAYMENT');
      expect(orderDTO.subtotalPaise).toBe(95000);
      expect(orderDTO.shippingFeePaise).toBe(10000);
      expect(orderDTO.totalPaise).toBe(105000);
      expect(orderDTO.items).toHaveLength(2);

      // Verify Cart was cleared
      const remainingCartItems = await CartItem.findAll({ where: { cart_id: cart.id } });
      expect(remainingCartItems).toHaveLength(0);

      // Verify Inventory Reservations were created
      const reservations = await InventoryReservation.findAll({
        where: { order_id: orderDTO.id, status: 'ACTIVE' },
      });
      expect(reservations).toHaveLength(2);

      // Verify Product reserved_quantity counters were incremented
      const p1Reloaded = await Product.findByPk(product1.id);
      const p2Reloaded = await Product.findByPk(product2.id);
      expect(p1Reloaded.reserved_quantity).toBe(2);
      expect(p2Reloaded.reserved_quantity).toBe(3);
    });

    it('preserves immutable snapshots: changing Product price and name does NOT alter existing OrderItem', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({
        name: 'Original Name',
        pricePaise: 10000,
        stockQuantity: 10,
      });

      const cart = await createTestCart({ userId: user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      const orderDTO = await orderService.createOrderFromCart(user.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      });

      expect(orderDTO.items[0].productName).toBe('Original Name');
      expect(orderDTO.items[0].unitPricePaise).toBe(10000);
      expect(orderDTO.totalPaise).toBe(10000);

      // Mutate the live product in the catalog
      await product.update({
        name: 'Modified Name',
        price_paise: 99999,
      });

      // Retrieve the historical order
      const fetchedOrder = await orderService.getOrderById(orderDTO.id, { userId: user.id });

      expect(fetchedOrder.items[0].productName).toBe('Original Name');
      expect(fetchedOrder.items[0].unitPricePaise).toBe(10000);
      expect(fetchedOrder.items[0].lineTotalPaise).toBe(10000);
      expect(fetchedOrder.totalPaise).toBe(10000);
    });

    it('rejects order creation when shopping cart is empty', async () => {
      const user = await createTestUser();
      await createTestCart({ userId: user.id });

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        })
      ).rejects.toThrow(EmptyCartError);
    });

    it('rejects order creation when a product is soft-deleted or unavailable', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ isDeleted: true });

      const cart = await createTestCart({ userId: user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        })
      ).rejects.toThrow(ProductUnavailableError);
    });

    it('rejects unknown shipping methods', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const cart = await createTestCart({ userId: user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 1 });

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'SUPER_DRONE_SPEED',
        })
      ).rejects.toThrow(InvalidShippingMethodError);
    });
  });

  describe('2. Atomic Transaction Rollback Integrity', () => {
    it('rolls back Order, OrderItems, Reservations, and preserves Cart if inventory is insufficient', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({
        pricePaise: 10000,
        stockQuantity: 2, // only 2 in stock
        reservedQuantity: 0,
      });

      const cart = await createTestCart({ userId: user.id });
      await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 5 }); // requesting 5

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        })
      ).rejects.toThrow(InsufficientStockError);

      // Verify 0 Orders and 0 OrderItems exist
      const ordersCount = await Order.count();
      const orderItemsCount = await OrderItem.count();
      const reservationsCount = await InventoryReservation.count();

      expect(ordersCount).toBe(0);
      expect(orderItemsCount).toBe(0);
      expect(reservationsCount).toBe(0);

      // Verify cart items were NOT deleted
      const cartItemsCount = await CartItem.count({ where: { cart_id: cart.id } });
      expect(cartItemsCount).toBe(1);

      // Verify product counters were not altered
      await product.reload();
      expect(product.reserved_quantity).toBe(0);
    });
  });

  describe('3. Anti-IDOR Authorization', () => {
    it('allows owner to retrieve order and blocks other users with sanitized 404', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();

      const order = await createTestOrder({ userId: userA.id });
      const product = await createTestProduct();
      await createTestOrderItem({ orderId: order.id, productId: product.id });

      // Owner can retrieve
      const orderA = await orderService.getOrderById(order.id, { userId: userA.id });
      expect(orderA.id).toBe(order.id);

      // Foreign user receives sanitized 404
      await expect(
        orderService.getOrderById(order.id, { userId: userB.id })
      ).rejects.toThrow(OrderNotFoundError);

      // Admin can retrieve any order
      const adminOrder = await orderService.getOrderById(order.id, {
        userId: userB.id,
        role: 'admin',
      });
      expect(adminOrder.id).toBe(order.id);
    });
  });

  describe('4. Order State Machine Transitions', () => {
    it('allows valid sequential transitions', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });

      // PENDING_PAYMENT -> PAID
      const paidOrder = await orderService.transitionOrderStatus(order.id, 'PAID');
      expect(paidOrder.status).toBe('PAID');

      // PAID -> PROCESSING
      const processingOrder = await orderService.transitionOrderStatus(order.id, 'PROCESSING');
      expect(processingOrder.status).toBe('PROCESSING');

      // PROCESSING -> SHIPPED
      const shippedOrder = await orderService.transitionOrderStatus(order.id, 'SHIPPED');
      expect(shippedOrder.status).toBe('SHIPPED');

      // SHIPPED -> DELIVERED
      const deliveredOrder = await orderService.transitionOrderStatus(order.id, 'DELIVERED');
      expect(deliveredOrder.status).toBe('DELIVERED');
    });

    it('allows valid alternative transitions (cancellation, refund, expiration)', async () => {
      const user = await createTestUser();

      // PENDING_PAYMENT -> CANCELLED
      const order1 = await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });
      const cancelled = await orderService.transitionOrderStatus(order1.id, 'CANCELLED');
      expect(cancelled.status).toBe('CANCELLED');

      // PENDING_PAYMENT -> EXPIRED
      const order2 = await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });
      const expired = await orderService.transitionOrderStatus(order2.id, 'EXPIRED');
      expect(expired.status).toBe('EXPIRED');

      // PAID -> REFUNDED
      const order3 = await createTestOrder({ userId: user.id, orderStatus: 'PAID' });
      const refunded = await orderService.transitionOrderStatus(order3.id, 'REFUNDED');
      expect(refunded.status).toBe('REFUNDED');
    });

    it('rejects invalid state transitions with InvalidOrderStateError and preserves stored status', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id, orderStatus: 'DELIVERED' });

      // DELIVERED is a terminal state; cannot transition to PAID or PROCESSING
      await expect(
        orderService.transitionOrderStatus(order.id, 'PAID')
      ).rejects.toThrow(InvalidOrderStateError);

      await expect(
        orderService.transitionOrderStatus(order.id, 'PROCESSING')
      ).rejects.toThrow(InvalidOrderStateError);

      const reloaded = await Order.findByPk(order.id);
      expect(reloaded.order_status).toBe('DELIVERED');
    });

    it('rejects transitions from CANCELLED or EXPIRED back to PAID', async () => {
      const user = await createTestUser();
      const cancelledOrder = await createTestOrder({ userId: user.id, orderStatus: 'CANCELLED' });
      const expiredOrder = await createTestOrder({ userId: user.id, orderStatus: 'EXPIRED' });

      await expect(
        orderService.transitionOrderStatus(cancelledOrder.id, 'PAID')
      ).rejects.toThrow(InvalidOrderStateError);

      await expect(
        orderService.transitionOrderStatus(expiredOrder.id, 'PAID')
      ).rejects.toThrow(InvalidOrderStateError);
    });
  });
});
