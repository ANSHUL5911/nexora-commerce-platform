'use strict';

/**
 * Migration 005: Create Addresses Table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'addresses',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
            references: {
              model: 'users',
              key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          full_name: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          address_line1: {
            type: Sequelize.STRING(500),
            allowNull: false,
          },
          city: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          state: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          pincode: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          phone: {
            type: Sequelize.STRING(20),
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

      // Add CHECK constraint on pincode (6-digit Indian PIN)
      await queryInterface.sequelize.query(
        `ALTER TABLE addresses ADD CONSTRAINT chk_addresses_pincode CHECK (pincode ~ '^[1-9][0-9]{5}$');`,
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('addresses', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
