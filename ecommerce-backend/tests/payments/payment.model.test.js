import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { PaymentAttempt } from '../../src/models/PaymentAttempt.js';
import { Order } from '../../src/models/Order.js';
import {
  createTestUser,
  createTestOrder,
  createTestPaymentAttempt,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';

describe('Phase 07.8 — PaymentAttempt Model & Database Integrity Tests', () => {
  beforeEach(async () => {
    await cleanupPaymentTables();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

  describe('1. Model Attributes & Defaults', () => {
    it('creates a PaymentAttempt with valid UUID and default INITIATED status', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      const attempt = await PaymentAttempt.create({
        order_id: order.id,
        attempt_number: 1,
        amount_paise: 500000,
      });

      expect(attempt.id).toBeDefined();
      expect(typeof attempt.id).toBe('string');
      expect(attempt.status).toBe('INITIATED');
      expect(attempt.attempt_number).toBe(1);
      expect(attempt.amount_paise).toBe(500000);
      expect(typeof attempt.amount_paise).toBe('number');
      expect(attempt.razorpay_order_id).toBeNull();
      expect(attempt.razorpay_payment_id).toBeNull();
      expect(attempt.created_at).toBeDefined();
    });

    it('converts BIGINT amount_paise safely to integer JS number', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      const attempt = await PaymentAttempt.create({
        order_id: order.id,
        attempt_number: 1,
        amount_paise: 9999999,
      });

      expect(typeof attempt.amount_paise).toBe('number');
      expect(attempt.amount_paise).toBe(9999999);
    });
  });

  describe('2. Foreign Key & Relational Constraints', () => {
    it('cascades deletion when parent Order is deleted', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      const attempt = await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
      });

      await Order.destroy({ where: { id: order.id } });

      const found = await PaymentAttempt.findByPk(attempt.id);
      expect(found).toBeNull();
    });
  });

  describe('3. Database CHECK Constraints', () => {
    it('rejects attempt_number <= 0 (chk_payment_attempts_attempt_number)', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      await expect(
        PaymentAttempt.create({
          order_id: order.id,
          attempt_number: 0,
          amount_paise: 1000,
        })
      ).rejects.toThrow();
    });

    it('rejects invalid status values (chk_payment_attempts_status)', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      await expect(
        PaymentAttempt.create({
          order_id: order.id,
          attempt_number: 1,
          amount_paise: 1000,
          status: 'SETTLED_INVALID',
        })
      ).rejects.toThrow();
    });

    it('rejects negative amount_paise (chk_payment_attempts_amount_paise)', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      await expect(
        PaymentAttempt.create({
          order_id: order.id,
          attempt_number: 1,
          amount_paise: -500,
        })
      ).rejects.toThrow();
    });
  });

  describe('4. Unique Constraints & Partial Indexes', () => {
    it('rejects duplicate attempt_number for the same order (uq_payment_attempts_order_attempt)', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        status: 'FAILED',
      });

      await expect(
        createTestPaymentAttempt({
          orderId: order.id,
          attemptNumber: 1,
          status: 'INITIATED',
        })
      ).rejects.toThrow();
    });

    it('permits multiple retry attempts with incrementing attempt_number for same order', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      const attempt1 = await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        status: 'FAILED',
      });

      const attempt2 = await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 2,
        status: 'INITIATED',
      });

      expect(attempt1.id).not.toBe(attempt2.id);
      expect(attempt1.order_id).toBe(attempt2.order_id);
      expect(attempt1.attempt_number).toBe(1);
      expect(attempt2.attempt_number).toBe(2);
    });

    it('enforces at most ONE SUCCESS payment attempt per order (uq_one_success_payment_per_order)', async () => {
      const user = await createTestUser();
      const order = await createTestOrder({ userId: user.id });

      await createTestPaymentAttempt({
        orderId: order.id,
        attemptNumber: 1,
        status: 'SUCCESS',
        razorpayPaymentId: 'pay_001',
      });

      await expect(
        createTestPaymentAttempt({
          orderId: order.id,
          attemptNumber: 2,
          status: 'SUCCESS',
          razorpayPaymentId: 'pay_002',
        })
      ).rejects.toThrow();
    });

    it('enforces unique razorpay_order_id across non-null values (idx_payment_attempts_rzp_order)', async () => {
      const user = await createTestUser();
      const order1 = await createTestOrder({ userId: user.id });
      const order2 = await createTestOrder({ userId: user.id });

      const rzpOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;

      await createTestPaymentAttempt({
        orderId: order1.id,
        attemptNumber: 1,
        razorpayOrderId: rzpOrderId,
      });

      await expect(
        createTestPaymentAttempt({
          orderId: order2.id,
          attemptNumber: 1,
          razorpayOrderId: rzpOrderId,
        })
      ).rejects.toThrow();
    });
  });
});
