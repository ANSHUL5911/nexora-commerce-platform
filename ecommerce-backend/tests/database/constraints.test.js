import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Sequelize } from 'sequelize';
import pg from 'pg';
import { config } from '../../src/config/env.js';
import { getMigrator, migrateReset } from '../../src/database/migrator.js';

describe('Phase 07.2 — PostgreSQL Database Constraints & Invariant Tests', () => {
  let testSequelize;

  beforeAll(async () => {
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

    // Ensure database is freshly migrated
    await migrateReset(testSequelize);
    const migrator = getMigrator(testSequelize);
    await migrator.up();
  });

  afterAll(async () => {
    if (testSequelize) {
      await testSequelize.close();
    }
  });

  beforeEach(async () => {
    // Truncate all tables before each test
    await testSequelize.query(`
      TRUNCATE users, products, addresses, orders, order_items, 
               inventory_reservations, payment_attempts, payment_events, 
               idempotency_records, audit_logs, stock_restock_logs, sessions, carts, cart_items CASCADE;
    `);
  });

  describe('1. Users Table Constraints', () => {
    it('accepts valid customer and admin users', async () => {
      await testSequelize.query(`
        INSERT INTO users (id, email, password_hash, role, full_name)
        VALUES ('11111111-1111-4111-8111-111111111111', 'user1@test.local', 'hash123', 'customer', 'Test User 1'),
               ('22222222-2222-4222-8222-222222222222', 'admin1@test.local', 'hash123', 'admin', 'Test Admin 1');
      `);
      const [rows] = await testSequelize.query('SELECT count(*) FROM users;');
      expect(parseInt(rows[0].count, 10)).toBe(2);
    });

    it('rejects invalid user roles via CHECK constraint (chk_users_role)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO users (id, email, password_hash, role, full_name)
          VALUES ('33333333-3333-4333-8333-333333333333', 'super@test.local', 'hash123', 'SUPERADMIN', 'Test Invalid');
        `)
      ).rejects.toThrow();
    });

    it('rejects invalid email formats via CHECK constraint (chk_users_email_format)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO users (id, email, password_hash, role, full_name)
          VALUES ('44444444-4444-4444-8444-444444444444', 'invalid-email-address', 'hash123', 'customer', 'Test Invalid');
        `)
      ).rejects.toThrow();
    });

    it('rejects duplicate email addresses via UNIQUE constraint (users_email_key)', async () => {
      await testSequelize.query(`
        INSERT INTO users (id, email, password_hash, role, full_name)
        VALUES ('55555555-5555-4555-8555-555555555555', 'duplicate@test.local', 'hash123', 'customer', 'User A');
      `);
      await expect(
        testSequelize.query(`
          INSERT INTO users (id, email, password_hash, role, full_name)
          VALUES ('66666666-6666-4666-8666-666666666666', 'duplicate@test.local', 'hash123', 'customer', 'User B');
        `)
      ).rejects.toThrow();
    });
  });

  describe('2. Products Table Constraints & Inventory Invariants', () => {
    it('accepts valid products with integer paise and non-negative quantities', async () => {
      await testSequelize.query(`
        INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Test Jacket', 'Nice jacket', 149900, 10, 2, 'Apparel', 'https://example.com/img.jpg');
      `);
      const [rows] = await testSequelize.query('SELECT stock_quantity, reserved_quantity, (stock_quantity - reserved_quantity) as available FROM products;');
      expect(rows[0].stock_quantity).toBe(10);
      expect(rows[0].reserved_quantity).toBe(2);
      expect(rows[0].available).toBe(8);
    });

    it('rejects negative price_paise via CHECK constraint (chk_products_price_paise)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
          VALUES ('10000000-0000-4000-8000-000000000002', 'Negative Price Item', 'Desc', -500, 5, 0, 'Apparel', 'https://example.com/img.jpg');
        `)
      ).rejects.toThrow();
    });

    it('rejects negative stock_quantity via CHECK constraint (chk_products_stock_quantity)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
          VALUES ('10000000-0000-4000-8000-000000000003', 'Negative Stock Item', 'Desc', 50000, -1, 0, 'Apparel', 'https://example.com/img.jpg');
        `)
      ).rejects.toThrow();
    });

    it('rejects negative reserved_quantity via CHECK constraint (chk_products_reserved_quantity)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
          VALUES ('10000000-0000-4000-8000-000000000004', 'Negative Reserved Item', 'Desc', 50000, 10, -2, 'Apparel', 'https://example.com/img.jpg');
        `)
      ).rejects.toThrow();
    });

    it('rejects reserved_quantity > stock_quantity via CHECK constraint (chk_products_reserved_lte_stock)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
          VALUES ('10000000-0000-4000-8000-000000000005', 'Oversold Item', 'Desc', 50000, 5, 6, 'Apparel', 'https://example.com/img.jpg');
        `)
      ).rejects.toThrow();
    });
  });

  describe('3. Carts & CartItems Table Constraints', () => {
    beforeEach(async () => {
      await testSequelize.query(`
        INSERT INTO users (id, email, password_hash, role, full_name)
        VALUES ('20000000-0000-4000-8000-000000000001', 'cartuser@test.local', 'hash123', 'customer', 'Cart User');
        INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
        VALUES ('30000000-0000-4000-8000-000000000001', 'Cart Product', 'Desc', 20000, 10, 0, 'Apparel', 'https://example.com/img.jpg');
      `);
    });

    it('enforces exactly one active cart per user (uq_carts_user)', async () => {
      await testSequelize.query(`
        INSERT INTO carts (id, user_id) VALUES ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
      `);
      await expect(
        testSequelize.query(`
          INSERT INTO carts (id, user_id) VALUES ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');
        `)
      ).rejects.toThrow();
    });

    it('enforces composite uniqueness on (cart_id, product_id) (uq_cart_items_cart_product)', async () => {
      await testSequelize.query(`
        INSERT INTO carts (id, user_id) VALUES ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
        INSERT INTO cart_items (id, cart_id, product_id, quantity)
        VALUES ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 2);
      `);

      await expect(
        testSequelize.query(`
          INSERT INTO cart_items (id, cart_id, product_id, quantity)
          VALUES ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 3);
        `)
      ).rejects.toThrow();
    });

    it('rejects invalid cart item quantities (quantity <= 0 or > 10) (chk_cart_items_quantity)', async () => {
      await testSequelize.query(`
        INSERT INTO carts (id, user_id) VALUES ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
      `);

      // Quantity 0
      await expect(
        testSequelize.query(`
          INSERT INTO cart_items (id, cart_id, product_id, quantity)
          VALUES ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 0);
        `)
      ).rejects.toThrow();

      // Quantity 11 (exceeds cap of 10)
      await expect(
        testSequelize.query(`
          INSERT INTO cart_items (id, cart_id, product_id, quantity)
          VALUES ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 11);
        `)
      ).rejects.toThrow();
    });
  });

  describe('4. Addresses Table Constraints', () => {
    beforeEach(async () => {
      await testSequelize.query(`
        INSERT INTO users (id, email, password_hash, role, full_name)
        VALUES ('20000000-0000-4000-8000-000000000002', 'addruser@test.local', 'hash123', 'customer', 'Addr User');
      `);
    });

    it('accepts valid 6-digit Indian pincodes (chk_addresses_pincode)', async () => {
      await testSequelize.query(`
        INSERT INTO addresses (id, user_id, full_name, address_line1, city, state, pincode, phone)
        VALUES ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Addr User', 'Street 1', 'City', 'State', '400001', '+919999999999');
      `);
      const [rows] = await testSequelize.query('SELECT pincode FROM addresses;');
      expect(rows[0].pincode).toBe('400001');
    });

    it('rejects invalid pincodes (chk_addresses_pincode)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO addresses (id, user_id, full_name, address_line1, city, state, pincode, phone)
          VALUES ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Addr User', 'Street 1', 'City', 'State', '012345', '+919999999999');
        `)
      ).rejects.toThrow();
    });

    it('enforces single address per user in MVP (uq_addresses_user)', async () => {
      await testSequelize.query(`
        INSERT INTO addresses (id, user_id, full_name, address_line1, city, state, pincode, phone)
        VALUES ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Addr User', 'Street 1', 'City', 'State', '400001', '+919999999999');
      `);
      await expect(
        testSequelize.query(`
          INSERT INTO addresses (id, user_id, full_name, address_line1, city, state, pincode, phone)
          VALUES ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Addr User', 'Street 2', 'City', 'State', '400002', '+919999999999');
        `)
      ).rejects.toThrow();
    });
  });

  describe('5. Orders & OrderItems Relational Integrity', () => {
    beforeEach(async () => {
      await testSequelize.query(`
        INSERT INTO users (id, email, password_hash, role, full_name)
        VALUES ('20000000-0000-4000-8000-000000000003', 'orderuser@test.local', 'hash123', 'customer', 'Order User');
        INSERT INTO products (id, name, description, price_paise, stock_quantity, reserved_quantity, category, image_url)
        VALUES ('30000000-0000-4000-8000-000000000002', 'Purchased Product', 'Desc', 100000, 5, 0, 'Apparel', 'https://example.com/img.jpg');
      `);
    });

    it('creates relational order and order items with integer paise values', async () => {
      await testSequelize.query(`
        INSERT INTO orders (id, user_id, order_status, total_cost_paise, shipping_fee_paise, shipping_full_name, shipping_address_line1, shipping_city, shipping_state, shipping_pincode, shipping_phone, reservation_expires_at)
        VALUES ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'PENDING_PAYMENT', 100000, 0, 'Order User', 'Street 1', 'City', 'State', '400001', '+919999999999', NOW() + INTERVAL '15 minutes');

        INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_paise)
        VALUES ('80000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Purchased Product', 1, 100000);
      `);

      const [order] = await testSequelize.query('SELECT total_cost_paise FROM orders WHERE id = \'70000000-0000-4000-8000-000000000001\';');
      expect(order[0].total_cost_paise).toBe('100000');

      const [items] = await testSequelize.query('SELECT unit_price_paise, product_name_snapshot FROM order_items WHERE order_id = \'70000000-0000-4000-8000-000000000001\';');
      expect(items[0].unit_price_paise).toBe('100000');
      expect(items[0].product_name_snapshot).toBe('Purchased Product');
    });

    it('rejects invalid order status (chk_orders_status)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO orders (id, user_id, order_status, total_cost_paise, shipping_fee_paise, shipping_full_name, shipping_address_line1, shipping_city, shipping_state, shipping_pincode, shipping_phone, reservation_expires_at)
          VALUES ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'INVALID_STATUS', 100000, 0, 'Order User', 'Street 1', 'City', 'State', '400001', '+919999999999', NOW() + INTERVAL '15 minutes');
        `)
      ).rejects.toThrow();
    });

    it('preserves historical orders when user is deleted (ON DELETE SET NULL)', async () => {
      await testSequelize.query(`
        INSERT INTO orders (id, user_id, order_status, total_cost_paise, shipping_fee_paise, shipping_full_name, shipping_address_line1, shipping_city, shipping_state, shipping_pincode, shipping_phone, reservation_expires_at)
        VALUES ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'PAID', 100000, 0, 'Order User', 'Street 1', 'City', 'State', '400001', '+919999999999', NOW() + INTERVAL '15 minutes');
      `);

      // Delete user
      await testSequelize.query(`DELETE FROM users WHERE id = '20000000-0000-4000-8000-000000000003';`);

      const [order] = await testSequelize.query('SELECT id, user_id FROM orders WHERE id = \'70000000-0000-4000-8000-000000000003\';');
      expect(order[0].id).toBe('70000000-0000-4000-8000-000000000003');
      expect(order[0].user_id).toBeNull();
    });

    it('blocks hard deletion of product with historical orders (ON DELETE RESTRICT)', async () => {
      await testSequelize.query(`
        INSERT INTO orders (id, user_id, order_status, total_cost_paise, shipping_fee_paise, shipping_full_name, shipping_address_line1, shipping_city, shipping_state, shipping_pincode, shipping_phone, reservation_expires_at)
        VALUES ('70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', 'PAID', 100000, 0, 'Order User', 'Street 1', 'City', 'State', '400001', '+919999999999', NOW() + INTERVAL '15 minutes');

        INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_paise)
        VALUES ('80000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002', 'Purchased Product', 1, 100000);
      `);

      // Attempt hard deletion of product
      await expect(
        testSequelize.query(`DELETE FROM products WHERE id = '30000000-0000-4000-8000-000000000002';`)
      ).rejects.toThrow();
    });
  });

  describe('6. Payment Attempts & Partial Unique Indexes', () => {
    beforeEach(async () => {
      await testSequelize.query(`
        INSERT INTO orders (id, user_id, order_status, total_cost_paise, shipping_fee_paise, shipping_full_name, shipping_address_line1, shipping_city, shipping_state, shipping_pincode, shipping_phone, reservation_expires_at)
        VALUES ('70000000-0000-4000-8000-000000000005', NULL, 'PENDING_PAYMENT', 50000, 0, 'Guest User', 'Street 1', 'City', 'State', '400001', '+919999999999', NOW() + INTERVAL '15 minutes');
      `);
    });

    it('allows multiple payment retry attempts for the same order', async () => {
      await testSequelize.query(`
        INSERT INTO payment_attempts (id, order_id, attempt_number, razorpay_order_id, status, amount_paise)
        VALUES ('90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000005', 1, 'rzp_order_1', 'FAILED', 50000),
               ('90000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000005', 2, 'rzp_order_2', 'SUCCESS', 50000);
      `);

      const [attempts] = await testSequelize.query('SELECT count(*) FROM payment_attempts WHERE order_id = \'70000000-0000-4000-8000-000000000005\';');
      expect(parseInt(attempts[0].count, 10)).toBe(2);
    });

    it('enforces at most ONE SUCCESS payment attempt per order (uq_one_success_payment_per_order)', async () => {
      await testSequelize.query(`
        INSERT INTO payment_attempts (id, order_id, attempt_number, razorpay_order_id, status, amount_paise)
        VALUES ('90000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000005', 1, 'rzp_order_3', 'SUCCESS', 50000);
      `);

      // Attempting a second SUCCESS attempt on the same order must fail!
      await expect(
        testSequelize.query(`
          INSERT INTO payment_attempts (id, order_id, attempt_number, razorpay_order_id, status, amount_paise)
          VALUES ('90000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000005', 2, 'rzp_order_4', 'SUCCESS', 50000);
        `)
      ).rejects.toThrow();
    });

    it('enforces partial uniqueness on non-null razorpay_order_id', async () => {
      await testSequelize.query(`
        INSERT INTO payment_attempts (id, order_id, attempt_number, razorpay_order_id, status, amount_paise)
        VALUES ('90000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000005', 1, 'rzp_unique_ord_1', 'FAILED', 50000);
      `);

      // Duplicate razorpay_order_id must fail
      await expect(
        testSequelize.query(`
          INSERT INTO payment_attempts (id, order_id, attempt_number, razorpay_order_id, status, amount_paise)
          VALUES ('90000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000005', 2, 'rzp_unique_ord_1', 'INITIATED', 50000);
        `)
      ).rejects.toThrow();
    });
  });

  describe('7. Payment Events Webhook Deduplication', () => {
    it('enforces uniqueness on event_id (uq_payment_events_event_id)', async () => {
      await testSequelize.query(`
        INSERT INTO payment_events (id, event_id, event_type, processing_status)
        VALUES ('a0000000-0000-4000-8000-000000000001', 'evt_webhook_123', 'payment.captured', 'RECEIVED');
      `);

      await expect(
        testSequelize.query(`
          INSERT INTO payment_events (id, event_id, event_type, processing_status)
          VALUES ('a0000000-0000-4000-8000-000000000002', 'evt_webhook_123', 'payment.captured', 'RECEIVED');
        `)
      ).rejects.toThrow();
    });

    it('rejects invalid processing status (chk_payment_events_status)', async () => {
      await expect(
        testSequelize.query(`
          INSERT INTO payment_events (id, event_id, event_type, processing_status)
          VALUES ('a0000000-0000-4000-8000-000000000003', 'evt_webhook_456', 'payment.captured', 'INVALID_STATUS');
        `)
      ).rejects.toThrow();
    });
  });

  describe('8. Idempotency Records Scoped Uniqueness', () => {
    it('enforces scoped uniqueness on (idempotency_key, request_path)', async () => {
      await testSequelize.query(`
        INSERT INTO idempotency_records (id, idempotency_key, request_path, status, request_hash, expires_at)
        VALUES ('b0000000-0000-4000-8000-000000000001', 'idem-key-1', '/api/checkout/initiate', 'IN_PROGRESS', 'hash_abc', NOW() + INTERVAL '24 hours');
      `);

      // Same key + same path must fail
      await expect(
        testSequelize.query(`
          INSERT INTO idempotency_records (id, idempotency_key, request_path, status, request_hash, expires_at)
          VALUES ('b0000000-0000-4000-8000-000000000002', 'idem-key-1', '/api/checkout/initiate', 'IN_PROGRESS', 'hash_abc', NOW() + INTERVAL '24 hours');
        `)
      ).rejects.toThrow();

      // Same key + different path is allowed
      await testSequelize.query(`
        INSERT INTO idempotency_records (id, idempotency_key, request_path, status, request_hash, expires_at)
        VALUES ('b0000000-0000-4000-8000-000000000003', 'idem-key-1', '/api/admin/restock', 'IN_PROGRESS', 'hash_abc', NOW() + INTERVAL '24 hours');
      `);

      const [rows] = await testSequelize.query('SELECT count(*) FROM idempotency_records;');
      expect(parseInt(rows[0].count, 10)).toBe(2);
    });
  });

  describe('9. Security & Prohibited Column Audit', () => {
    it('verifies that no table contains plaintext card numbers, CVVs, or persistent Razorpay signatures', async () => {
      const [columns] = await testSequelize.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND (
            column_name ~* 'card_number' OR 
            column_name ~* 'cvv' OR 
            column_name ~* 'cvc' OR 
            column_name ~* 'mpin' OR 
            column_name ~* 'signature' OR
            column_name = 'pin' OR
            column_name = 'idempotency_key_hash'
          );
      `);

      expect(columns.length).toBe(0);
    });
  });
});
