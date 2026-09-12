import { DataTypes, Model } from 'sequelize';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';

export class OrderItem extends Model {
  get line_total_paise() {
    const unitPrice = Number(this.getDataValue('unit_price_paise') ?? 0);
    const qty = Number(this.getDataValue('quantity') ?? 0);
    return unitPrice * qty;
  }
}

OrderItem.init(
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
    product_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id',
      },
    },
    product_name_snapshot: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    unit_price_paise: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        min: 0,
      },
      get() {
        const rawValue = this.getDataValue('unit_price_paise');
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
    tableName: 'order_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default OrderItem;
