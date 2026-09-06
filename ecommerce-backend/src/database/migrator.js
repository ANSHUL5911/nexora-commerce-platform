import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize as defaultSequelize } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * Construct an Umzug migration runner bound to a Sequelize instance.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 * @returns {Umzug}
 */
export function getMigrator(targetSequelize = defaultSequelize) {
  const migrationsDir = path.join(__dirname, 'migrations').replace(/\\/g, '/');
  return new Umzug({
    migrations: {
      glob: `${migrationsDir}/*.cjs`,
      resolve: ({ name, path: filePath, context }) => {
        const migration = require(filePath);
        return {
          name,
          up: async () => migration.up(context.queryInterface, context.Sequelize),
          down: async () => migration.down(context.queryInterface, context.Sequelize),
        };
      },
    },
    context: {
      queryInterface: targetSequelize.getQueryInterface(),
      Sequelize: targetSequelize.Sequelize,
    },
    storage: new SequelizeStorage({
      sequelize: targetSequelize,
      modelName: 'SequelizeMeta',
      tableName: 'SequelizeMeta',
    }),
    logger: process.env.NODE_ENV === 'test' ? undefined : console,
  });
}

/**
 * Construct an Umzug seeder runner bound to a Sequelize instance.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 * @returns {Umzug}
 */
export function getSeeder(targetSequelize = defaultSequelize) {
  const seedersDir = path.join(__dirname, 'seeders').replace(/\\/g, '/');
  return new Umzug({
    migrations: {
      glob: `${seedersDir}/*.cjs`,
      resolve: ({ name, path: filePath, context }) => {
        const seeder = require(filePath);
        return {
          name,
          up: async () => seeder.up(context.queryInterface, context.Sequelize),
          down: async () => seeder.down(context.queryInterface, context.Sequelize),
        };
      },
    },
    context: {
      queryInterface: targetSequelize.getQueryInterface(),
      Sequelize: targetSequelize.Sequelize,
    },
    storage: new SequelizeStorage({
      sequelize: targetSequelize,
      modelName: 'SequelizeData',
      tableName: 'SequelizeData',
    }),
    logger: process.env.NODE_ENV === 'test' ? undefined : console,
  });
}

/**
 * Execute all pending migrations up.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 */
export async function migrateUp(targetSequelize = defaultSequelize) {
  const migrator = getMigrator(targetSequelize);
  return migrator.up();
}

/**
 * Revert the last applied migration.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 */
export async function migrateDown(targetSequelize = defaultSequelize) {
  const migrator = getMigrator(targetSequelize);
  return migrator.down();
}

/**
 * Revert all applied migrations.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 */
export async function migrateReset(targetSequelize = defaultSequelize) {
  const migrator = getMigrator(targetSequelize);
  return migrator.down({ to: 0 });
}

/**
 * Execute all pending seeders up.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 */
export async function seedUp(targetSequelize = defaultSequelize) {
  const seeder = getSeeder(targetSequelize);
  return seeder.up();
}

/**
 * Revert all applied seeders.
 * @param {import('sequelize').Sequelize} [targetSequelize]
 */
export async function seedReset(targetSequelize = defaultSequelize) {
  const seeder = getSeeder(targetSequelize);
  return seeder.down({ to: 0 });
}

// CLI handler if executed directly
if (process.argv[1] === __filename) {
  const action = process.argv[2] || 'up';
  (async () => {
    try {
      if (action === 'up') {
        console.log('Running migrations UP...');
        const res = await migrateUp();
        console.log(`Migrations UP completed. Executed: ${res.map((r) => r.name).join(', ')}`);
      } else if (action === 'down') {
        console.log('Running migration DOWN...');
        const res = await migrateDown();
        console.log(`Migration DOWN completed. Reverted: ${res.map((r) => r.name).join(', ')}`);
      } else if (action === 'reset') {
        console.log('Running migrations RESET (to 0)...');
        const res = await migrateReset();
        console.log(`Migrations RESET completed. Reverted: ${res.map((r) => r.name).join(', ')}`);
      } else if (action === 'seed') {
        console.log('Running seeders UP...');
        const res = await seedUp();
        console.log(`Seeders UP completed. Executed: ${res.map((r) => r.name).join(', ')}`);
      } else if (action === 'seed:reset') {
        console.log('Running seeders RESET (to 0)...');
        const res = await seedReset();
        console.log(`Seeders RESET completed. Reverted: ${res.map((r) => r.name).join(', ')}`);
      } else {
        console.error(`Unknown action: ${action}. Use up, down, reset, seed, or seed:reset.`);
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      console.error('Migration error:', err);
      process.exit(1);
    }
  })();
}
