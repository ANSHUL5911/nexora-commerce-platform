import { User } from './User.js';
import { Session } from './Session.js';
import { AuditLog } from './AuditLog.js';
import { Product } from './Product.js';
import { Cart } from './Cart.js';
import { CartItem } from './CartItem.js';
import { InventoryReservation } from './InventoryReservation.js';
import { Order } from './Order.js';
import { OrderItem } from './OrderItem.js';
import { PaymentAttempt } from './PaymentAttempt.js';
import { PaymentEvent } from './PaymentEvent.js';
import { IdempotencyRecord } from './IdempotencyRecord.js';
import { StockRestockLog } from './StockRestockLog.js';

// User <-> Session (1:N)
User.hasMany(Session, {
  foreignKey: 'user_id',
  as: 'sessions',
  onDelete: 'CASCADE',
});

Session.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE',
});

// User <-> AuditLog (1:N)
User.hasMany(AuditLog, {
  foreignKey: 'actor_id',
  as: 'auditLogs',
  onDelete: 'SET NULL',
});

AuditLog.belongsTo(User, {
  foreignKey: 'actor_id',
  as: 'actor',
  onDelete: 'SET NULL',
});

// User <-> Cart (1:1)
User.hasOne(Cart, {
  foreignKey: 'user_id',
  as: 'cart',
  onDelete: 'CASCADE',
});

Cart.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'CASCADE',
});

// Cart <-> CartItem (1:N)
Cart.hasMany(CartItem, {
  foreignKey: 'cart_id',
  as: 'items',
  onDelete: 'CASCADE',
});

CartItem.belongsTo(Cart, {
  foreignKey: 'cart_id',
  as: 'cart',
  onDelete: 'CASCADE',
});

// Product <-> CartItem (1:N)
Product.hasMany(CartItem, {
  foreignKey: 'product_id',
  as: 'cartItems',
  onDelete: 'RESTRICT',
});

CartItem.belongsTo(Product, {
  foreignKey: 'product_id',
  as: 'product',
  onDelete: 'RESTRICT',
});

// Product <-> InventoryReservation (1:N)
Product.hasMany(InventoryReservation, {
  foreignKey: 'product_id',
  as: 'reservations',
  onDelete: 'RESTRICT',
});

InventoryReservation.belongsTo(Product, {
  foreignKey: 'product_id',
  as: 'product',
  onDelete: 'RESTRICT',
});

// User <-> Order (1:N)
User.hasMany(Order, {
  foreignKey: 'user_id',
  as: 'orders',
  onDelete: 'SET NULL',
});

Order.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'SET NULL',
});

// Order <-> OrderItem (1:N)
Order.hasMany(OrderItem, {
  foreignKey: 'order_id',
  as: 'items',
  onDelete: 'CASCADE',
});

OrderItem.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
  onDelete: 'CASCADE',
});

// Product <-> OrderItem (1:N)
Product.hasMany(OrderItem, {
  foreignKey: 'product_id',
  as: 'orderItems',
  onDelete: 'RESTRICT',
});

OrderItem.belongsTo(Product, {
  foreignKey: 'product_id',
  as: 'product',
  onDelete: 'RESTRICT',
});

// Order <-> InventoryReservation (1:N)
Order.hasMany(InventoryReservation, {
  foreignKey: 'order_id',
  as: 'reservations',
  onDelete: 'CASCADE',
});

InventoryReservation.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
  onDelete: 'CASCADE',
});

// Order <-> PaymentAttempt (1:N)
Order.hasMany(PaymentAttempt, {
  foreignKey: 'order_id',
  as: 'paymentAttempts',
  onDelete: 'CASCADE',
});

PaymentAttempt.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
  onDelete: 'CASCADE',
});

// Order <-> PaymentEvent (1:N)
Order.hasMany(PaymentEvent, {
  foreignKey: 'order_id',
  as: 'paymentEvents',
  onDelete: 'SET NULL',
});

PaymentEvent.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
  onDelete: 'SET NULL',
});

// PaymentAttempt <-> PaymentEvent (1:N)
PaymentAttempt.hasMany(PaymentEvent, {
  foreignKey: 'payment_attempt_id',
  as: 'paymentEvents',
  onDelete: 'SET NULL',
});

PaymentEvent.belongsTo(PaymentAttempt, {
  foreignKey: 'payment_attempt_id',
  as: 'paymentAttempt',
  onDelete: 'SET NULL',
});

// Order <-> IdempotencyRecord (1:N)
Order.hasMany(IdempotencyRecord, {
  foreignKey: 'order_id',
  as: 'idempotencyRecords',
  onDelete: 'SET NULL',
});

IdempotencyRecord.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
  onDelete: 'SET NULL',
});

// PaymentAttempt <-> IdempotencyRecord (1:N)
PaymentAttempt.hasMany(IdempotencyRecord, {
  foreignKey: 'payment_attempt_id',
  as: 'idempotencyRecords',
  onDelete: 'SET NULL',
});

IdempotencyRecord.belongsTo(PaymentAttempt, {
  foreignKey: 'payment_attempt_id',
  as: 'paymentAttempt',
  onDelete: 'SET NULL',
});

// Order <-> StockRestockLog (1:N)
Order.hasMany(StockRestockLog, {
  foreignKey: 'order_id',
  as: 'restockLogs',
  onDelete: 'SET NULL',
});

StockRestockLog.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order',
  onDelete: 'SET NULL',
});

// Product <-> StockRestockLog (1:N)
Product.hasMany(StockRestockLog, {
  foreignKey: 'product_id',
  as: 'restockLogs',
  onDelete: 'RESTRICT',
});

StockRestockLog.belongsTo(Product, {
  foreignKey: 'product_id',
  as: 'product',
  onDelete: 'RESTRICT',
});

// User <-> StockRestockLog (1:N)
User.hasMany(StockRestockLog, {
  foreignKey: 'initiated_by',
  as: 'restockLogs',
  onDelete: 'RESTRICT',
});

StockRestockLog.belongsTo(User, {
  foreignKey: 'initiated_by',
  as: 'actor',
  onDelete: 'RESTRICT',
});

export {
  User,
  Session,
  AuditLog,
  Product,
  Cart,
  CartItem,
  InventoryReservation,
  Order,
  OrderItem,
  PaymentAttempt,
  PaymentEvent,
  IdempotencyRecord,
  StockRestockLog,
};

export default {
  User,
  Session,
  AuditLog,
  Product,
  Cart,
  CartItem,
  InventoryReservation,
  Order,
  OrderItem,
  PaymentAttempt,
  PaymentEvent,
  IdempotencyRecord,
  StockRestockLog,
};

