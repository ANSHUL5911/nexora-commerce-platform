import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { User, Product, Cart, CartItem, Order, OrderItem } from '../../../src/models/index.js';
import { sequelize } from '../../../src/config/database.js';

/**
 * Provision a valid User fixture in the test database.
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
 * Provision a valid Product fixture in the test database.
 */
export async function createTestProduct({
  id = crypto.randomUUID(),
  name = 'Test Mechanical Keyboard',
  description = 'High precision tactile keyboard',
  pricePaise = 500000, // ₹5,000.00
  stockQuantity = 10,
  reservedQuantity = 0,
  category = 'Electronics',
  imageUrl = 'https://images.unsplash.com/keyboard',
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
 * Provision a Cart fixture for a user.
 */
export async function createTestCart({
  id = crypto.randomUUID(),
  userId,
} = {}) {
  return Cart.create({
    id,
    user_id: userId,
  });
}

/**
 * Provision a CartItem fixture.
 */
export async function createTestCartItem({
  id = crypto.randomUUID(),
  cartId,
  productId,
  quantity = 1,
} = {}) {
  return CartItem.create({
    id,
    cart_id: cartId,
    product_id: productId,
    quantity,
  });
}

/**
 * Provision an Order fixture in the test database.
 */
export async function createTestOrder({
  id = crypto.randomUUID(),
  userId,
  orderStatus = 'PENDING_PAYMENT',
  totalCostPaise = 510000,
  shippingFeePaise = 10000,
  shippingFullName = 'John Doe',
  shippingAddressLine1 = '123 Tech Boulevard',
  shippingCity = 'Bengaluru',
  shippingState = 'Karnataka',
  shippingPincode = '560001',
  shippingPhone = '9876543210',
  guestTokenHash = null,
  reservationExpiresAt = null,
} = {}) {
  const expiresAtValue = reservationExpiresAt
    ? reservationExpiresAt
    : Sequelize.literal("CURRENT_TIMESTAMP + INTERVAL '15 minutes'");

  const order = await Order.create({
    id,
    user_id: userId || null,
    order_status: orderStatus,
    total_cost_paise: totalCostPaise,
    shipping_fee_paise: shippingFeePaise,
    shipping_full_name: shippingFullName,
    shipping_address_line1: shippingAddressLine1,
    shipping_city: shippingCity,
    shipping_state: shippingState,
    shipping_pincode: shippingPincode,
    shipping_phone: shippingPhone,
    guest_token_hash: guestTokenHash,
    reservation_expires_at: expiresAtValue,
  });

  await order.reload();
  return order;
}

/**
 * Provision an OrderItem fixture in the test database.
 */
export async function createTestOrderItem({
  id = crypto.randomUUID(),
  orderId,
  productId,
  productNameSnapshot = 'Test Mechanical Keyboard',
  quantity = 1,
  unitPricePaise = 500000,
} = {}) {
  return OrderItem.create({
    id,
    order_id: orderId,
    product_id: productId,
    product_name_snapshot: productNameSnapshot,
    quantity,
    unit_price_paise: unitPricePaise,
  });
}

/**
 * Clean up order and commerce test fixtures.
 */
export async function cleanupOrderTables() {
  await sequelize.query(
    'TRUNCATE users, products, orders, order_items, inventory_reservations, carts, cart_items CASCADE;'
  );
}

export default {
  createTestUser,
  createTestProduct,
  createTestCart,
  createTestCartItem,
  createTestOrder,
  createTestOrderItem,
  cleanupOrderTables,
};
