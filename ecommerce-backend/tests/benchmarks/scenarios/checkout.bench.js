import crypto from 'crypto';
import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter, createAuthenticatedUserSession } from '../benchmark.fixtures.js';
import { Cart, CartItem } from '../../../src/models/index.js';

/**
 * BENCH-04: Checkout / Order Creation
 * Route: POST /api/checkout/initiate (Active Phase 07.14/07.15 contract)
 * Frozen requirement: p95 < 300 ms
 * Invariant: Transaction boundary intact (cart lock -> validate -> deterministic product locks -> Order -> OrderItems -> reserve inventory -> clear cart).
 */
export async function benchmarkCheckoutCreation(app, products, { iterations = 20, warmUpCount = 3 } = {}) {
  // Helper to prepare an authenticated customer with a cart ready for checkout
  async function prepareCheckoutUser() {
    const auth = await createAuthenticatedUserSession(app);
    const [cart] = await Cart.findOrCreate({ where: { user_id: auth.user.id } });
    await CartItem.destroy({ where: { cart_id: cart.id } });

    // Put 2 items in cart
    await CartItem.create({
      cart_id: cart.id,
      product_id: products[0].id,
      quantity: 1,
    });
    await CartItem.create({
      cart_id: cart.id,
      product_id: products[1].id,
      quantity: 1,
    });

    return { auth, cart };
  }

  const shippingPayload = {
    shippingAddress: {
      fullName: 'Benchmark Tester',
      addressLine1: '42 High Performance Way',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      phone: '9876543210',
    },
    shippingMethod: 'STANDARD',
  };

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    const { auth } = await prepareCheckoutUser();
    await request(app)
      .post('/api/checkout/initiate')
      .set('Cookie', auth.cookieHeader)
      .set('x-csrf-token', auth.csrfToken)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Forwarded-For', `10.200.7.${i + 1}`)
      .send(shippingPayload);
  }

  const queryCounter = attachQueryCounter();
  const samples = [];
  const errors = [];
  const queryCounts = [];
  const queryDurations = [];

  const startTime = now();

  for (let i = 0; i < iterations; i++) {
    const { auth } = await prepareCheckoutUser();
    const idempotencyKey = crypto.randomUUID();

    queryCounter.reset();
    const reqStart = now();

    try {
      const res = await request(app)
        .post('/api/checkout/initiate')
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .set('X-Forwarded-For', `10.200.8.${(i % 200) + 1}`)
        .send(shippingPayload);

      const duration = now() - reqStart;
      samples.push(duration);
      queryCounts.push(queryCounter.getCount());
      queryDurations.push(queryCounter.getDurationMs());

      if (res.status !== 201) {
        errors.push({ status: res.status, body: res.body });
      }
    } catch (err) {
      errors.push({ error: err.message });
    }
  }

  const totalTime = now() - startTime;
  queryCounter.detach();

  const stats = calculateStats(samples);
  const throughput = Number(((iterations / totalTime) * 1000).toFixed(2));
  const avgQueryCount = Number((queryCounts.reduce((a, b) => a + b, 0) / (queryCounts.length || 1)).toFixed(1));
  const avgQueryDuration = Number((queryDurations.reduce((a, b) => a + b, 0) / (queryDurations.length || 1)).toFixed(2));

  return {
    scenario: 'BENCH-04: Checkout / Order Creation (POST /api/checkout/initiate)',
    target: 'p95 < 300 ms',
    passed: stats.p95 < 300 && errors.length === 0,
    stats,
    throughputReqSec: throughput,
    avgQueryCount,
    avgQueryDurationMs: avgQueryDuration,
    errorCount: errors.length,
    errors,
  };
}

export default {
  benchmarkCheckoutCreation,
};
