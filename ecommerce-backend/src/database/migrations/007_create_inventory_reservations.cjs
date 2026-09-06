'use strict';

/**
 * Migration 007: Create Inventory Reservations Table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'inventory_reservations',
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
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          expires_at: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          status: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'ACTIVE',
          },
          released_at: {
            type: Sequelize.DATE,
            allowNull: true,
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

      // Add unique constraint (order_id, product_id)
      await queryInterface.addConstraint('inventory_reservations', {
        fields: ['order_id', 'product_id'],
        type: 'unique',
        name: 'uq_inv_res_order_product',
        transaction,
      });

      // Add CHECK constraints
      await queryInterface.sequelize.query(
        `ALTER TABLE inventory_reservations ADD CONSTRAINT chk_inv_res_status CHECK (status IN ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED'));`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE inventory_reservations ADD CONSTRAINT chk_inv_res_quantity CHECK (quantity > 0);`,
        { transaction }
      );

      // Add partial and foreign key indexes
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_inv_res_active_expiry ON inventory_reservations(status, expires_at) WHERE status = 'ACTIVE';`,
        { transaction }
      );
      await queryInterface.addIndex('inventory_reservations', ['product_id'], {
        name: 'idx_inv_res_product_id',
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
      await queryInterface.dropTable('inventory_reservations', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
