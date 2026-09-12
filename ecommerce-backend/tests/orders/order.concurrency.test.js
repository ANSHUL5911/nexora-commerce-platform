import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { orderService } from '../../src/modules/orders/order.service.js';
import { Product, Order, OrderItem, CartItem, InventoryReservation } from '../../src/models/index.js';
import {
  createTestUser,
  createTestProduct,
  createTestCart,
  createTestCartItem,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.7 — Real PostgreSQL Order Concurrency & Race Verification', () => {
  beforeEach(async () => {
    await cleanupOrderTables();
  });

  afterAll(async () => {
    await cleanupOrderTables();
  });

  const validAddress = {
    fullName: 'Concurrent Customer',
    addressLine1: '789 Concurrency Way',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    phone: '9876543210',
  };

  it('TEST A: Same-Cart Double Checkout Race — exactly 1 succeeds, 1 fails with EmptyCartError', async () => {
    const user = await createTestUser();
    const product = await createTestProduct({ pricePaise: 20000, stockQuantity: 10 });
    const cart = await createTestCart({ userId: user.id });
    await createTestCartItem({ cartId: cart.id, productId: product.id, quantity: 2 });

    // Execute 2 concurrent checkout operations on the exact same cart
    const results = await Promise.allSettled([
      orderService.createOrderFromCart(user.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      }),
      orderService.createOrderFromCart(user.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.name).toBe('EmptyCartError');

    // Database Invariant Checks
    const totalOrders = await Order.count();
    const totalOrderItems = await OrderItem.count();
    const totalReservations = await InventoryReservation.count();
    const remainingCartItems = await CartItem.count({ where: { cart_id: cart.id } });

    expect(totalOrders).toBe(1);
    expect(totalOrderItems).toBe(1);
    expect(totalReservations).toBe(1);
    expect(remainingCartItems).toBe(0);

    const reloadedProduct = await Product.findByPk(product.id);
    expect(reloadedProduct.reserved_quantity).toBe(2);
  });

  it('TEST B: Stock = 1 Contention Across 2 Distinct Users — exactly 1 succeeds, 1 fails with 409 Conflict', async () => {
    const user1 = await createTestUser({ email: 'user1_race@example.com' });
    const user2 = await createTestUser({ email: 'user2_race@example.com' });

    // Single item in stock
    const product = await createTestProduct({
      name: 'Limited Collector Edition',
      pricePaise: 50000,
      stockQuantity: 1,
      reservedQuantity: 0,
    });

    const cart1 = await createTestCart({ userId: user1.id });
    await createTestCartItem({ cartId: cart1.id, productId: product.id, quantity: 1 });

    const cart2 = await createTestCart({ userId: user2.id });
    await createTestCartItem({ cartId: cart2.id, productId: product.id, quantity: 1 });

    // Concurrently checkout both users' carts
    const results = await Promise.allSettled([
      orderService.createOrderFromCart(user1.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      }),
      orderService.createOrderFromCart(user2.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.name).toBe('InsufficientStockError');

    // Exactly 1 Order and 1 Reservation exists in PostgreSQL
    const totalOrders = await Order.count();
    const totalReservations = await InventoryReservation.count();

    expect(totalOrders).toBe(1);
    expect(totalReservations).toBe(1);

    // Product stock counters: 1 stock, 1 reserved, 0 available
    const reloadedProduct = await Product.findByPk(product.id);
    expect(reloadedProduct.stock_quantity).toBe(1);
    expect(reloadedProduct.reserved_quantity).toBe(1);
    expect(reloadedProduct.available_quantity).toBe(0);
  });

  it('TEST C: Multi-Product Ascending UUID Deadlock Prevention', async () => {
    const user1 = await createTestUser({ email: 'user1_multi@example.com' });
    const user2 = await createTestUser({ email: 'user2_multi@example.com' });

    const productA = await createTestProduct({ name: 'Alpha', pricePaise: 10000, stockQuantity: 10 });
    const productB = await createTestProduct({ name: 'Beta', pricePaise: 20000, stockQuantity: 10 });

    const cart1 = await createTestCart({ userId: user1.id });
    await createTestCartItem({ cartId: cart1.id, productId: productA.id, quantity: 1 });
    await createTestCartItem({ cartId: cart1.id, productId: productB.id, quantity: 1 });

    const cart2 = await createTestCart({ userId: user2.id });
    // Inverted insertion order in cart 2
    await createTestCartItem({ cartId: cart2.id, productId: productB.id, quantity: 1 });
    await createTestCartItem({ cartId: cart2.id, productId: productA.id, quantity: 1 });

    // Concurrently checkout both carts with overlapping products in different initial order
    const results = await Promise.allSettled([
      orderService.createOrderFromCart(user1.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      }),
      orderService.createOrderFromCart(user2.id, {
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(2); // Both should succeed without deadlock

    const totalOrders = await Order.count();
    expect(totalOrders).toBe(2);

    const reloadedA = await Product.findByPk(productA.id);
    const reloadedB = await Product.findByPk(productB.id);
    expect(reloadedA.reserved_quantity).toBe(2);
    expect(reloadedB.reserved_quantity).toBe(2);
  });
});
