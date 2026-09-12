import { DataTypes, Model } from 'sequelize';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';

export class PaymentAttempt extends Model {}

PaymentAttempt.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: () => crypto.randomUUID(),
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'orders',
        key: 'id',
      },
    },
    attempt_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    razorpay_order_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    razorpay_payment_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    razorpay_refund_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'INITIATED',
      validate: {
        isIn: [['INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED']],
      },
    },
    failure_reason: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    amount_paise: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        min: 0,
      },
      get() {
        const rawValue = this.getDataValue('amount_paise');
        if (rawValue === null || rawValue === undefined) return rawValue;
        return typeof rawValue === 'string' ? parseInt(rawValue, 10) : Number(rawValue);
      },
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
    tableName: 'payment_attempts',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default PaymentAttempt;
