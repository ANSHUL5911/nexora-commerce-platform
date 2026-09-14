import crypto from 'crypto';
import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter } from '../benchmark.fixtures.js';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, generateCsrfToken } from '../../../src/modules/auth/csrf.js';

/**
 * BENCH-11: Guest Checkout & Order Retrieval
 * Tests guest order initiation via POST /api/checkout/initiate and retrieval via GET /api/orders/guest/:id.
 */
export async function benchmarkGuestCheckout(app, products, { iterations = 20, warmUpCount = 3 } = {}) {
  // Helper to generate guest CSRF pair
  function getGuestCsrf() {
    const token = generateCsrfToken();
    return {
      cookieHeader: `${CSRF_COOKIE_NAME}=${token}`,
      token,
    };
  }

  const shippingPayload = (productId) => ({
    shippingAddress: {
      fullName: 'Guest Buyer',
      addressLine1: '99 Mystery Lane',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9123456780',
    },
    shippingMethod: 'STANDARD',
    items: [
      {
        productId,
        quantity: 1,
      },
    ],
  });

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    const csrf = getGuestCsrf();
    await request(app)
      .post('/api/checkout/initiate')
      .set('Cookie', csrf.cookieHeader)
      .set(CSRF_HEADER_NAME, csrf.token)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Forwarded-For', `10.200.18.${i + 1}`)
      .send(shippingPayload(products[0].id));
  }

  const queryCounter = attachQueryCounter();
  const checkoutSamples = [];
  const retrievalSamples = [];
  const errors = [];

  for (let i = 0; i < iterations; i++) {
    const csrf = getGuestCsrf();
    const idempotencyKey = crypto.randomUUID();

    // 1. Guest Checkout Initiation
    const tCheckout = now();
    let orderId = null;
    let guestToken = null;

    try {
      const res = await request(app)
        .post('/api/checkout/initiate')
        .set('Cookie', csrf.cookieHeader)
        .set(CSRF_HEADER_NAME, csrf.token)
        .set('Idempotency-Key', idempotencyKey)
        .set('X-Forwarded-For', `10.200.19.${(i % 200) + 1}`)
        .send(shippingPayload(products[i % products.length].id));

      const dCheckout = now() - tCheckout;
      checkoutSamples.push(dCheckout);

      if (res.status !== 201 || !res.body.data?.guestToken) {
        errors.push({ step: 'initiate', status: res.status, body: res.body });
      } else {
        orderId = res.body.data.id;
        guestToken = res.body.data.guestToken;
      }
    } catch (err) {
      errors.push({ step: 'initiate', error: err.message });
    }

    // 2. Guest Order Retrieval with X-Guest-Token
    if (orderId && guestToken) {
      const tRetrieval = now();
      try {
        const getRes = await request(app)
          .get(`/api/orders/guest/${orderId}`)
          .set('X-Guest-Token', guestToken)
          .set('X-Forwarded-For', `10.200.20.${(i % 200) + 1}`);

        const dRetrieval = now() - tRetrieval;
        retrievalSamples.push(dRetrieval);

        if (getRes.status !== 200) {
          errors.push({ step: 'retrieval', status: getRes.status, body: getRes.body });
        }
      } catch (err) {
        errors.push({ step: 'retrieval', error: err.message });
      }
    }
  }

  queryCounter.detach();

  return {
    scenario: 'BENCH-11: Guest Checkout & Order Retrieval',
    target: 'diagnostic / characterization',
    checkoutStats: calculateStats(checkoutSamples),
    retrievalStats: calculateStats(retrievalSamples),
    errorCount: errors.length,
    errors,
  };
}

export default {
  benchmarkGuestCheckout,
};
