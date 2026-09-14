import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../../src/app.js';
import { sequelize } from '../../src/config/database.js';
import {
  resetBenchmarkTables,
  seedBenchmarkCatalog,
  createAuthenticatedUserSession,
} from './benchmark.fixtures.js';
import { explainAnalyzeQuery } from './database.explain.js';
import { benchmarkCatalogListing, benchmarkProductDetail } from './scenarios/catalog.bench.js';
import { benchmarkCartRetrieval } from './scenarios/cart.bench.js';
import { benchmarkCheckoutCreation } from './scenarios/checkout.bench.js';
import { benchmarkPaymentCreateOrder, benchmarkPaymentVerification } from './scenarios/payments.bench.js';
import { benchmarkWebhookProcessing } from './scenarios/webhook.bench.js';
import { benchmarkInventoryConcurrency } from './scenarios/inventory.bench.js';
import { benchmarkPaymentSettlementConcurrency } from './scenarios/settlement.bench.js';
import { benchmarkIdempotencyConcurrency } from './scenarios/idempotency.bench.js';
import { benchmarkGuestCheckout } from './scenarios/guest.bench.js';
import { benchmarkAdminOperations } from './scenarios/admin.bench.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runExplainAnalysis(products) {
  console.log('\n--- Running PostgreSQL EXPLAIN (ANALYZE, BUFFERS) Analysis ---');
  const sampleProductId = products[0].id;

  const queries = [
    {
      name: 'Product Catalog Default List (Sort created_at DESC, id DESC LIMIT 10)',
      sql: `SELECT id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url, is_deleted, created_at, updated_at 
            FROM products 
            WHERE is_deleted = false 
            ORDER BY created_at DESC, id DESC 
            LIMIT 10;`,
      isWrite: false,
    },
    {
      name: 'Product Lookup by ID with Soft-Delete Filter',
      sql: `SELECT id, name, price_paise, stock_quantity, reserved_quantity, is_deleted 
            FROM products 
            WHERE id = '${sampleProductId}' AND is_deleted = false;`,
      isWrite: false,
    },
    {
      name: 'Deterministic Row Lock on Products (FOR UPDATE)',
      sql: `SELECT id, stock_quantity, reserved_quantity 
            FROM products 
            WHERE id = '${sampleProductId}' 
            FOR UPDATE;`,
      isWrite: true, // Rollback-protected
    },
    {
      name: 'Webhook Event Idempotency Lookup',
      sql: `SELECT id, event_id, processing_status 
            FROM payment_events 
            WHERE event_id = 'evt_sample_explain_lookup';`,
      isWrite: false,
    },
    {
      name: 'Session SID Authentication Lookup',
      sql: `SELECT sid, user_id, expires_at 
            FROM sessions 
            WHERE sid = 'sample_sid_for_explain_plan' AND expires_at > CURRENT_TIMESTAMP;`,
      isWrite: false,
    },
  ];

  const explainResults = [];
  for (const q of queries) {
    try {
      const res = await explainAnalyzeQuery(q.sql, {}, q.isWrite);
      console.log(`✓ ${q.name}: exec=${res.executionTimeMs}ms, plan=${res.planningTimeMs}ms, scans=[${res.scanTypes.join(', ')}], bufferHits=${res.bufferHits}, bufferReads=${res.bufferReads}`);
      explainResults.push({
        queryName: q.name,
        sql: q.sql.trim().replace(/\s+/g, ' '),
        executionTimeMs: res.executionTimeMs,
        planningTimeMs: res.planningTimeMs,
        scanTypes: res.scanTypes,
        bufferHits: res.bufferHits,
        bufferReads: res.bufferReads,
        rawPlan: res.rawPlan,
      });
    } catch (err) {
      console.error(`✗ Error analyzing query '${q.name}':`, err.message);
      explainResults.push({ queryName: q.name, error: err.message });
    }
  }

  return explainResults;
}

export async function runMasterBenchmarkSuite() {
  console.log('===============================================================');
  console.log(' NEXORA COMMERCE PLATFORM — PHASE 07.20 PERFORMANCE BENCHMARK');
  console.log('===============================================================');

  const app = createApp();
  await sequelize.authenticate();
  console.log(`Connected to database: ${sequelize.config.database}`);

  const initialMemory = process.memoryUsage();
  console.log(`Initial RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB, Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  // 1. Reset tables and seed catalog
  await resetBenchmarkTables();
  const products = await seedBenchmarkCatalog();
  console.log(`Seeded ${products.length} deterministic benchmark products.`);

  // 2. EXPLAIN ANALYZE
  const explainResults = await runExplainAnalysis(products);

  // 3. Repeatability Runs for Critical Scenarios (3 runs)
  const repeatabilityRuns = [];

  for (let runIndex = 1; runIndex <= 3; runIndex++) {
    console.log(`\n>>> STARTING BENCHMARK RUN ${runIndex} OF 3 <<<`);

    const customerAuth = await createAuthenticatedUserSession(app);

    // BENCH-01: Product Listing
    console.log(`[Run ${runIndex}] Executing BENCH-01: Product Listing...`);
    const bench01 = await benchmarkCatalogListing(app, { iterations: 30, warmUpCount: 5 });
    console.log(`  -> p50=${bench01.stats.p50}ms, p95=${bench01.stats.p95}ms, p99=${bench01.stats.p99}ms, avgQueries=${bench01.avgQueryCount}`);

    // BENCH-02: Product Detail
    console.log(`[Run ${runIndex}] Executing BENCH-02: Product Detail...`);
    const bench02 = await benchmarkProductDetail(app, products[0].id, { iterations: 30, warmUpCount: 5 });
    console.log(`  -> p50=${bench02.stats.p50}ms, p95=${bench02.stats.p95}ms, p99=${bench02.stats.p99}ms, avgQueries=${bench02.avgQueryCount}`);

    // BENCH-03: Cart Retrieval
    console.log(`[Run ${runIndex}] Executing BENCH-03: Cart Retrieval...`);
    const bench03 = await benchmarkCartRetrieval(app, customerAuth, products, { iterations: 25, warmUpCount: 5 });
    console.log(`  -> p50=${bench03.stats.p50}ms, p95=${bench03.stats.p95}ms, p99=${bench03.stats.p99}ms, avgQueries=${bench03.avgQueryCount}`);

    // BENCH-04: Checkout / Order Creation (POST /api/checkout/initiate)
    console.log(`[Run ${runIndex}] Executing BENCH-04: Checkout Creation...`);
    const bench04 = await benchmarkCheckoutCreation(app, products, { iterations: 20, warmUpCount: 3 });
    console.log(`  -> p50=${bench04.stats.p50}ms, p95=${bench04.stats.p95}ms, p99=${bench04.stats.p99}ms, avgQueries=${bench04.avgQueryCount}`);

    // BENCH-05: Payment Create Order
    console.log(`[Run ${runIndex}] Executing BENCH-05: Payment Create Order...`);
    const bench05 = await benchmarkPaymentCreateOrder(app, products, { iterations: 20, warmUpCount: 3 });
    console.log(`  -> p50=${bench05.stats.p50}ms, p95=${bench05.stats.p95}ms, p99=${bench05.stats.p99}ms, avgQueries=${bench05.avgQueryCount}`);

    // BENCH-06: Payment Verification
    console.log(`[Run ${runIndex}] Executing BENCH-06: Payment Verification...`);
    const bench06 = await benchmarkPaymentVerification(app, products, { iterations: 20, warmUpCount: 3 });
    console.log(`  -> p50=${bench06.stats.p50}ms, p95=${bench06.stats.p95}ms, p99=${bench06.stats.p99}ms, avgQueries=${bench06.avgQueryCount}`);

    // BENCH-07: Razorpay Webhook
    console.log(`[Run ${runIndex}] Executing BENCH-07: Webhook Processing...`);
    const bench07 = await benchmarkWebhookProcessing(app, products, { iterations: 25, warmUpCount: 3 });
    console.log(`  -> p50=${bench07.stats.p50}ms, p95=${bench07.stats.p95}ms, p99=${bench07.stats.p99}ms, avgQueries=${bench07.avgQueryCount}`);

    // BENCH-08: Inventory Concurrency
    console.log(`[Run ${runIndex}] Executing BENCH-08: Inventory Concurrency...`);
    const bench08 = await benchmarkInventoryConcurrency(app, { levels: [10, 25, 50] });
    console.log(`  -> All correctness passed: ${bench08.allCorrectnessPassed}`);

    // BENCH-09: Payment Settlement Concurrency
    console.log(`[Run ${runIndex}] Executing BENCH-09: Settlement Concurrency...`);
    const bench09 = await benchmarkPaymentSettlementConcurrency({ levels: [10, 25] });
    console.log(`  -> All correctness passed: ${bench09.allCorrectnessPassed}`);

    // BENCH-10: Idempotency Concurrency
    console.log(`[Run ${runIndex}] Executing BENCH-10: Idempotency Concurrency...`);
    const bench10 = await benchmarkIdempotencyConcurrency(app, products, { concurrency: 10 });
    console.log(`  -> Correctness passed: ${bench10.correctnessPassed}`);

    // BENCH-11: Guest Checkout
    console.log(`[Run ${runIndex}] Executing BENCH-11: Guest Checkout...`);
    const bench11 = await benchmarkGuestCheckout(app, products, { iterations: 20, warmUpCount: 3 });
    console.log(`  -> Initiate p95=${bench11.checkoutStats.p95}ms, Retrieval p95=${bench11.retrievalStats.p95}ms`);

    // BENCH-12: Admin Operations
    console.log(`[Run ${runIndex}] Executing BENCH-12: Admin Operations...`);
    const bench12 = await benchmarkAdminOperations(app, { iterations: 15, warmUpCount: 2 });
    console.log(`  -> Admin products p95=${bench12.endpoints.adminProducts.stats.p95}ms`);

    repeatabilityRuns.push({
      runIndex,
      bench01,
      bench02,
      bench03,
      bench04,
      bench05,
      bench06,
      bench07,
      bench08,
      bench09,
      bench10,
      bench11,
      bench12,
    });
  }

  const finalMemory = process.memoryUsage();
  console.log(`\nFinal RSS: ${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB, Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  const reportPayload = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      database: sequelize.config.database,
      pool: sequelize.config.pool,
    },
    memory: {
      initialRssMb: Number((initialMemory.rss / 1024 / 1024).toFixed(2)),
      initialHeapMb: Number((initialMemory.heapUsed / 1024 / 1024).toFixed(2)),
      finalRssMb: Number((finalMemory.rss / 1024 / 1024).toFixed(2)),
      finalHeapMb: Number((finalMemory.heapUsed / 1024 / 1024).toFixed(2)),
    },
    explainResults,
    repeatabilityRuns,
  };

  const outputPath = path.join(__dirname, 'benchmark_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(reportPayload, null, 2));
  console.log(`\nSaved benchmark metrics to ${outputPath}`);

  return reportPayload;
}

// Direct execution guard
if (process.argv[1] && process.argv[1].endsWith('benchmark.runner.js')) {
  runMasterBenchmarkSuite()
    .then(() => {
      console.log('Benchmark suite run completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal benchmark suite execution error:', err);
      process.exit(1);
    });
}

export default runMasterBenchmarkSuite;
