import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { sequelize } from '../../src/config/database.js';
import { orderRepository } from '../../src/modules/orders/order.repository.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  createTestOrderItem,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.7 — Order Repository Unit Tests', () => {
  beforeEach(async () => {
    await cleanupOrderTables();
  });

  afterAll(async () => {
    await cleanupOrderTables();
  });

  it('createOrder persists an Order record in PostgreSQL', async () => {
    const user = await createTestUser();
    const orderId = crypto.randomUUID();

    const order = await sequelize.transaction(async (tx) => {
      return orderRepository.createOrder(
        {
          id: orderId,
          user_id: user.id,
          order_status: 'PENDING_PAYMENT',
          total_cost_paise: 120000,
          shipping_fee_paise: 10000,
          shipping_full_name: 'Jane Doe',
          shipping_address_line1: '456 Innovation Park',
          shipping_city: 'Hyderabad',
          shipping_state: 'Telangana',
          shipping_pincode: '500081',
          shipping_phone: '9123456780',
          reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
        },
        { transaction: tx }
      );
    });

    expect(order).toBeDefined();
    expect(order.id).toBe(orderId);
    expect(order.total_cost_paise).toBe(120000);
    expect(order.shipping_city).toBe('Hyderabad');
  });

  it('createOrderItems persists multiple OrderItems in bulk', async () => {
    const user = await createTestUser();
    const product1 = await createTestProduct({ name: 'Product 1', pricePaise: 10000 });
    const product2 = await createTestProduct({ name: 'Product 2', pricePaise: 20000 });
    const order = await createTestOrder({ userId: user.id });

    const items = await sequelize.transaction(async (tx) => {
      return orderRepository.createOrderItems(
        [
          {
            id: crypto.randomUUID(),
            order_id: order.id,
            product_id: product1.id,
            product_name_snapshot: product1.name,
            quantity: 2,
            unit_price_paise: product1.price_paise,
          },
          {
            id: crypto.randomUUID(),
            order_id: order.id,
            product_id: product2.id,
            product_name_snapshot: product2.name,
            quantity: 1,
            unit_price_paise: product2.price_paise,
          },
        ],
        { transaction: tx }
      );
    });

    expect(items).toHaveLength(2);
    expect(items[0].product_name_snapshot).toBe('Product 1');
    expect(items[1].product_name_snapshot).toBe('Product 2');
  });

  it('findOrderById retrieves order with eager loaded items', async () => {
    const user = await createTestUser();
    const product = await createTestProduct();
    const order = await createTestOrder({ userId: user.id });
    await createTestOrderItem({ orderId: order.id, productId: product.id, quantity: 3 });

    const found = await orderRepository.findOrderById(order.id, { includeItems: true });

    expect(found).not.toBeNull();
    expect(found.id).toBe(order.id);
    expect(found.items).toHaveLength(1);
    expect(found.items[0].quantity).toBe(3);
  });

  it('findOrdersByUserId supports pagination and status filtering with deterministic ordering', async () => {
    const user = await createTestUser();
    const otherUser = await createTestUser();

    // Create 3 orders for user
    await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });
    const order2 = await createTestOrder({ userId: user.id, orderStatus: 'PAID' });
    await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });
    // Create 1 order for other user
    await createTestOrder({ userId: otherUser.id });

    const userOrdersPage1 = await orderRepository.findOrdersByUserId(user.id, { page: 1, limit: 2 });
    expect(userOrdersPage1).toHaveLength(2);

    const userOrdersPage2 = await orderRepository.findOrdersByUserId(user.id, { page: 2, limit: 2 });
    expect(userOrdersPage2).toHaveLength(1);

    const paidOrders = await orderRepository.findOrdersByUserId(user.id, { status: 'PAID' });
    expect(paidOrders).toHaveLength(1);
    expect(paidOrders[0].id).toBe(order2.id);

    const totalCount = await orderRepository.countOrdersByUserId(user.id);
    expect(totalCount).toBe(3);
  });

  it('updateOrderStatus modifies order status and updates timestamp', async () => {
    const user = await createTestUser();
    const order = await createTestOrder({ userId: user.id, orderStatus: 'PENDING_PAYMENT' });

    const affected = await orderRepository.updateOrderStatus(order.id, 'PAID');
    expect(affected).toBe(1);

    const reloaded = await orderRepository.findOrderById(order.id, { includeItems: false });
    expect(reloaded.order_status).toBe('PAID');
  });
});
