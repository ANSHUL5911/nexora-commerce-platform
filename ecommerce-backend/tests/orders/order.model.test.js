import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { User, Product, Order, OrderItem } from '../../src/models/index.js';
import {
  toOrderDTO,
  toOrderSummaryDTO,
} from '../../src/modules/orders/order.dto.js';
import {
  createTestUser,
  createTestProduct,
  createTestOrder,
  createTestOrderItem,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.7 — Order & OrderItem Model & DTO Unit Tests', () => {
  beforeEach(async () => {
    await cleanupOrderTables();
  });

  afterAll(async () => {
    await cleanupOrderTables();
  });

  describe('1. Order Model Persistence & Invariants', () => {
    it('creates an Order with valid UUID and default PENDING_PAYMENT status', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({
        userId: user.id,
        totalCostPaise: 99900,
        shippingFeePaise: 0,
      });

      expect(order.id).toBeDefined();
      expect(order.order_status).toBe('PENDING_PAYMENT');
      expect(order.total_cost_paise).toBe(99900);
      expect(order.shipping_fee_paise).toBe(0);
      expect(order.subtotal_paise).toBe(99900);
      expect(order.user_id).toBe(user.id);
      expect(order.reservation_expires_at).toBeInstanceOf(Date);
    });

    it('enforces check constraint on valid order_status values', async () => {
      const user = await createTestUser();
      await expect(
        Order.create({
          id: crypto.randomUUID(),
          user_id: user.id,
          order_status: 'INVALID_STATUS',
          total_cost_paise: 50000,
          shipping_fee_paise: 0,
          shipping_full_name: 'Test Customer',
          shipping_address_line1: '123 Main St',
          shipping_city: 'Mumbai',
          shipping_state: 'Maharashtra',
          shipping_pincode: '400001',
          shipping_phone: '9876543210',
          reservation_expires_at: new Date(),
        })
      ).rejects.toThrow();
    });

    it('enforces check constraint on non-negative total_cost_paise and shipping_fee_paise', async () => {
      const user = await createTestUser();
      await expect(
        Order.create({
          id: crypto.randomUUID(),
          user_id: user.id,
          order_status: 'PENDING_PAYMENT',
          total_cost_paise: -100,
          shipping_fee_paise: 0,
          shipping_full_name: 'Test Customer',
          shipping_address_line1: '123 Main St',
          shipping_city: 'Mumbai',
          shipping_state: 'Maharashtra',
          shipping_pincode: '400001',
          shipping_phone: '9876543210',
          reservation_expires_at: new Date(),
        })
      ).rejects.toThrow();

      await expect(
        Order.create({
          id: crypto.randomUUID(),
          user_id: user.id,
          order_status: 'PENDING_PAYMENT',
          total_cost_paise: 50000,
          shipping_fee_paise: -50,
          shipping_full_name: 'Test Customer',
          shipping_address_line1: '123 Main St',
          shipping_city: 'Mumbai',
          shipping_state: 'Maharashtra',
          shipping_pincode: '400001',
          shipping_phone: '9876543210',
          reservation_expires_at: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  describe('2. OrderItem Model Persistence & Invariants', () => {
    it('creates an OrderItem with immutable snapshot and calculates line_total_paise', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ pricePaise: 25000 });
      const order = await createTestOrder({ userId: user.id, totalCostPaise: 50000 });

      const item = await createTestOrderItem({
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: 2,
        unitPricePaise: 25000,
      });

      expect(item.id).toBeDefined();
      expect(item.order_id).toBe(order.id);
      expect(item.product_id).toBe(product.id);
      expect(item.product_name_snapshot).toBe('Test Mechanical Keyboard');
      expect(item.quantity).toBe(2);
      expect(item.unit_price_paise).toBe(25000);
      expect(item.line_total_paise).toBe(50000);
    });

    it('enforces check constraints on quantity > 0 and unit_price_paise >= 0', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });

      await expect(
        OrderItem.create({
          id: crypto.randomUUID(),
          order_id: order.id,
          product_id: product.id,
          product_name_snapshot: product.name,
          quantity: 0,
          unit_price_paise: 10000,
        })
      ).rejects.toThrow();

      await expect(
        OrderItem.create({
          id: crypto.randomUUID(),
          order_id: order.id,
          product_id: product.id,
          product_name_snapshot: product.name,
          quantity: 1,
          unit_price_paise: -100,
        })
      ).rejects.toThrow();
    });

    it('cascades deletion of order_items when parent order is deleted', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });
      const item = await createTestOrderItem({
        orderId: order.id,
        productId: product.id,
      });

      await order.destroy();

      const foundItem = await OrderItem.findByPk(item.id);
      expect(foundItem).toBeNull();
    });

    it('restricts deletion of product when order_items reference it', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });
      await createTestOrderItem({
        orderId: order.id,
        productId: product.id,
      });

      await expect(product.destroy()).rejects.toThrow();
    });
  });

  describe('3. Model Associations & Eager Loading', () => {
    it('associates User with Order and Order with User', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      const fetchedOrder = await Order.findByPk(order.id, {
        include: [{ model: User, as: 'user' }],
      });

      expect(fetchedOrder.user).toBeDefined();
      expect(fetchedOrder.user.id).toBe(user.id);
    });

    it('associates Order with OrderItems and OrderItem with Product and Order', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({ userId: user.id });
      const item = await createTestOrderItem({
        orderId: order.id,
        productId: product.id,
      });

      const fetchedOrder = await Order.findByPk(order.id, {
        include: [
          {
            model: OrderItem,
            as: 'items',
            include: [{ model: Product, as: 'product' }],
          },
        ],
      });

      expect(fetchedOrder.items).toHaveLength(1);
      expect(fetchedOrder.items[0].id).toBe(item.id);
      expect(fetchedOrder.items[0].product.id).toBe(product.id);
    });
  });

  describe('4. DTO Serialization', () => {
    it('toOrderDTO serializes full order details with integer numbers (no BigInt strings or leaks)', async () => {
      const user = await createTestUser();
      const product = await createTestProduct({ pricePaise: 45000 });
      const order = await createTestOrder({
        userId: user.id,
        totalCostPaise: 55000,
        shippingFeePaise: 10000,
      });
      await createTestOrderItem({
        orderId: order.id,
        productId: product.id,
        quantity: 1,
        unitPricePaise: 45000,
      });

      const fullOrder = await Order.findByPk(order.id, {
        include: [{ model: OrderItem, as: 'items' }],
      });

      const dto = toOrderDTO(fullOrder);

      expect(dto.id).toBe(order.id);
      expect(dto.userId).toBe(user.id);
      expect(dto.status).toBe('PENDING_PAYMENT');
      expect(dto.subtotalPaise).toBe(45000);
      expect(dto.shippingFeePaise).toBe(10000);
      expect(dto.totalPaise).toBe(55000);
      expect(typeof dto.totalPaise).toBe('number');
      expect(dto.shippingAddress.fullName).toBe('John Doe');
      expect(dto.shippingAddress.pincode).toBe('560001');
      expect(dto.items).toHaveLength(1);
      expect(dto.items[0].unitPricePaise).toBe(45000);
      expect(dto.items[0].lineTotalPaise).toBe(45000);
      expect(dto.items[0].productName).toBe('Test Mechanical Keyboard');
    });

    it('toOrderSummaryDTO formats high-level order summary with item count', async () => {
      const user = await createTestUser();
      const product = await createTestProduct();
      const order = await createTestOrder({
        userId: user.id,
        totalCostPaise: 500000,
        shippingFeePaise: 0,
      });
      await createTestOrderItem({ orderId: order.id, productId: product.id });

      const fullOrder = await Order.findByPk(order.id, {
        include: [{ model: OrderItem, as: 'items' }],
      });

      const summaryDTO = toOrderSummaryDTO(fullOrder);

      expect(summaryDTO.id).toBe(order.id);
      expect(summaryDTO.itemCount).toBe(1);
      expect(summaryDTO.totalPaise).toBe(500000);
      expect(summaryDTO.subtotalPaise).toBe(500000);
    });
  });
});
