import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class PaymentEvent extends Model {}

PaymentEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    event_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    event_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
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
    processing_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'RECEIVED',
      validate: {
        isIn: {
          args: [
            [
              'RECEIVED',
              'PROCESSING',
              'PROCESSED',
              'IGNORED_DUPLICATE',
              'REQUIRES_REFUND',
              'FAILED',
            ],
          ],
          msg: 'Invalid payment event processing status',
        },
      },
    },
    metadata_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    received_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'payment_events',
    modelName: 'PaymentEvent',
    timestamps: false,
    underscored: true,
  }
);

export default PaymentEvent;
