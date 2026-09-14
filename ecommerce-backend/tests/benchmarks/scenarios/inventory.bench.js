import { now } from '../benchmark.stats.js';
import { inventoryService } from '../../../src/modules/inventory/inventory.service.js';
import { createTestUser, createTestProduct, createTestOrder } from '../../orders/helpers/orderTestFixtures.js';

/**
 * BENCH-08: Inventory Concurrency
 * Tests 10, 25, and 50 concurrent reservation attempts against PostgreSQL.
 * Decoupled into Correctness Invariants (hard gates) and Performance Characteristics.
 */
export async function benchmarkInventoryConcurrency(app, { levels = [10, 25, 50] } = {}) {
  const results = [];

  for (const concurrency of levels) {
    // 1. Correctness Test on Contested Stock (stock = 1)
    const contestedProduct = await createTestProduct({
      name: `Contested Limited Edition ${concurrency}`,
      stockQuantity: 1,
      reservedQuantity: 0,
    });

    const user = await createTestUser();

    // Create unique orders for each concurrent reservation attempt
    const orders = [];
    for (let i = 0; i < concurrency; i++) {
      const order = await createTestOrder({ userId: user.id, totalCostPaise: 500000 });
      orders.push(order);
    }

    const t0 = now();

    // Execute concurrent reservations using Promise.allSettled
    const settlementResults = await Promise.allSettled(
      orders.map((order) =>
        inventoryService.reserveInventory(contestedProduct.id, 1, {
          orderId: order.id,
          userId: user.id,
          role: 'CUSTOMER',
        })
      )
    );

    const totalDurationMs = now() - t0;

    let successful = 0;
    let conflict409 = 0;
    let unexpectedFailures = 0;

    for (const res of settlementResults) {
      if (res.status === 'fulfilled') {
        successful += 1;
      } else {
        const err = res.reason;
        if (err.statusCode === 409 || err.code === 'INSUFFICIENT_STOCK' || err.message?.includes('Insufficient stock')) {
          conflict409 += 1;
        } else {
          unexpectedFailures += 1;
        }
      }
    }

    // Reload product from PostgreSQL to verify relational invariant
    await contestedProduct.reload();

    const correctnessPassed =
      successful === 1 &&
      conflict409 === concurrency - 1 &&
      unexpectedFailures === 0 &&
      contestedProduct.reserved_quantity === 1 &&
      contestedProduct.stock_quantity === 1;

    results.push({
      concurrency,
      stockInitial: 1,
      successful,
      conflict409,
      unexpectedFailures,
      finalStock: contestedProduct.stock_quantity,
      finalReserved: contestedProduct.reserved_quantity,
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
      avgPerRequestMs: Number((totalDurationMs / concurrency).toFixed(2)),
      correctnessPassed,
    });
  }

  return {
    scenario: 'BENCH-08: Inventory Concurrency (10, 25, 50 Concurrent Reservations)',
    results,
    allCorrectnessPassed: results.every((r) => r.correctnessPassed),
  };
}

export default {
  benchmarkInventoryConcurrency,
};
