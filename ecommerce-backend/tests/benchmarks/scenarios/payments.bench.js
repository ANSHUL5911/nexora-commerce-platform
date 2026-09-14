import crypto from 'crypto';
import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter, createAuthenticatedUserSession } from '../benchmark.fixtures.js';
import { razorpayGateway } from '../../../src/modules/payments/razorpay.gateway.js';
import { Order, InventoryReservation, PaymentAttempt } from '../../../src/models/index.js';

/**
 * BENCH-05: Payment Create Order (POST /api/payments/create-order)
 * Isolates internal application + database latency from mocked gateway adapter latency.
 */
export async function benchmarkPaymentCreateOrder(app, products, { iterations = 20, warmUpCount = 3 } = {}) {
  // Mock gateway createOrder with zero external network delay to isolate Nexora internal latency
  const originalCreateOrder = razorpayGateway.createOrder;
  razorpayGateway.createOrder = async ({ amountPaise, currency, receipt }) => {
    return {
      id: `order_rzp_${crypto.randomUUID().slice(0, 14)}`,
      amount: amountPaise,
      currency,
      status: 'created',
      receipt,
    };
  };

  async function preparePendingOrder() {
    const auth = await createAuthenticatedUserSession(app);
    const order = await Order.create({
      id: crypto.randomUUID(),
      user_id: auth.user.id,
      order_status: 'PENDING_PAYMENT',
      total_cost_paise: 500000,
      shipping_fee_paise: 0,
      shipping_full_name: 'Benchmarker',
      shipping_address_line1: '100 Road',
      shipping_city: 'Bengaluru',
      shipping_state: 'KA',
      shipping_pincode: '560001',
      shipping_phone: '9876543210',
      reservation_expires_at: new Date(Date.now() + 15 * 60000),
    });

    await InventoryReservation.create({
      id: crypto.randomUUID(),
      order_id: order.id,
      product_id: products[0].id,
      quantity: 1,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 15 * 60000),
    });

    return { auth, order };
  }

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    const { auth, order } = await preparePendingOrder();
    await request(app)
      .post('/api/payments/create-order')
      .set('Cookie', auth.cookieHeader)
      .set('x-csrf-token', auth.csrfToken)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Forwarded-For', `10.200.9.${i + 1}`)
      .send({ orderId: order.id });
  }

  const queryCounter = attachQueryCounter();
  const samples = [];
  const errors = [];
  const queryCounts = [];
  const queryDurations = [];

  const startTime = now();

  for (let i = 0; i < iterations; i++) {
    const { auth, order } = await preparePendingOrder();
    const idempotencyKey = crypto.randomUUID();

    queryCounter.reset();
    const reqStart = now();

    try {
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .set('X-Forwarded-For', `10.200.10.${(i % 200) + 1}`)
        .send({ orderId: order.id });

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
  razorpayGateway.createOrder = originalCreateOrder;

  const stats = calculateStats(samples);
  const throughput = Number(((iterations / totalTime) * 1000).toFixed(2));
  const avgQueryCount = Number((queryCounts.reduce((a, b) => a + b, 0) / (queryCounts.length || 1)).toFixed(1));
  const avgQueryDuration = Number((queryDurations.reduce((a, b) => a + b, 0) / (queryDurations.length || 1)).toFixed(2));

  return {
    scenario: 'BENCH-05: Payment Create Order',
    target: 'diagnostic / characterization',
    gatewayMode: 'mocked (0ms gateway overhead, isolated Nexora app+DB latency)',
    stats,
    throughputReqSec: throughput,
    avgQueryCount,
    avgQueryDurationMs: avgQueryDuration,
    errorCount: errors.length,
    errors,
  };
}

/**
 * BENCH-06: Payment Verification (POST /api/payments/verify)
 * Measures full transactional settlement and inventory conversion latency.
 */
export async function benchmarkPaymentVerification(app, products, { iterations = 20, warmUpCount = 3 } = {}) {
  const originalVerifySig = razorpayGateway.verifySignature;
  const originalFetchPayment = razorpayGateway.fetchPayment;
  const paymentAttemptMap = new Map();

  razorpayGateway.verifySignature = () => true;
  razorpayGateway.fetchPayment = async (paymentId) => ({
    id: paymentId,
    order_id: paymentAttemptMap.get(paymentId) || 'order_rzp_mock',
    status: 'captured',
    amount: 500000,
    currency: 'INR',
    captured: true,
  });

  async function prepareInitiatedPayment() {
    const auth = await createAuthenticatedUserSession(app);
    const order = await Order.create({
      id: crypto.randomUUID(),
      user_id: auth.user.id,
      order_status: 'PENDING_PAYMENT',
      total_cost_paise: 500000,
      shipping_fee_paise: 0,
      shipping_full_name: 'Benchmarker',
      shipping_address_line1: '100 Road',
      shipping_city: 'Bengaluru',
      shipping_state: 'KA',
      shipping_pincode: '560001',
      shipping_phone: '9876543210',
      reservation_expires_at: new Date(Date.now() + 15 * 60000),
    });

    await InventoryReservation.create({
      id: crypto.randomUUID(),
      order_id: order.id,
      product_id: products[0].id,
      quantity: 1,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 15 * 60000),
    });

    const rzpOrderId = `order_rzp_${crypto.randomUUID().slice(0, 14)}`;
    const attempt = await PaymentAttempt.create({
      id: crypto.randomUUID(),
      order_id: order.id,
      attempt_number: 1,
      razorpay_order_id: rzpOrderId,
      amount_paise: 500000,
      currency: 'INR',
      status: 'INITIATED',
    });

    return { auth, order, attempt, rzpOrderId };
  }

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    const { auth, order, rzpOrderId } = await prepareInitiatedPayment();
    const rzpPaymentId = `pay_rzp_${crypto.randomUUID().slice(0, 14)}`;
    paymentAttemptMap.set(rzpPaymentId, rzpOrderId);
    await request(app)
      .post('/api/payments/verify')
      .set('Cookie', auth.cookieHeader)
      .set('x-csrf-token', auth.csrfToken)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Forwarded-For', `10.200.11.${i + 1}`)
      .send({
        orderId: order.id,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        razorpaySignature: 'valid_mock_signature',
      });
  }

  const queryCounter = attachQueryCounter();
  const samples = [];
  const errors = [];
  const queryCounts = [];
  const queryDurations = [];

  const startTime = now();

  for (let i = 0; i < iterations; i++) {
    const { auth, order, rzpOrderId } = await prepareInitiatedPayment();
    const rzpPaymentId = `pay_rzp_${crypto.randomUUID().slice(0, 14)}`;
    paymentAttemptMap.set(rzpPaymentId, rzpOrderId);

    queryCounter.reset();
    const reqStart = now();

    try {
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Cookie', auth.cookieHeader)
        .set('x-csrf-token', auth.csrfToken)
        .set('Idempotency-Key', crypto.randomUUID())
        .set('X-Forwarded-For', `10.200.12.${(i % 200) + 1}`)
        .send({
          orderId: order.id,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: rzpPaymentId,
          razorpaySignature: 'valid_mock_signature',
        });

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
  razorpayGateway.verifySignature = originalVerifySig;
  razorpayGateway.fetchPayment = originalFetchPayment;

  const stats = calculateStats(samples);
  const throughput = Number(((iterations / totalTime) * 1000).toFixed(2));
  const avgQueryCount = Number((queryCounts.reduce((a, b) => a + b, 0) / (queryCounts.length || 1)).toFixed(1));
  const avgQueryDuration = Number((queryDurations.reduce((a, b) => a + b, 0) / (queryDurations.length || 1)).toFixed(2));

  return {
    scenario: 'BENCH-06: Payment Verification',
    target: 'diagnostic / characterization',
    gatewayMode: 'mocked signature & fetch (isolating transactional settlement)',
    stats,
    throughputReqSec: throughput,
    avgQueryCount,
    avgQueryDurationMs: avgQueryDuration,
    errorCount: errors.length,
    errors,
  };
}

export default {
  benchmarkPaymentCreateOrder,
  benchmarkPaymentVerification,
};
