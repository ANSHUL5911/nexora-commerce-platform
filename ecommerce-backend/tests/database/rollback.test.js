import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import {
  User,
  Product,
  Order,
  OrderItem,
  InventoryReservation,
  Cart,
  CartItem,
  PaymentAttempt,
  StockRestockLog,
} from '../../src/models/index.js';
import { orderService } from '../../src/modules/orders/order.service.js';
import { orderRepository } from '../../src/modules/orders/order.repository.js';
import { inventoryService } from '../../src/modules/inventory/inventory.service.js';
import { paymentService } from '../../src/modules/payments/payment.service.js';
import { restockService } from '../../src/modules/admin/restock.service.js';
import { hashPassword } from '../../src/modules/auth/password.js';

describe('Phase 07.19 — Transactional Checkpoint Rollback Invariant Verification', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await migrateReset(sequelize);
    const migrator = getMigrator(sequelize);
    await migrator.up();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupAll();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanupAll();
  });

  async function cleanupAll() {
    await sequelize.query(`
      TRUNCATE users, products, addresses, orders, order_items,
               inventory_reservations, payment_attempts, payment_events,
               idempotency_records, audit_logs, stock_restock_logs, sessions,
               carts, cart_items CASCADE;
    `);
  }

  const validAddress = {
    fullName: 'Rollback Tester',
    addressLine1: '100 Resilience Ave',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    phone: '+919876543210',
  };

  async function setupUserWithCart({ stockQuantity = 10, cartQuantity = 2 } = {}) {
    const password_hash = await hashPassword('Password123!');
    const user = await User.create({
      id: crypto.randomUUID(),
      email: `user-${crypto.randomUUID()}@rollback.local`,
      password_hash,
      full_name: 'Rollback User',
      role: 'customer',
      is_active: true,
    });

    const product = await Product.create({
      id: crypto.randomUUID(),
      name: 'Resilience Jacket',
      description: 'Tested under failures',
      price_paise: 250000,
      stock_quantity: stockQuantity,
      reserved_quantity: 0,
      category: 'Outerwear',
      image_url: 'https://example.com/jacket.jpg',
    });

    const cart = await Cart.create({
      id: crypto.randomUUID(),
      user_id: user.id,
    });

    const cartItem = await CartItem.create({
      id: crypto.randomUUID(),
      cart_id: cart.id,
      product_id: product.id,
      quantity: cartQuantity,
    });

    return { user, product, cart, cartItem };
  }

  // =========================================================================
  // 1. Checkout Transaction Checkpoints
  // =========================================================================
  describe('1. Checkout Transaction Checkpoint Failures', () => {
    it('Checkpoint A (After Order INSERT, before OrderItems): rolls back Order and preserves cart and inventory', async () => {
      const { user, product, cart } = await setupUserWithCart();

      // Inject intentional failure on createOrderItems (simulates failure after Order row is inserted)
      vi.spyOn(orderRepository, 'createOrderItems').mockRejectedValueOnce(
        new Error('SIMULATED_FAILURE_AFTER_ORDER_INSERT')
      );

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        })
      ).rejects.toThrow('SIMULATED_FAILURE_AFTER_ORDER_INSERT');

      // Verify complete atomic rollback:
      expect(await Order.count()).toBe(0);
      expect(await OrderItem.count()).toBe(0);
      expect(await InventoryReservation.count()).toBe(0);

      // Verify cart remains intact
      expect(await CartItem.count({ where: { cart_id: cart.id } })).toBe(1);

      // Verify product counters unchanged
      await product.reload();
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(0);
    });

    it('Checkpoint B (After Order & OrderItems, before inventory reservation): rolls back all order rows', async () => {
      const { user, product, cart } = await setupUserWithCart();

      // Inject intentional failure on inventoryService.reserveInventory
      vi.spyOn(inventoryService, 'reserveInventory').mockRejectedValueOnce(
        new Error('SIMULATED_FAILURE_AT_INVENTORY_RESERVATION')
      );

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        })
      ).rejects.toThrow('SIMULATED_FAILURE_AT_INVENTORY_RESERVATION');

      // Verify complete atomic rollback:
      expect(await Order.count()).toBe(0);
      expect(await OrderItem.count()).toBe(0);
      expect(await InventoryReservation.count()).toBe(0);

      // Cart untouched
      expect(await CartItem.count({ where: { cart_id: cart.id } })).toBe(1);

      // Stock untouched
      await product.reload();
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(0);
    });

    it('Checkpoint C (Before cart clear / commit): rolls back order and reservations if clearing cart fails', async () => {
      const { user, product, cart } = await setupUserWithCart();

      // Inject intentional failure when clearing cart items
      vi.spyOn(CartItem, 'destroy').mockRejectedValueOnce(
        new Error('SIMULATED_FAILURE_ON_CART_CLEAR')
      );

      await expect(
        orderService.createOrderFromCart(user.id, {
          shippingAddress: validAddress,
          shippingMethod: 'STANDARD',
        })
      ).rejects.toThrow('SIMULATED_FAILURE_ON_CART_CLEAR');

      // Verify rollback: no order, no reservations
      expect(await Order.count()).toBe(0);
      expect(await OrderItem.count()).toBe(0);
      expect(await InventoryReservation.count()).toBe(0);

      // Cart still intact
      expect(await CartItem.count({ where: { cart_id: cart.id } })).toBe(1);

      // Product reserved quantity rolled back
      await product.reload();
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(0);
    });
  });

  // =========================================================================
  // 2. Payment Settlement Checkpoints
  // =========================================================================
  describe('2. Payment Settlement Checkpoint Failures', () => {
    it('Checkpoint D (During settlement conversion): rolls back PAID order transition if reservation conversion fails', async () => {
      const { user, product } = await setupUserWithCart();

      // Create an order in PENDING_PAYMENT
      const order = await Order.create({
        id: crypto.randomUUID(),
        user_id: user.id,
        order_status: 'PENDING_PAYMENT',
        total_cost_paise: 500000,
        shipping_fee_paise: 0,
        shipping_full_name: validAddress.fullName,
        shipping_address_line1: validAddress.addressLine1,
        shipping_city: validAddress.city,
        shipping_state: validAddress.state,
        shipping_pincode: validAddress.pincode,
        shipping_phone: validAddress.phone,
        reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const reservation = await InventoryReservation.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: product.id,
        quantity: 2,
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Update product reserved quantity
      await product.update({ reserved_quantity: 2 });

      const attempt = await PaymentAttempt.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        attempt_number: 1,
        razorpay_order_id: 'order_rzp_fail_point',
        status: 'INITIATED',
        amount_paise: 500000,
        currency: 'INR',
      });

      // Inject failure on inventory conversion during settlement
      vi.spyOn(inventoryService, 'convertReservation').mockRejectedValueOnce(
        new Error('SIMULATED_FAILURE_ON_RESERVATION_CONVERSION')
      );

      await expect(
        paymentService.settleCapturedPayment({
          orderId: order.id,
          paymentAttemptId: attempt.id,
          razorpayPaymentId: 'pay_rzp_mock_123',
        })
      ).rejects.toThrow('SIMULATED_FAILURE_ON_RESERVATION_CONVERSION');

      // Verify that Order did NOT commit as PAID
      await order.reload();
      expect(order.order_status).toBe('PENDING_PAYMENT');

      // Verify PaymentAttempt did NOT commit as SUCCESS
      await attempt.reload();
      expect(attempt.status).toBe('INITIATED');

      // Verify Reservation remains ACTIVE
      await reservation.reload();
      expect(reservation.status).toBe('ACTIVE');

      // Verify product counters were not altered
      await product.reload();
      expect(product.stock_quantity).toBe(10);
      expect(product.reserved_quantity).toBe(2);
    });
  });

  // =========================================================================
  // 3. Restock Transaction Checkpoints
  // =========================================================================
  describe('3. Restock Transaction Checkpoint Failures', () => {
    it('Checkpoint E (During restock): rolls back stock increment if restock audit logging fails', async () => {
      const { user, product } = await setupUserWithCart();

      const order = await Order.create({
        id: crypto.randomUUID(),
        user_id: user.id,
        order_status: 'REFUNDED',
        total_cost_paise: 500000,
        shipping_fee_paise: 0,
        shipping_full_name: validAddress.fullName,
        shipping_address_line1: validAddress.addressLine1,
        shipping_city: validAddress.city,
        shipping_state: validAddress.state,
        shipping_pincode: validAddress.pincode,
        shipping_phone: validAddress.phone,
        reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      await OrderItem.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        product_id: product.id,
        product_name_snapshot: product.name,
        quantity: 2,
        unit_price_paise: 250000,
      });

      // Inject failure on StockRestockLog.create during admin restock
      vi.spyOn(StockRestockLog, 'create').mockRejectedValueOnce(
        new Error('SIMULATED_FAILURE_ON_STOCK_RESTOCK_LOG')
      );

      await expect(
        restockService.restockOrder({
          orderId: order.id,
          adminId: user.id,
          reason: 'Physical return processed',
        })
      ).rejects.toThrow('SIMULATED_FAILURE_ON_STOCK_RESTOCK_LOG');

      // Verify stock quantity did NOT increment (remains 10, not 12)
      await product.reload();
      expect(product.stock_quantity).toBe(10);

      // Verify zero restock logs exist
      const restockLogCount = await StockRestockLog.count({ where: { order_id: order.id } });
      expect(restockLogCount).toBe(0);
    });
  });
});
