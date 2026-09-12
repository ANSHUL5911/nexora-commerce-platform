import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { Order, OrderItem, InventoryReservation, IdempotencyRecord } from '../../src/models/index.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../src/modules/auth/csrf.js';
import {
  createTestProduct,
  cleanupOrderTables,
} from './helpers/orderTestFixtures.js';

describe('Phase 07.11 — Real PostgreSQL Guest Concurrency & Idempotency Tests', () => {
  let app;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    await cleanupOrderTables();
    await IdempotencyRecord.destroy({ where: {}, truncate: true, cascade: true });
  });

  afterAll(async () => {
    await cleanupOrderTables();
    await IdempotencyRecord.destroy({ where: {}, truncate: true, cascade: true });
  });

  const validAddress = {
    fullName: 'Vikram Seth',
    addressLine1: '99 Residency Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560025',
    phone: '+919845012345',
  };

  function getCsrfPair() {
    const token = crypto.randomBytes(32).toString('hex');
    return {
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
      token,
    };
  }

  describe('1. Idempotency & Zero-Storage Token Replay Race', () => {
    it('handles 10 concurrent identical guest checkout requests with same Idempotency-Key without duplicate orders or token leakage', async () => {
      const product = await createTestProduct({
        pricePaise: 150000,
        stockQuantity: 20,
        reservedQuantity: 0,
      });

      const idempotencyKey = crypto.randomUUID();
      const concurrencyLevel = 10;

      const payload = {
        items: [{ productId: product.id, quantity: 2 }],
        shippingAddress: validAddress,
        shippingMethod: 'STANDARD',
      };

      // Launch 10 simultaneous HTTP requests with distinct client IPs to prevent artificial IP rate limit tripping
      const requests = Array.from({ length: concurrencyLevel }).map((_, index) => {
        const csrf = getCsrfPair();
        return request(app)
          .post('/api/checkout/initiate')
          .set('X-Forwarded-For', `192.168.3.${index + 1}`)
          .set('Idempotency-Key', idempotencyKey)
          .set('Cookie', csrf.cookie)
          .set(CSRF_HEADER_NAME, csrf.token)
          .send(payload);
      });

      const responses = await Promise.all(requests);

      // Verify responses: All succeeded (201 Created or 200 OK replay)
      const validResponses = responses.filter((r) => r.status === 201 || r.status === 200);
      expect(validResponses.length).toBeGreaterThan(0);

      // Extract rawToken from the live response that initially won the race
      const initialResponse = responses.find((r) => r.status === 201 && r.headers['x-idempotent-replay'] !== 'true');
      expect(initialResponse).toBeDefined();
      expect(initialResponse.body.data.guestToken).toBeDefined();
      expect(initialResponse.body.data.guestToken).toHaveLength(64);

      // Assert exactly 1 Order created in PostgreSQL
      const orders = await Order.findAll();
      expect(orders).toHaveLength(1);
      const order = orders[0];
      expect(order.user_id).toBeNull();
      expect(order.guest_token_hash).toBeDefined();

      // Assert exactly 1 set of OrderItems and InventoryReservation
      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);

      const reservations = await InventoryReservation.findAll({ where: { order_id: order.id } });
      expect(reservations).toHaveLength(1);
      expect(reservations[0].quantity).toBe(2);

      // Assert stock reserved was only for 1 order (2 units)
      await product.reload();
      expect(product.reserved_quantity).toBe(2);

      // CRITICAL SECURITY INVARIANT: Inspect idempotency_records in database
      const idempRecord = await IdempotencyRecord.findOne({ where: { idempotency_key: idempotencyKey } });
      expect(idempRecord).not.toBeNull();
      expect(idempRecord.status).toBe('COMPLETED');
      // Verify raw guest token was NEVER persisted in response_body
      expect(idempRecord.response_body?.data?.guestToken).toBeNull();

      // Subsequent replay of the same Idempotency-Key returns cached response with guestToken: null
      const replayCsrf = getCsrfPair();
      const replayRes = await request(app)
        .post('/api/checkout/initiate')
        .set('X-Forwarded-For', '192.168.3.1')
        .set('Idempotency-Key', idempotencyKey)
        .set('Cookie', replayCsrf.cookie)
        .set(CSRF_HEADER_NAME, replayCsrf.token)
        .send(payload);

      expect(replayRes.status).toBe(201);
      expect(replayRes.headers['x-idempotent-replay']).toBe('true');
      expect(replayRes.body.data.guestToken).toBeNull();
      expect(replayRes.body.data.id).toBe(order.id);
    });
  });

  describe('2. Scarce Stock Multi-Guest Checkout Race', () => {
    it('prevents overselling across 10 concurrent guest checkouts competing for 1 available unit', async () => {
      const product = await createTestProduct({
        stockQuantity: 1,
        reservedQuantity: 0, // Exactly 1 unit available
      });

      const concurrencyLevel = 10;
      const requests = Array.from({ length: concurrencyLevel }).map((_, index) => {
        const csrf = getCsrfPair();
        return request(app)
          .post('/api/checkout/initiate')
          .set('X-Forwarded-For', `192.168.4.${index + 10}`)
          .set('Idempotency-Key', crypto.randomUUID())
          .set('Cookie', csrf.cookie)
          .set(CSRF_HEADER_NAME, csrf.token)
          .send({
            items: [{ productId: product.id, quantity: 1 }],
            shippingAddress: { ...validAddress, fullName: `Guest ${index}` },
            shippingMethod: 'STANDARD',
          });
      });

      const responses = await Promise.all(requests);

      const successful = responses.filter((r) => r.status === 201);
      const outOfStock = responses.filter((r) => r.status === 400 && r.body.error?.code === 'INSUFFICIENT_STOCK');

      // Invariant: Exactly 1 order succeeds, 9 fail with INSUFFICIENT_STOCK
      expect(successful).toHaveLength(1);
      expect(outOfStock).toHaveLength(concurrencyLevel - 1);

      // Invariant: Exactly 1 order in PostgreSQL
      const totalOrders = await Order.count();
      expect(totalOrders).toBe(1);

      // Invariant: Reserved quantity is exactly 1 (No overselling)
      await product.reload();
      expect(product.reserved_quantity).toBe(1);
      expect(product.stock_quantity).toBe(1);
    });
  });
});
