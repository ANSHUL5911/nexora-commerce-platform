import { Sequelize } from 'sequelize';
import pg from 'pg';
import { config } from './env.js';

const dialectOptions = {};

if (config.DB_SSL) {
  dialectOptions.ssl = {
    require: true,
    rejectUnauthorized: false,
  };
}

export const sequelize = new Sequelize({
  dialect: 'postgres',
  dialectModule: pg,
  host: config.DB_HOST,
  port: config.DB_PORT,
  database: config.DB_NAME,
  username: config.DB_USER,
  password: config.DB_PASSWORD,
  dialectOptions,
  pool: {
    min: config.DB_POOL_MIN,
    max: config.DB_POOL_MAX,
    acquire: 30000,
    idle: 10000,
  },
  logging: config.NODE_ENV === 'development' ? (msg) => console.log(`[Sequelize] ${msg}`) : false,
});

/**
 * Authenticate PostgreSQL connection.
 * @returns {Promise<boolean>}
 */
export async function testDbConnection() {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    // Sanitize error to prevent password exposure
    const safeMsg = error?.message || 'Database connection error';
    throw new Error(`PostgreSQL Connection Error: ${safeMsg}`);
  }
}

/**
 * Gracefully close database connection pool.
 * @returns {Promise<void>}
 */
export async function closeDbConnection() {
  try {
    await sequelize.close();
  } catch (error) {
    console.error('Error closing database connection pool:', error?.message);
  }
}

export default sequelize;
