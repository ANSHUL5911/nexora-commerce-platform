import crypto from 'crypto';
import request from 'supertest';
import { now, calculateStats } from '../benchmark.stats.js';
import { attachQueryCounter, createAuthenticatedUserSession } from '../benchmark.fixtures.js';

/**
 * BENCH-12: Administrative Operations
 * Benchmarks:
 * - GET /api/admin/products
 * - GET /api/admin/orders
 * - GET /api/admin/inventory
 * - GET /api/admin/audit-logs
 */
export async function benchmarkAdminOperations(app, { iterations = 15, warmUpCount = 2 } = {}) {
  const adminAuth = await createAuthenticatedUserSession(app, {
    role: 'admin',
    email: `admin-bench-${crypto.randomUUID()}@nexora.local`,
    fullName: 'Benchmark Administrator',
  });

  const endpoints = [
    { name: 'adminProducts', url: '/api/admin/products?page=1&limit=10' },
    { name: 'adminOrders', url: '/api/admin/orders?page=1&limit=10' },
    { name: 'adminInventory', url: '/api/admin/inventory?page=1&limit=10' },
    { name: 'adminAuditLogs', url: '/api/admin/audit-logs?page=1&limit=10' },
  ];

  // Warm-up
  for (let i = 0; i < warmUpCount; i++) {
    for (const ep of endpoints) {
      await request(app)
        .get(ep.url)
        .set('Cookie', adminAuth.cookieHeader)
        .set('x-csrf-token', adminAuth.csrfToken)
        .set('X-Forwarded-For', `10.200.21.${i + 1}`);
    }
  }

  const queryCounter = attachQueryCounter();
  const endpointResults = {};
  const errors = [];

  for (const ep of endpoints) {
    const samples = [];
    const queryCounts = [];
    const queryDurations = [];

    for (let i = 0; i < iterations; i++) {
      queryCounter.reset();
      const t0 = now();

      try {
        const res = await request(app)
          .get(ep.url)
          .set('Cookie', adminAuth.cookieHeader)
          .set('x-csrf-token', adminAuth.csrfToken)
          .set('X-Forwarded-For', `10.200.22.${(i % 200) + 1}`);

        const duration = now() - t0;
        samples.push(duration);
        queryCounts.push(queryCounter.getCount());
        queryDurations.push(queryCounter.getDurationMs());

        if (res.status !== 200) {
          errors.push({ endpoint: ep.name, status: res.status, body: res.body });
        }
      } catch (err) {
        errors.push({ endpoint: ep.name, error: err.message });
      }
    }

    const stats = calculateStats(samples);
    const avgQueryCount = Number((queryCounts.reduce((a, b) => a + b, 0) / (queryCounts.length || 1)).toFixed(1));
    const avgQueryDuration = Number((queryDurations.reduce((a, b) => a + b, 0) / (queryDurations.length || 1)).toFixed(2));

    endpointResults[ep.name] = {
      url: ep.url,
      stats,
      avgQueryCount,
      avgQueryDurationMs: avgQueryDuration,
    };
  }

  queryCounter.detach();

  return {
    scenario: 'BENCH-12: Admin Operations',
    target: 'diagnostic / characterization',
    endpoints: endpointResults,
    errorCount: errors.length,
    errors,
  };
}

export default {
  benchmarkAdminOperations,
};
