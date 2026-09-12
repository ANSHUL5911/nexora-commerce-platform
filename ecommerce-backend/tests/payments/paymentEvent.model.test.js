import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { PaymentEvent } from '../../src/models/index.js';
import {
  createTestOrder,
  createTestPaymentAttempt,
  createTestPaymentEvent,
  cleanupPaymentTables,
} from './helpers/paymentTestFixtures.js';

describe('Phase 07.9 — PaymentEvent Model & PostgreSQL Constraints Tests', () => {
  beforeEach(async () => {
    await cleanupPaymentTables();
  });

  afterAll(async () => {
    await cleanupPaymentTables();
  });

  it('1. creates PaymentEvent with default processing_status RECEIVED and auto UUIDv4', async () => {
    const eventId = `evt_${crypto.randomBytes(8).toString('hex')}`;
    const event = await PaymentEvent.create({
      event_id: eventId,
      event_type: 'payment.captured',
    });

    expect(event.id).toBeDefined();
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(event.event_id).toBe(eventId);
    expect(event.event_type).toBe('payment.captured');
    expect(event.processing_status).toBe('RECEIVED');
    expect(event.received_at).toBeDefined();
  });

  it('2. enforces PostgreSQL unique constraint on event_id', async () => {
    const eventId = 'evt_duplicate_id_test';
    await createTestPaymentEvent({ eventId });

    await expect(
      createTestPaymentEvent({ eventId })
    ).rejects.toThrow();
  });

  it('3. rejects invalid processing_status via model validation', async () => {
    await expect(
      PaymentEvent.create({
        event_id: `evt_${crypto.randomBytes(8).toString('hex')}`,
        event_type: 'payment.captured',
        processing_status: 'INVALID_STATUS',
      })
    ).rejects.toThrow();
  });

  it('4. accepts all valid lifecycle statuses defined in frozen schema', async () => {
    const validStatuses = [
      'RECEIVED',
      'PROCESSING',
      'PROCESSED',
      'IGNORED_DUPLICATE',
      'REQUIRES_REFUND',
      'FAILED',
    ];

    for (const status of validStatuses) {
      const event = await createTestPaymentEvent({
        eventId: `evt_${status.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}`,
        processingStatus: status,
      });
      expect(event.processing_status).toBe(status);
    }
  });

  it('5. allows associating PaymentEvent with Order and PaymentAttempt', async () => {
    const order = await createTestOrder();
    const attempt = await createTestPaymentAttempt({ orderId: order.id });

    const event = await createTestPaymentEvent({
      orderId: order.id,
      paymentAttemptId: attempt.id,
      metadataJson: { payment_id: 'pay_123', amount: 510000 },
    });

    expect(event.order_id).toBe(order.id);
    expect(event.payment_attempt_id).toBe(attempt.id);
    expect(event.metadata_json).toEqual({
      payment_id: 'pay_123',
      amount: 510000,
    });
  });

  it('6. retains PaymentEvent with SET NULL when associated Order or PaymentAttempt is deleted', async () => {
    const order = await createTestOrder();
    const attempt = await createTestPaymentAttempt({ orderId: order.id });

    const event = await createTestPaymentEvent({
      orderId: order.id,
      paymentAttemptId: attempt.id,
    });

    // Delete PaymentAttempt
    await attempt.destroy();
    await event.reload();
    expect(event.payment_attempt_id).toBeNull();
    expect(event.order_id).toBe(order.id);

    // Delete Order
    await order.destroy();
    await event.reload();
    expect(event.order_id).toBeNull();
    expect(event.id).toBeDefined();
  });
});
