import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { sequelize } from '../../src/config/database.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';
import {
  User,
  Product,
  Order,
  InventoryReservation,
  PaymentAttempt,
} from '../../src/models/index.js';
import { paymentService } from '../../src/modules/payments/payment.service.js';
import { hashPassword } from '../../src/modules/auth/password.js';

describe('Phase 07.19 — Payment Settlement Concurrency & Invariant Verification', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await migrateReset(sequelize);
    const migrator = getMigrator(sequelize);
    await migrator.up();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  beforeEach(async () => {
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

  async function createTestCustomer() {
    const password_hash = await hashPassword('Password123!');
    return User.create({
      id: crypto.randomUUID(),
      email: `payment-concurrency-${crypto.randomUUID()}@test.local`,
      password_hash,
      full_name: 'Payment Concurrency Customer',
      role: 'customer',
      is_active: true,
    });
  }

  describe('TEST 04 — 10 Simultaneous Identical Payment Settlements (settleCapturedPayment)', () => {
    it('results in exactly 1 settlement execution, exactly 0 duplicate inventory deductions, and consistent terminal state', async () => {
      const user = await createTestCustomer();

      // Product has initial stock 10, 2 reserved
      const product = await Product.create({
        id: crypto.randomUUID(),
        name: 'Concurrent Payment Trench',
        description: 'Outerwear',
        price_paise: 299900,
        stock_quantity: 10,
        reserved_quantity: 2,
        category: 'Outerwear',
        image_url: 'https://example.com/img.jpg',
      });

      const order = await Order.create({
        id: crypto.randomUUID(),
        user_id: user.id,
        order_status: 'PENDING_PAYMENT',
        total_cost_paise: 599800,
        shipping_fee_paise: 0,
        shipping_full_name: 'Payment Customer',
        shipping_address_line1: '123 Pay Lane',
        shipping_city: 'Bengaluru',
        shipping_state: 'Karnataka',
        shipping_pincode: '560001',
        shipping_phone: '+919999999999',
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

      const paymentAttempt = await PaymentAttempt.create({
        id: crypto.randomUUID(),
        order_id: order.id,
        attempt_number: 1,
        razorpay_order_id: `rzp_ord_${crypto.randomUUID().slice(0, 14)}`,
        status: 'INITIATED',
        amount_paise: 599800,
        currency: 'INR',
      });

      const razorpayPaymentId = `pay_captured_${crypto.randomBytes(6).toString('hex')}`;

      // Launch 10 simultaneous calls to settleCapturedPayment
      const settlementPromises = Array.from({ length: 10 }).map(() =>
        paymentService.settleCapturedPayment({
          orderId: order.id,
          paymentAttemptId: paymentAttempt.id,
          razorpayPaymentId,
        })
      );

      const results = await Promise.allSettled(settlementPromises);

      // All 10 invocations must succeed (either first execution or idempotent replay)
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(10);

      for (const res of fulfilled) {
        expect(res.value.settled).toBe(true);
      }

      // Assert Order terminal state is PAID
      await order.reload();
      expect(order.order_status).toBe('PAID');

      // Assert PaymentAttempt terminal state is SUCCESS
      await paymentAttempt.reload();
      expect(paymentAttempt.status).toBe('SUCCESS');
      expect(paymentAttempt.razorpay_payment_id).toBe(razorpayPaymentId);

      // Assert exactly 1 SUCCESS payment attempt exists in PostgreSQL (partial unique index invariant)
      const successAttemptsCount = await PaymentAttempt.count({
        where: { order_id: order.id, status: 'SUCCESS' },
      });
      expect(successAttemptsCount).toBe(1);

      // Assert Reservation terminal state is CONVERTED
      await reservation.reload();
      expect(reservation.status).toBe('CONVERTED');

      // CRITICAL INVARIANT: Product stock was decremented EXACTLY ONCE (10 - 2 = 8)
      // and reserved quantity was cleared to 0 (2 - 2 = 0)
      await product.reload();
      expect(product.stock_quantity).toBe(8);
      expect(product.reserved_quantity).toBe(0);
      expect(product.available_quantity).toBe(8);
    });
  });

  describe('Multi-Order Concurrent Settlements', () => {
    it('safely processes 5 different order settlements concurrently without deadlocks or cross-talk', async () => {
      const user = await createTestCustomer();

      const product = await Product.create({
        id: crypto.randomUUID(),
        name: 'Shared Stock Item',
        description: 'Shared across orders',
        price_paise: 100000,
        stock_quantity: 20,
        reserved_quantity: 5,
        category: 'Apparel',
        image_url: 'https://example.com/item.jpg',
      });

      // Create 5 orders, each reserving 1 unit
      const ordersWithAttempts = await Promise.all(
        Array.from({ length: 5 }).map(async (_, idx) => {
          const ord = await Order.create({
            id: crypto.randomUUID(),
            user_id: user.id,
            order_status: 'PENDING_PAYMENT',
            total_cost_paise: 100000,
            shipping_fee_paise: 0,
            shipping_full_name: `Customer ${idx}`,
            shipping_address_line1: 'Road',
            shipping_city: 'City',
            shipping_state: 'State',
            shipping_pincode: '560001',
            shipping_phone: '+919999999999',
            reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
          });

          await InventoryReservation.create({
            id: crypto.randomUUID(),
            order_id: ord.id,
            product_id: product.id,
            quantity: 1,
            status: 'ACTIVE',
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          });

          const att = await PaymentAttempt.create({
            id: crypto.randomUUID(),
            order_id: ord.id,
            attempt_number: 1,
            razorpay_order_id: `rzp_multi_${idx}_${crypto.randomUUID().slice(0, 10)}`,
            status: 'INITIATED',
            amount_paise: 100000,
            currency: 'INR',
          });

          return { ord, att };
        })
      );

      // Settle all 5 orders concurrently
      const settlementResults = await Promise.all(
        ordersWithAttempts.map(({ ord, att }, idx) =>
          paymentService.settleCapturedPayment({
            orderId: ord.id,
            paymentAttemptId: att.id,
            razorpayPaymentId: `pay_multi_${idx}_${crypto.randomBytes(4).toString('hex')}`,
          })
        )
      );

      expect(settlementResults).toHaveLength(5);
      for (const res of settlementResults) {
        expect(res.settled).toBe(true);
      }

      // Assert total stock decremented by exactly 5 (20 - 5 = 15) and reserved = 0
      await product.reload();
      expect(product.stock_quantity).toBe(15);
      expect(product.reserved_quantity).toBe(0);
      expect(product.available_quantity).toBe(15);
    });
  });
});
