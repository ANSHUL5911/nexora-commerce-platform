import { sequelize } from '../../src/config/database.js';

/**
 * Executes EXPLAIN (ANALYZE, BUFFERS) strictly against nexora_test.
 * SELECT queries are analyzed directly.
 * Write queries (INSERT, UPDATE, DELETE) are executed inside an explicit transaction
 * that is ALWAYS rolled back, guaranteeing zero data mutations.
 *
 * @param {string} query SQL query to analyze
 * @param {object} [options] Query options (e.g. bind parameters)
 * @param {boolean} [isWriteQuery=false] Whether this query modifies data
 * @returns {Promise<{
 *   rawPlan: string[],
 *   executionTimeMs: number,
 *   planningTimeMs: number,
 *   scanTypes: string[],
 *   bufferHits: number,
 *   bufferReads: number,
 * }>}
 */
export async function explainAnalyzeQuery(query, options = {}, isWriteQuery = false) {
  // Hard safety invariant: Target database must be nexora_test
  const currentDb = sequelize.config.database;
  if (currentDb !== 'nexora_test') {
    throw new Error(`[DatabaseSecurityError] EXPLAIN (ANALYZE, BUFFERS) prohibited on database '${currentDb}'. Must be nexora_test.`);
  }

  let lines = [];

  if (isWriteQuery) {
    const t = await sequelize.transaction();
    try {
      const [results] = await sequelize.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`, {
        transaction: t,
        ...options,
      });
      lines = results.map((r) => r['QUERY PLAN']);
    } finally {
      await t.rollback();
    }
  } else {
    const [results] = await sequelize.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`, options);
    lines = results.map((r) => r['QUERY PLAN']);
  }

  // Parse key metrics from the query plan text
  let executionTimeMs = 0;
  let planningTimeMs = 0;
  let bufferHits = 0;
  let bufferReads = 0;
  const scanTypes = [];

  for (const line of lines) {
    const execMatch = line.match(/Execution Time:\s*([0-9.]+)\s*ms/i);
    if (execMatch) executionTimeMs = parseFloat(execMatch[1]);

    const planMatch = line.match(/Planning Time:\s*([0-9.]+)\s*ms/i);
    if (planMatch) planningTimeMs = parseFloat(planMatch[1]);

    const hitMatch = line.match(/shared hit=([0-9]+)/i);
    if (hitMatch) bufferHits += parseInt(hitMatch[1], 10);

    const readMatch = line.match(/read=([0-9]+)/i);
    if (readMatch) bufferReads += parseInt(readMatch[1], 10);

    if (line.includes('Seq Scan')) scanTypes.push('Seq Scan');
    if (line.includes('Index Scan')) scanTypes.push('Index Scan');
    if (line.includes('Index Only Scan')) scanTypes.push('Index Only Scan');
    if (line.includes('Bitmap Index Scan')) scanTypes.push('Bitmap Index Scan');
  }

  return {
    rawPlan: lines,
    executionTimeMs,
    planningTimeMs,
    scanTypes: [...new Set(scanTypes)],
    bufferHits,
    bufferReads,
  };
}

export default {
  explainAnalyzeQuery,
};
