import crypto from 'crypto';
import request from 'supertest';
import { sequelize } from '../../src/config/database.js';
import { User, Product } from '../../src/models/index.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME } from '../../src/modules/auth/csrf.js';

export const BENCHMARK_PASSWORD = 'Password123!';

/**
 * Attaches hook listeners to Sequelize to precisely track SQL query counts
 * and cumulative database query duration for the current benchmark step.
 */
export function attachQueryCounter() {
  let queryCount = 0;
  let totalDurationMs = 0;

  const beforeHook = (options) => {
    options.__benchStartTime = performance.now();
  };

  const afterHook = (options) => {
    queryCount += 1;
    if (options.__benchStartTime) {
      totalDurationMs += performance.now() - options.__benchStartTime;
    }
  };

  sequelize.addHook('beforeQuery', beforeHook);
  sequelize.addHook('afterQuery', afterHook);

  return {
    getCount: () => queryCount,
    getDurationMs: () => Number(totalDurationMs.toFixed(2)),
    reset: () => {
      queryCount = 0;
      totalDurationMs = 0;
    },
    detach: () => {
      sequelize.removeHook('beforeQuery', beforeHook);
      sequelize.removeHook('afterQuery', afterHook);
    },
  };
}

/**
 * Resets database tables for benchmark isolation.
 */
export async function resetBenchmarkTables() {
  await sequelize.query(`
    TRUNCATE users, products, orders, order_items, inventory_reservations, 
             carts, cart_items, addresses, payment_attempts, payment_events, 
             idempotency_records, audit_logs, stock_restock_logs, sessions CASCADE;
  `);
}

/**
 * Populates deterministic catalog data for benchmarking (50 products).
 */
export async function seedBenchmarkCatalog() {
  const categories = ['Outerwear', 'Tailoring', 'Timepieces', 'Leathergoods', 'Footwear'];
  const products = [];

  for (let i = 1; i <= 50; i++) {
    const pad = String(i).padStart(4, '0');
    const category = categories[(i - 1) % categories.length];
    products.push({
      id: `00000000-0000-4000-8000-${pad}00000001`,
      name: `Benchmark Editorial Piece ${pad}`,
      description: `Structured architectural garment with hand-finished seams, item ${i}.`,
      price_paise: 500000 + (i * 25000), // ₹5,000 to ₹17,500
      stock_quantity: 100,
      reserved_quantity: 0,
      category,
      image_url: `https://images.unsplash.com/photo-item-${pad}`,
      is_deleted: false,
      created_at: new Date(Date.now() - (50 - i) * 60000),
      updated_at: new Date(Date.now() - (50 - i) * 60000),
    });
  }

  await Product.bulkCreate(products);
  return products;
}

/**
 * Creates authenticated test user session and CSRF credentials.
 */
export async function createAuthenticatedUserSession(app, {
  role = 'customer',
  email = `bench-${crypto.randomUUID()}@example.com`,
  fullName = 'Benchmark User',
} = {}) {
  const passwordHash = await hashPassword(BENCHMARK_PASSWORD);
  const user = await User.create({
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    password_hash: passwordHash,
    full_name: fullName,
    role,
    is_active: true,
  });

  const ip = `10.100.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password: BENCHMARK_PASSWORD });

  const cookies = res.headers['set-cookie'] || [];
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  const sid = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
  const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

  return {
    user,
    sid,
    csrfToken,
    cookieHeader: [`${SESSION_COOKIE_NAME}=${sid}`, `${CSRF_COOKIE_NAME}=${csrfToken}`].join('; '),
    ip,
  };
}

export default {
  attachQueryCounter,
  resetBenchmarkTables,
  seedBenchmarkCatalog,
  createAuthenticatedUserSession,
};
