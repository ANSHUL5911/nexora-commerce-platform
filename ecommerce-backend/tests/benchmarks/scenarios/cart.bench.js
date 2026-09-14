import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter } from '../benchmark.fixtures.js';
import { Cart, CartItem } from '../../../src/models/index.js';

/**
 * BENCH-03: Cart Retrieval (GET /api/cart)
 * Tests empty cart, small cart (2 items), and realistic cart (5 items).
 */
export async function benchmarkCartRetrieval(app, authContext, products, { iterations = 30, warmUpCount = 5 } = {}) {
  const { cookieHeader, user, csrfToken } = authContext;

  // Provision cart with items
  const [cart] = await Cart.findOrCreate({ where: { user_id: user.id } });
  await CartItem.destroy({ where: { cart_id: cart.id } });

  // Add 3 items to cart for realistic cart benchmark
  for (let j = 0; j < 3; j++) {
    await CartItem.create({
      cart_id: cart.id,
      product_id: products[j].id,
      quantity: 2,
    });
  }

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    await request(app)
      .get('/api/cart')
      .set('Cookie', cookieHeader)
      .set('x-csrf-token', csrfToken)
      .set('X-Forwarded-For', `10.200.5.${i + 1}`);
  }

  const queryCounter = attachQueryCounter();
  const samples = [];
  const errors = [];
  const queryCounts = [];
  const queryDurations = [];

  const startTime = now();

  for (let i = 0; i < iterations; i++) {
    queryCounter.reset();
    const reqStart = now();

    try {
      const res = await request(app)
        .get('/api/cart')
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', csrfToken)
        .set('X-Forwarded-For', `10.200.6.${(i % 200) + 1}`);

      const duration = now() - reqStart;
      samples.push(duration);
      queryCounts.push(queryCounter.getCount());
      queryDurations.push(queryCounter.getDurationMs());

      if (res.status !== 200) {
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
  const avgQueryCount = Number((queryCounts.reduce((a, b) => a + b, 0) / queryCounts.length).toFixed(1));
  const avgQueryDuration = Number((queryDurations.reduce((a, b) => a + b, 0) / queryDurations.length).toFixed(2));

  return {
    scenario: 'BENCH-03: Cart Retrieval',
    target: 'diagnostic / characterization',
    stats,
    throughputReqSec: throughput,
    avgQueryCount,
    avgQueryDurationMs: avgQueryDuration,
    errorCount: errors.length,
    errors,
  };
}

export default {
  benchmarkCartRetrieval,
};
