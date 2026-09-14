import { performance } from 'perf_hooks';

/**
 * High-resolution timer utility using Node.js perf_hooks.performance.now()
 * monotonic timing.
 */
export function now() {
  return performance.now();
}

/**
 * Calculates comprehensive statistical distribution from an array of sample numbers.
 *
 * @param {number[]} samples Array of latency durations in milliseconds
 * @returns {{
 *   count: number,
 *   min: number,
 *   max: number,
 *   mean: number,
 *   p50: number,
 *   p95: number,
 *   p99: number,
 *   stdDev: number
 * }}
 */
export function calculateStats(samples) {
  if (!samples || samples.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      stdDev: 0,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const min = Number(sorted[0].toFixed(2));
  const max = Number(sorted[count - 1].toFixed(2));
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = Number((sum / count).toFixed(2));

  const getPercentile = (p) => {
    const rank = (p / 100) * (count - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const weight = rank - lower;
    if (lower === upper) return Number(sorted[lower].toFixed(2));
    return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
  };

  const p50 = getPercentile(50);
  const p95 = getPercentile(95);
  const p99 = getPercentile(99);

  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Number(Math.sqrt(variance).toFixed(2));

  return {
    count,
    min,
    max,
    mean,
    p50,
    p95,
    p99,
    stdDev,
  };
}

export default {
  now,
  calculateStats,
};
