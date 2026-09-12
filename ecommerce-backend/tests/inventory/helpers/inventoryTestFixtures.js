import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { User } from '../../../src/models/User.js';
import { Product } from '../../../src/models/Product.js';
import { InventoryReservation } from '../../../src/models/InventoryReservation.js';
import { sequelize } from '../../../src/config/database.js';

/**
 * Provision a minimal valid User fixture in PostgreSQL test database.
 */
export async function createTestUser({
  id = crypto.randomUUID(),
  email = `user-${crypto.randomUUID()}@example.com`,
  passwordHash = '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforunittesting',
  fullName = 'Test Customer',
  role = 'customer',
} = {}) {
  return User.create({
    id,
    email,
    password_hash: passwordHash,
    full_name: fullName,
    role,
  });
}

/**
 * Provision a minimal valid Product fixture in PostgreSQL test database.
 */
export async function createTestProduct({
  id = crypto.randomUUID(),
  name = 'Test Leather Jacket',
  description = 'Premium leather jacket',
  pricePaise = 1500000, // ₹15,000.00
  stockQuantity = 10,
  reservedQuantity = 0,
  category = 'Outerwear',
  imageUrl = 'https://images.unsplash.com/jacket',
  isDeleted = false,
} = {}) {
  return Product.create({
    id,
    name,
    description,
    price_paise: pricePaise,
    stock_quantity: stockQuantity,
    reserved_quantity: reservedQuantity,
    category,
    image_url: imageUrl,
    is_deleted: isDeleted,
  });
}

/**
 * Provision a minimal valid Order fixture directly in the `orders` table
 * strictly to satisfy foreign key constraints during inventory reservation tests.
 */
export async function createTestOrder({
  id = crypto.randomUUID(),
  userId,
  orderStatus = 'PENDING_PAYMENT',
  totalCostPaise = 1500000,
  shippingFeePaise = 0,
  shippingFullName = 'Test Customer',
  shippingAddressLine1 = '221B Baker Street',
  shippingCity = 'London',
  shippingState = 'Greater London',
  shippingPincode = 'NW16XE',
  shippingPhone = '9876543210',
  reservationExpiresAt = new Date(Date.now() + 15 * 60 * 1000),
} = {}) {
  const rows = await sequelize.query(
    `INSERT INTO orders (
      id, user_id, order_status, total_cost_paise, shipping_fee_paise,
      shipping_full_name, shipping_address_line1, shipping_city,
      shipping_state, shipping_pincode, shipping_phone, reservation_expires_at,
      created_at, updated_at
    ) VALUES (
      :id, :userId, :orderStatus, :totalCostPaise, :shippingFeePaise,
      :shippingFullName, :shippingAddressLine1, :shippingCity,
      :shippingState, :shippingPincode, :shippingPhone, :reservationExpiresAt,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING *;`,
    {
      replacements: {
        id,
        userId: userId || null,
        orderStatus,
        totalCostPaise,
        shippingFeePaise,
        shippingFullName,
        shippingAddressLine1,
        shippingCity,
        shippingState,
        shippingPincode,
        shippingPhone,
        reservationExpiresAt,
      },
      type: Sequelize.QueryTypes.SELECT,
    }
  );

  return rows[0];
}

/**
 * Provision a minimal valid InventoryReservation directly in PostgreSQL.
 */
export async function createTestReservation({
  id = crypto.randomUUID(),
  orderId,
  productId,
  quantity = 1,
  status = 'ACTIVE',
  expiresAt = null,
} = {}) {
  const expiresAtValue = expiresAt
    ? expiresAt
    : Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'");

  const reservation = await InventoryReservation.create({
    id,
    order_id: orderId,
    product_id: productId,
    quantity,
    status,
    expires_at: expiresAtValue,
  });

  await reservation.reload();
  return reservation;
}

/**
 * Clean up test fixtures.
 */
export async function cleanupInventoryTables() {
  await sequelize.query(
    'TRUNCATE users, products, orders, order_items, inventory_reservations, carts, cart_items CASCADE;'
  );
}
