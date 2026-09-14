import crypto from 'crypto';
import request from 'supertest';
import { now } from '../benchmark.stats.js';
import { createAuthenticatedUserSession } from '../benchmark.fixtures.js';
import { Cart, CartItem, Order, InventoryReservation } from '../../../src/models/index.js';

/**
 * BENCH-10: Idempotency Concurrency
 * Tests 10 concurrent identical requests with the exact same Idempotency-Key.
 * Verifies exactly one Order created, cached response replayed, zero duplicate reservations.
 */
export async function benchmarkIdempotencyConcurrency(app, products, { concurrency = 10 } = {}) {
  const auth = await createAuthenticatedUserSession(app);
  const [cart] = await Cart.findOrCreate({ where: { user_id: auth.user.id } });
  await CartItem.destroy({ where: { cart_id: cart.id } });

  await CartItem.create({
    cart_id: cart.id,
    product_id: products[0].id,
    quantity: 1,
  });

  const idempotencyKey = `idemp_bench_${crypto.randomUUID()}`;
  const payload = {
    shippingAddress: {
      fullName: 'Idempotency Tester',
      addressLine1: '10 Replay Blvd',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      phone: '9876543210',
    },
    shippingMethod: 'STANDARD',
  };

  const t0 = now();

  // Launch 10 simultaneous identical requests with the SAME Idempotency-Key
  const promises = Array.from({ length: concurrency }).map((_, idx) => {
    return request(app)
      .post('/api/checkout/initiate')
      .set('Cookie', auth.cookieHeader)
      .set('x-csrf-token', auth.csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .set('X-Forwarded-For', `10.200.17.${idx + 1}`)
      .send(payload);
  });

  const responses = await Promise.all(promises);
  const totalDurationMs = now() - t0;

  // Filter responses
  const successfulResponses = responses.filter((r) => r.status === 201 || r.status === 200);
  const createdOrders = new Set(successfulResponses.map((r) => r.body.data?.id).filter(Boolean));

  // Check DB for number of created orders and reservations
  const ordersInDb = await Order.findAll({ where: { user_id: auth.user.id } });
  const reservationsInDb = await InventoryReservation.findAll({
    where: { order_id: ordersInDb.map((o) => o.id) },
  });

  const correctnessPassed =
    createdOrders.size === 1 &&
    ordersInDb.length === 1 &&
    reservationsInDb.length === 1;

  return {
    scenario: 'BENCH-10: Idempotency Concurrency (10 concurrent identical requests)',
    concurrency,
    successfulResponsesCount: successfulResponses.length,
    distinctOrderIdsInResponses: createdOrders.size,
    ordersInDatabase: ordersInDb.length,
    reservationsInDatabase: reservationsInDb.length,
    totalDurationMs: Number(totalDurationMs.toFixed(2)),
    avgPerRequestMs: Number((totalDurationMs / concurrency).toFixed(2)),
    correctnessPassed,
  };
}

export default {
  benchmarkIdempotencyConcurrency,
};
