'use strict';

/**
 * Migration 011: Create Audit Logs and Stock Restock Logs Tables
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Create audit_logs table
      await queryInterface.createTable(
        'audit_logs',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          actor_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: 'users',
              key: 'id',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          action: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          target_resource: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          resource_id: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          ip_address: {
            type: Sequelize.STRING(45),
            allowNull: false,
          },
          details_json: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction }
      );

      // Add indexes on audit_logs
      await queryInterface.addIndex('audit_logs', ['actor_id'], {
        name: 'idx_audit_logs_actor',
        transaction,
      });
      await queryInterface.addIndex('audit_logs', ['action', 'created_at'], {
        name: 'idx_audit_logs_action_created',
        order: [['created_at', 'DESC']],
        transaction,
      });
      await queryInterface.addIndex('audit_logs', ['target_resource', 'resource_id'], {
        name: 'idx_audit_logs_resource',
        transaction,
      });

      // 2. Create stock_restock_logs table
      await queryInterface.createTable(
        'stock_restock_logs',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          order_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: 'orders',
              key: 'id',
            },
            onDelete: 'SET NULL',
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
          quantity_restocked: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          initiated_by: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'users',
              key: 'id',
            },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          },
          reason: {
            type: Sequelize.STRING(500),
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction }
      );

      // Add CHECK constraint on stock_restock_logs
      await queryInterface.sequelize.query(
        `ALTER TABLE stock_restock_logs ADD CONSTRAINT chk_restock_quantity CHECK (quantity_restocked > 0);`,
        { transaction }
      );

      // Add indexes on stock_restock_logs
      await queryInterface.addIndex('stock_restock_logs', ['product_id'], {
        name: 'idx_stock_restock_product',
        transaction,
      });
      await queryInterface.addIndex('stock_restock_logs', ['order_id'], {
        name: 'idx_stock_restock_order',
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
      await queryInterface.dropTable('stock_restock_logs', { transaction });
      await queryInterface.dropTable('audit_logs', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
