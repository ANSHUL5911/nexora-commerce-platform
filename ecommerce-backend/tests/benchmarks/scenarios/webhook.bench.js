import crypto from 'crypto';
import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter } from '../benchmark.fixtures.js';
import { config } from '../../../src/config/env.js';
import {
  createTestProduct,
  createTestOrder,
  createTestReservation,
  createTestPaymentAttempt,
  generateWebhookSignature,
  generateCapturedWebhookPayload,
} from '../../payments/helpers/paymentTestFixtures.js';

/**
 * BENCH-07: Razorpay Webhook Ingestion & Processing
 * Target: p95 < 150 ms for Nexora-side internal processing.
 * Preserves HMAC signature verification, event idempotency, settlement transaction, inventory conversion.
 */
export async function benchmarkWebhookProcessing(app, products, { iterations = 25, warmUpCount = 3 } = {}) {
  async function prepareWebhookScenario() {
    const orderTotal = 500000;
    const order = await createTestOrder({
      totalCostPaise: orderTotal,
      orderStatus: 'PENDING_PAYMENT',
    });
    const product = await createTestProduct({
      pricePaise: 500000,
      stockQuantity: 10,
      reservedQuantity: 1,
    });
    await createTestReservation({
      orderId: order.id,
      productId: product.id,
      quantity: 1,
      status: 'ACTIVE',
    });
    const paymentAttempt = await createTestPaymentAttempt({
      orderId: order.id,
      amountPaise: orderTotal,
      status: 'INITIATED',
    });

    return { order, paymentAttempt, orderTotal };
  }

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    const { paymentAttempt, orderTotal } = await prepareWebhookScenario();
    const payload = generateCapturedWebhookPayload({
      razorpayOrderId: paymentAttempt.razorpay_order_id,
      amountPaise: orderTotal,
    });
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, config.RAZORPAY_WEBHOOK_SECRET);

    await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('X-Forwarded-For', `10.200.13.${i + 1}`)
      .send(rawBody);
  }

  const queryCounter = attachQueryCounter();
  const samples = [];
  const errors = [];
  const queryCounts = [];
  const queryDurations = [];

  const subScenarios = {
    firstCapture: [],
    duplicateEvent: [],
    invalidSignature: [],
    paymentMismatch: [],
    lateCapture: [],
  };

  const startTime = now();

  for (let i = 0; i < iterations; i++) {
    const { paymentAttempt, orderTotal } = await prepareWebhookScenario();
    const eventId = `evt_bench_${crypto.randomUUID().slice(0, 12)}`;

    // 1. First Valid Capture
    const payload = generateCapturedWebhookPayload({
      eventId,
      razorpayOrderId: paymentAttempt.razorpay_order_id,
      amountPaise: orderTotal,
    });
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, config.RAZORPAY_WEBHOOK_SECRET);

    queryCounter.reset();
    const t0 = now();

    try {
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .set('X-Forwarded-For', `10.200.14.${(i % 200) + 1}`)
        .send(rawBody);

      const d0 = now() - t0;
      samples.push(d0);
      subScenarios.firstCapture.push(d0);
      queryCounts.push(queryCounter.getCount());
      queryDurations.push(queryCounter.getDurationMs());

      if (res.status !== 200 || !res.body.received) {
        errors.push({ subScenario: 'firstCapture', status: res.status, body: res.body });
      }

      // 2. Immediate Duplicate Delivery (Idempotency test)
      queryCounter.reset();
      const tDup = now();
      const dupRes = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .set('X-Forwarded-For', `10.200.15.${(i % 200) + 1}`)
        .send(rawBody);
      const dDup = now() - tDup;
      subScenarios.duplicateEvent.push(dDup);

      if (dupRes.status !== 200 || !['ignored_duplicate', 'already_processed'].includes(dupRes.body.status)) {
        errors.push({ subScenario: 'duplicateEvent', status: dupRes.status, body: dupRes.body });
      }
    } catch (err) {
      errors.push({ error: err.message });
    }
  }

  // 3. Test Invalid Signature
  const badBody = JSON.stringify({ entity: 'event' });
  const tBad = now();
  const badRes = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', 'tampered_bad_signature_hex')
    .set('X-Forwarded-For', '10.200.16.1')
    .send(badBody);
  subScenarios.invalidSignature.push(now() - tBad);
  if (badRes.status !== 400) {
    errors.push({ subScenario: 'invalidSignature', status: badRes.status });
  }

  const totalTime = now() - startTime;
  queryCounter.detach();

  const stats = calculateStats(samples);
  const throughput = Number(((iterations / totalTime) * 1000).toFixed(2));
  const avgQueryCount = Number((queryCounts.reduce((a, b) => a + b, 0) / (queryCounts.length || 1)).toFixed(1));
  const avgQueryDuration = Number((queryDurations.reduce((a, b) => a + b, 0) / (queryDurations.length || 1)).toFixed(2));

  return {
    scenario: 'BENCH-07: Razorpay Webhook Processing',
    target: 'p95 < 150 ms',
    passed: stats.p95 < 150 && errors.length === 0,
    stats,
    throughputReqSec: throughput,
    avgQueryCount,
    avgQueryDurationMs: avgQueryDuration,
    subScenarios: {
      firstCapture: calculateStats(subScenarios.firstCapture),
      duplicateEvent: calculateStats(subScenarios.duplicateEvent),
      invalidSignature: calculateStats(subScenarios.invalidSignature),
    },
    errorCount: errors.length,
    errors,
  };
}

export default {
  benchmarkWebhookProcessing,
};
