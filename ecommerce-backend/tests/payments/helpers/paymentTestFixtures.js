import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import {
  User,
  Product,
  Order,
  OrderItem,
  InventoryReservation,
  PaymentAttempt,
  PaymentEvent,
} from '../../../src/models/index.js';
import { sequelize } from '../../../src/config/database.js';
import { config } from '../../../src/config/env.js';

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

export async function createTestOrder({
  id = crypto.randomUUID(),
  userId,
  orderStatus = 'PENDING_PAYMENT',
  totalCostPaise = 510000,
  shippingFeePaise = 10000,
  shippingFullName = 'Jane Doe',
  shippingAddressLine1 = '123 Tech Park Way',
  shippingCity = 'Bengaluru',
  shippingState = 'Karnataka',
  shippingPincode = '560001',
  shippingPhone = '9876543210',
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
    reservation_expires_at: expiresAtValue,
  });

  await order.reload();
  return order;
}

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

export async function createTestPaymentAttempt({
  id = crypto.randomUUID(),
  orderId,
  attemptNumber = 1,
  razorpayOrderId = `order_${crypto.randomBytes(8).toString('hex')}`,
  razorpayPaymentId = null,
  status = 'INITIATED',
  failureReason = null,
  amountPaise = 510000,
} = {}) {
  return PaymentAttempt.create({
    id,
    order_id: orderId,
    attempt_number: attemptNumber,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    status,
    failure_reason: failureReason,
    amount_paise: amountPaise,
  });
}

export async function createTestPaymentEvent({
  id = crypto.randomUUID(),
  eventId = `evt_${crypto.randomBytes(8).toString('hex')}`,
  eventType = 'payment.captured',
  orderId = null,
  paymentAttemptId = null,
  processingStatus = 'RECEIVED',
  metadataJson = null,
} = {}) {
  return PaymentEvent.create({
    id,
    event_id: eventId,
    event_type: eventType,
    order_id: orderId,
    payment_attempt_id: paymentAttemptId,
    processing_status: processingStatus,
    metadata_json: metadataJson,
  });
}

export function generateWebhookSignature(
  rawBody,
  secret = config.RAZORPAY_WEBHOOK_SECRET
) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function generateCapturedWebhookPayload({
  eventId = `evt_${crypto.randomBytes(8).toString('hex')}`,
  razorpayPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`,
  razorpayOrderId = `order_${crypto.randomBytes(8).toString('hex')}`,
  amountPaise = 510000,
  currency = 'INR',
  status = 'captured',
} = {}) {
  return {
    entity: 'event',
    account_id: 'acc_test123',
    event: 'payment.captured',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: razorpayPaymentId,
          entity: 'payment',
          amount: amountPaise,
          currency,
          status,
          order_id: razorpayOrderId,
          invoice_id: null,
          international: false,
          method: 'card',
          amount_refunded: 0,
          refund_status: null,
          captured: true,
          description: 'Payment for order',
          card_id: null,
          bank: null,
          wallet: null,
          vpa: null,
          email: 'customer@example.com',
          contact: '+919876543210',
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
    id: eventId,
  };
}

export async function cleanupPaymentTables() {
  await sequelize.query(
    'TRUNCATE users, products, orders, order_items, inventory_reservations, carts, cart_items, payment_attempts, payment_events CASCADE;'
  );
}

export default {
  createTestUser,
  createTestProduct,
  createTestOrder,
  createTestOrderItem,
  createTestReservation,
  createTestPaymentAttempt,
  createTestPaymentEvent,
  generateWebhookSignature,
  generateCapturedWebhookPayload,
  cleanupPaymentTables,
};
