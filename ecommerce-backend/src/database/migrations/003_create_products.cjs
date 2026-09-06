'use strict';

/**
 * Migration 003: Create Products Table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'products',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          price_paise: {
            type: Sequelize.BIGINT,
            allowNull: false,
          },
          stock_quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          reserved_quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          category: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          image_url: {
            type: Sequelize.STRING(1024),
            allowNull: false,
          },
          is_deleted: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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

      // Add CHECK constraints on products
      await queryInterface.sequelize.query(
        `ALTER TABLE products ADD CONSTRAINT chk_products_price_paise CHECK (price_paise >= 0);`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE products ADD CONSTRAINT chk_products_stock_quantity CHECK (stock_quantity >= 0);`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE products ADD CONSTRAINT chk_products_reserved_quantity CHECK (reserved_quantity >= 0);`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE products ADD CONSTRAINT chk_products_reserved_lte_stock CHECK (reserved_quantity <= stock_quantity);`,
        { transaction }
      );

      // Add indexes on products
      await queryInterface.addIndex('products', ['category'], {
        name: 'idx_products_category',
        transaction,
      });
      await queryInterface.addIndex('products', ['is_deleted'], {
        name: 'idx_products_is_deleted',
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
      await queryInterface.dropTable('products', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
