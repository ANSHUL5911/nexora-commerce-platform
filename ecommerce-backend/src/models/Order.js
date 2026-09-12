import { DataTypes, Model } from 'sequelize';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';

export class Order extends Model {
  get subtotal_paise() {
    const total = Number(this.getDataValue('total_cost_paise') ?? 0);
    const shipping = Number(this.getDataValue('shipping_fee_paise') ?? 0);
    return Math.max(0, total - shipping);
  }
}

Order.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: () => crypto.randomUUID(),
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    order_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'PENDING_PAYMENT',
      validate: {
        isIn: [
          [
            'PENDING_PAYMENT',
            'PAID',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
            'EXPIRED',
            'REFUNDED',
          ],
        ],
      },
    },
    total_cost_paise: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        min: 0,
      },
      get() {
        const rawValue = this.getDataValue('total_cost_paise');
        if (rawValue === null || rawValue === undefined) return rawValue;
        return typeof rawValue === 'string' ? parseInt(rawValue, 10) : Number(rawValue);
      },
    },
    shipping_fee_paise: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
      get() {
        const rawValue = this.getDataValue('shipping_fee_paise');
        if (rawValue === null || rawValue === undefined) return rawValue;
        return typeof rawValue === 'string' ? parseInt(rawValue, 10) : Number(rawValue);
      },
    },
    shipping_full_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    shipping_address_line1: {
      type: DataTypes.STRING(500),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    shipping_city: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    shipping_state: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    shipping_pincode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    shipping_phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    guest_token_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    reservation_expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default Order;
