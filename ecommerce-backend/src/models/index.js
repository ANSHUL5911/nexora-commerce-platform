import { User } from './User.js';
import { Session } from './Session.js';
import { AuditLog } from './AuditLog.js';
import { Product } from './Product.js';
import { Cart } from './Cart.js';
import { CartItem } from './CartItem.js';

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

export { User, Session, AuditLog, Product, Cart, CartItem };
export default { User, Session, AuditLog, Product, Cart, CartItem };
