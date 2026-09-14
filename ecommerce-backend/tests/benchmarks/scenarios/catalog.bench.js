import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter } from '../benchmark.fixtures.js';

/**
 * BENCH-01: Product Listing (GET /api/products)
 * Tests catalog listing across pagination, search, and category filters.
 * Frozen requirement: p95 < 200 ms, no N+1 queries.
 */
export async function benchmarkCatalogListing(app, { iterations = 30, warmUpCount = 5 } = {}) {
  // Warm-up requests
  for (let i = 0; i < warmUpCount; i++) {
    await request(app)
      .get('/api/products?page=1&limit=10')
      .set('X-Forwarded-For', `10.200.1.${i + 1}`);
  }

  const queryCounter = attachQueryCounter();
  const samples = [];
  const errors = [];
  const queryCounts = [];
  const queryDurations = [];

  const startTime = now();

  for (let i = 0; i < iterations; i++) {
    // Alternate between default list, page 2, category filter, and search
    let url = '/api/products?page=1&limit=10';
    if (i % 4 === 1) url = '/api/products?page=2&limit=10';
    if (i % 4 === 2) url = '/api/products?category=Outerwear';
    if (i % 4 === 3) url = '/api/products?search=Editorial';

    queryCounter.reset();
    const reqStart = now();

    try {
      const res = await request(app)
        .get(url)
        .set('X-Forwarded-For', `10.200.2.${(i % 200) + 1}`);

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
    scenario: 'BENCH-01: Product Listing',
    target: 'p95 < 200 ms',
    passed: stats.p95 < 200 && errors.length === 0,
    stats,
    throughputReqSec: throughput,
    avgQueryCount,
    avgQueryDurationMs: avgQueryDuration,
    errorCount: errors.length,
    errors,
  };
}

/**
 * BENCH-02: Product Detail (GET /api/products/:id)
 */
export async function benchmarkProductDetail(app, sampleProductId, { iterations = 30, warmUpCount = 5 } = {}) {
  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    await request(app)
      .get(`/api/products/${sampleProductId}`)
      .set('X-Forwarded-For', `10.200.3.${i + 1}`);
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
        .get(`/api/products/${sampleProductId}`)
        .set('X-Forwarded-For', `10.200.4.${(i % 200) + 1}`);

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
    scenario: 'BENCH-02: Product Detail',
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
  benchmarkCatalogListing,
  benchmarkProductDetail,
};
