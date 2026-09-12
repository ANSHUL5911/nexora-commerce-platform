import crypto from 'crypto';
import supertest from 'supertest';
import {
  User,
  Product,
  Order,
  OrderItem,
  PaymentAttempt,
} from '../../../src/models/index.js';
import { sequelize } from '../../../src/config/database.js';
import { app } from '../../../src/app.js';
import { hashPassword } from '../../../src/modules/auth/password.js';
import { SESSION_COOKIE_NAME } from '../../../src/modules/auth/auth.middleware.js';
import { CSRF_COOKIE_NAME } from '../../../src/modules/auth/csrf.js';

export async function createTestAdmin({
  id = crypto.randomUUID(),
  email = `admin-${crypto.randomUUID()}@example.com`,
  password = 'AdminSecurePassword123!',
  fullName = 'Administrator User',
} = {}) {
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    id,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    full_name: fullName,
    role: 'admin',
    is_active: true,
  });
  return { user, password };
}

export async function createTestCustomer({
  id = crypto.randomUUID(),
  email = `customer-${crypto.randomUUID()}@example.com`,
  password = 'CustomerSecurePassword123!',
  fullName = 'Regular Customer',
} = {}) {
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    id,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    full_name: fullName,
    role: 'customer',
    is_active: true,
  });
  return { user, password };
}

export async function createTestProduct({
  id = crypto.randomUUID(),
  name = 'Test Mechanical Keyboard',
  description = 'High precision tactile keyboard',
  pricePaise = 500000,
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

export async function createPaidOrderWithAttempt({
  userId,
  product,
  quantity = 2,
  orderStatus = 'PAID',
  paymentAttemptStatus = 'SUCCESS',
  razorpayPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`,
} = {}) {
  const unitPrice = Number(product.price_paise);
  const totalCost = unitPrice * quantity;

  const order = await Order.create({
    id: crypto.randomUUID(),
    user_id: userId || null,
    order_status: orderStatus,
    total_cost_paise: totalCost,
    shipping_fee_paise: 0,
    shipping_full_name: 'Test Buyer',
    shipping_address_line1: '123 Test St',
    shipping_city: 'Bengaluru',
    shipping_state: 'Karnataka',
    shipping_pincode: '560001',
    shipping_phone: '9876543210',
    reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000),
  });

  const orderItem = await OrderItem.create({
    id: crypto.randomUUID(),
    order_id: order.id,
    product_id: product.id,
    product_name_snapshot: product.name,
    quantity,
    unit_price_paise: unitPrice,
  });

  const paymentAttempt = await PaymentAttempt.create({
    id: crypto.randomUUID(),
    order_id: order.id,
    attempt_number: 1,
    razorpay_order_id: `order_${crypto.randomBytes(8).toString('hex')}`,
    razorpay_payment_id: razorpayPaymentId,
    status: paymentAttemptStatus,
    amount_paise: totalCost,
  });

  return { order, orderItem, paymentAttempt };
}

export async function getAuthSession(user, password) {
  const request = supertest(app);
  const randomIp = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const loginRes = await request
    .post('/api/auth/login')
    .set('X-Forwarded-For', randomIp)
    .send({
      email: user.email,
      password,
    });

  const cookies = loginRes.headers['set-cookie'] || [];
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  const csrfCookie = cookies.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  const sid = sessionCookie ? sessionCookie.split(';')[0].split('=')[1] : null;
  const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

  return {
    sid,
    csrfToken,
    cookieHeader: [`${SESSION_COOKIE_NAME}=${sid}`, `${CSRF_COOKIE_NAME}=${csrfToken}`].join('; '),
    sessionCookie: `${SESSION_COOKIE_NAME}=${sid}`,
  };
}

export async function cleanupAdminTables() {
  await sequelize.query(
    'TRUNCATE users, products, orders, order_items, inventory_reservations, carts, cart_items, payment_attempts, payment_events, idempotency_records, stock_restock_logs, audit_logs CASCADE;'
  );
}

export default {
  createTestAdmin,
  createTestCustomer,
  createTestProduct,
  createPaidOrderWithAttempt,
  getAuthSession,
  cleanupAdminTables,
};
