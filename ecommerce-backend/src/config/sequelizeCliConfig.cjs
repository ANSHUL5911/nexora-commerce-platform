const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbUser = process.env.DB_USER || 'nexora_user';
const dbPassword = process.env.DB_PASSWORD || '';
const dbSsl = process.env.DB_SSL === 'true';

const dialectOptions = {};
if (dbSsl) {
  dialectOptions.ssl = {
    require: true,
    rejectUnauthorized: false,
  };
}

module.exports = {
  development: {
    username: dbUser,
    password: dbPassword,
    database: process.env.DB_NAME || 'nexora_dev',
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    dialectOptions,
    logging: (msg) => console.log(`[Sequelize CLI] ${msg}`),
  },
  test: {
    username: dbUser,
    password: dbPassword,
    database: process.env.TEST_DB_NAME || 'nexora_test',
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    dialectOptions,
    logging: false,
  },
  production: {
    username: dbUser,
    password: dbPassword,
    database: process.env.DB_NAME || 'nexora_prod',
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    dialectOptions,
    logging: false,
  },
};
