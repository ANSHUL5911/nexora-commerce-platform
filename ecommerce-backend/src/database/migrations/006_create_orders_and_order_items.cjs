'use strict';

/**
 * Migration 006: Create Orders and Order Items Tables
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Create orders table
      await queryInterface.createTable(
        'orders',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: 'users',
              key: 'id',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          order_status: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'PENDING_PAYMENT',
          },
          total_cost_paise: {
            type: Sequelize.BIGINT,
            allowNull: false,
          },
          shipping_fee_paise: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
          },
          shipping_full_name: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          shipping_address_line1: {
            type: Sequelize.STRING(500),
            allowNull: false,
          },
          shipping_city: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          shipping_state: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          shipping_pincode: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          shipping_phone: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          guest_token_hash: {
            type: Sequelize.STRING(64),
            allowNull: true,
          },
          reservation_expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction }
      );

      // Add CHECK constraints on orders
      await queryInterface.sequelize.query(
        `ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (order_status IN ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'REFUNDED'));`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE orders ADD CONSTRAINT chk_orders_total_cost_paise CHECK (total_cost_paise >= 0);`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE orders ADD CONSTRAINT chk_orders_shipping_fee_paise CHECK (shipping_fee_paise >= 0);`,
        { transaction }
      );

      // Add indexes on orders
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC) WHERE user_id IS NOT NULL;`,
        { transaction }
      );
      await queryInterface.addIndex('orders', ['order_status', 'created_at'], {
        name: 'idx_orders_status_created',
        order: [['created_at', 'DESC']],
        transaction,
      });
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_orders_guest_token_hash ON orders(guest_token_hash) WHERE guest_token_hash IS NOT NULL;`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_orders_pending_reservation_expiry ON orders(reservation_expires_at) WHERE order_status = 'PENDING_PAYMENT';`,
        { transaction }
      );

      // 2. Create order_items table
      await queryInterface.createTable(
        'order_items',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          order_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'orders',
              key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'products',
              key: 'id',
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          product_name_snapshot: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          unit_price_paise: {
            type: Sequelize.BIGINT,
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction }
      );

      // Add CHECK constraints on order_items
      await queryInterface.sequelize.query(
        `ALTER TABLE order_items ADD CONSTRAINT chk_order_items_quantity CHECK (quantity > 0);`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE order_items ADD CONSTRAINT chk_order_items_unit_price_paise CHECK (unit_price_paise >= 0);`,
        { transaction }
      );

      // Add index on order_items
      await queryInterface.addIndex('order_items', ['order_id'], {
        name: 'idx_order_items_order_id',
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('order_items', { transaction });
      await queryInterface.dropTable('orders', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
