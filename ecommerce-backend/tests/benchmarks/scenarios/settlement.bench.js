import crypto from 'crypto';
import { now } from '../benchmark.stats.js';
import { Product, Order, InventoryReservation, PaymentAttempt } from '../../../src/models/index.js';
import { paymentService } from '../../../src/modules/payments/payment.service.js';

/**
 * BENCH-09: Payment Settlement Concurrency
 * Tests 10 and 25 concurrent invocations of paymentService.settleCapturedPayment against PostgreSQL.
 * Verifies exactly one stock deduction, exactly one SUCCESS PaymentAttempt, and measures latency distribution.
 */
export async function benchmarkPaymentSettlementConcurrency({ levels = [10, 25] } = {}) {
  const results = [];

  for (const concurrency of levels) {
    const initialStock = 10;
    const reservedQty = 2;

    const product = await Product.create({
      id: crypto.randomUUID(),
      name: `Settlement Test Garment ${concurrency}`,
      description: 'Test garment for concurrent settlement',
      price_paise: 299900,
      stock_quantity: initialStock,
      reserved_quantity: reservedQty,
      category: 'Outerwear',
      image_url: 'https://example.com/img.jpg',
    });

    const order = await Order.create({
      id: crypto.randomUUID(),
      user_id: null,
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
      quantity: reservedQty,
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

    const razorpayPaymentId = `pay_bench_${crypto.randomUUID().slice(0, 12)}`;

    const t0 = now();
    const settlementPromises = Array.from({ length: concurrency }).map(() =>
      paymentService.settleCapturedPayment({
        orderId: order.id,
        paymentAttemptId: paymentAttempt.id,
        razorpayPaymentId,
      })
    );

    const callResults = await Promise.allSettled(settlementPromises);
    const totalDurationMs = now() - t0;

    const fulfilled = callResults.filter((r) => r.status === 'fulfilled');
    const allSettledTrue = fulfilled.every((r) => r.value.settled === true);

    await order.reload();
    await paymentAttempt.reload();
    await product.reload();
    await reservation.reload();

    const expectedFinalStock = initialStock - reservedQty; // 10 - 2 = 8
    const expectedFinalReserved = 0;

    const correctnessPassed =
      fulfilled.length === concurrency &&
      allSettledTrue &&
      order.order_status === 'PAID' &&
      paymentAttempt.status === 'SUCCESS' &&
      paymentAttempt.razorpay_payment_id === razorpayPaymentId &&
      product.stock_quantity === expectedFinalStock &&
      product.reserved_quantity === expectedFinalReserved &&
      reservation.status === 'CONVERTED';

    results.push({
      concurrency,
      totalCalls: concurrency,
      fulfilledCount: fulfilled.length,
      finalOrderStatus: order.order_status,
      finalStock: product.stock_quantity,
      finalReserved: product.reserved_quantity,
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
      avgPerCallMs: Number((totalDurationMs / concurrency).toFixed(2)),
      correctnessPassed,
    });
  }

  return {
    scenario: 'BENCH-09: Payment Settlement Concurrency (10 and 25 calls)',
    results,
    allCorrectnessPassed: results.every((r) => r.correctnessPassed),
  };
}

export default {
  benchmarkPaymentSettlementConcurrency,
};
