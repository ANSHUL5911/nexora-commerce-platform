import { DataTypes, Model } from 'sequelize';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';

export class IdempotencyRecord extends Model {}

IdempotencyRecord.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: () => crypto.randomUUID(),
    },
    idempotency_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    request_path: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'IN_PROGRESS',
      validate: {
        isIn: [['IN_PROGRESS', 'COMPLETED', 'FAILED_RETRYABLE']],
      },
    },
    request_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [64, 64],
      },
    },
    order_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'orders',
        key: 'id',
      },
    },
    payment_attempt_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'payment_attempts',
        key: 'id',
      },
    },
    response_code: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    response_body: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    expires_at: {
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
    tableName: 'idempotency_records',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default IdempotencyRecord;
