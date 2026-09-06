import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import { config } from '../../src/config/env.js';
import { getMigrator, getSeeder, migrateReset } from '../../src/database/migrator.js';

describe('Phase 07.2 — PostgreSQL Database Migration Lifecycle Tests', () => {
  let testSequelize;

  beforeAll(async () => {
    // Ensure test environment
    expect(config.NODE_ENV).not.toBe('production');

    // Create a dedicated Sequelize connection to nexora_test
    testSequelize = new Sequelize({
      dialect: 'postgres',
      dialectModule: pg,
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: process.env.TEST_DB_NAME || 'nexora_test',
      username: config.DB_USER,
      password: config.DB_PASSWORD,
      logging: false,
    });

    await testSequelize.authenticate();
  });

  afterAll(async () => {
    if (testSequelize) {
      await testSequelize.close();
    }
  });

  it('verifies that the target test database is PostgreSQL', async () => {
    const [result] = await testSequelize.query('SELECT version();', {
      type: testSequelize.QueryTypes.SELECT,
    });
    expect(result.version).toContain('PostgreSQL');
  });

  it('executes full migration lifecycle: UP -> VERIFY -> SEED -> VERIFY -> DOWN -> RE-APPLY', async () => {
    const expectedTables = [
      'addresses',
      'audit_logs',
      'cart_items',
      'carts',
      'idempotency_records',
      'inventory_reservations',
      'order_items',
      'orders',
      'payment_attempts',
      'payment_events',
      'products',
      'sessions',
      'stock_restock_logs',
      'users',
    ].sort();

    // Helper to get business tables
    const getBusinessTables = async () => {
      const allTables = await testSequelize.getQueryInterface().showAllTables();
      return allTables
        .filter((t) => t !== 'SequelizeMeta' && t !== 'SequelizeData')
        .sort();
    };

    // 1. Reset all migrations in test database to ensure clean initial state
    await migrateReset(testSequelize);

    // Verify no business tables exist
    let businessTables = await getBusinessTables();
    expect(businessTables.length).toBe(0);

    // 2. Run migrations UP
    const migrator = getMigrator(testSequelize);
    const upResults = await migrator.up();
    expect(upResults.length).toBe(11);

    // 3. Verify exactly all 14 business tables exist
    businessTables = await getBusinessTables();
    expect(businessTables).toEqual(expectedTables);

    // 4. Run Seeders UP
    const seeder = getSeeder(testSequelize);
    const seedResults = await seeder.up();
    expect(seedResults.length).toBe(4);

    // Verify seeded data
    const [userCount] = await testSequelize.query('SELECT count(*) as count FROM users;', {
      type: testSequelize.QueryTypes.SELECT,
    });
    expect(parseInt(userCount.count, 10)).toBe(3);

    const [productCount] = await testSequelize.query('SELECT count(*) as count FROM products;', {
      type: testSequelize.QueryTypes.SELECT,
    });
    expect(parseInt(productCount.count, 10)).toBe(12);

    const [orderCount] = await testSequelize.query('SELECT count(*) as count FROM orders;', {
      type: testSequelize.QueryTypes.SELECT,
    });
    expect(parseInt(orderCount.count, 10)).toBe(3);

    const [orderItemCount] = await testSequelize.query('SELECT count(*) as count FROM order_items;', {
      type: testSequelize.QueryTypes.SELECT,
    });
    expect(parseInt(orderItemCount.count, 10)).toBe(3);

    // 5. Reset Seeders
    await seeder.down({ to: 0 });
    const [clearedUsers] = await testSequelize.query('SELECT count(*) as count FROM users;', {
      type: testSequelize.QueryTypes.SELECT,
    });
    expect(parseInt(clearedUsers.count, 10)).toBe(0);

    // 6. Run migrations DOWN (Undo all)
    const downResults = await migrator.down({ to: 0 });
    expect(downResults.length).toBe(11);

    // Verify all business tables dropped
    businessTables = await getBusinessTables();
    expect(businessTables.length).toBe(0);

    // 7. Migrate UP again to confirm reproducibility
    const reappliedResults = await migrator.up();
    expect(reappliedResults.length).toBe(11);

    businessTables = await getBusinessTables();
    expect(businessTables).toEqual(expectedTables);
  });
});
