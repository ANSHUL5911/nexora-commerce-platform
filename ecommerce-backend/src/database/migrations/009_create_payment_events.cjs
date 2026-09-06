'use strict';

/**
 * Migration 009: Create Payment Events Table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'payment_events',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          event_id: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
          },
          event_type: {
            type: Sequelize.STRING(100),
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
          payment_attempt_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: 'payment_attempts',
              key: 'id',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          processing_status: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'RECEIVED',
          },
          metadata_json: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          received_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction }
      );

      // Add CHECK constraint on processing_status
      await queryInterface.sequelize.query(
        `ALTER TABLE payment_events ADD CONSTRAINT chk_payment_events_status CHECK (processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED_DUPLICATE', 'REQUIRES_REFUND', 'FAILED'));`,
        { transaction }
      );

      // Add index on order_id
      await queryInterface.addIndex('payment_events', ['order_id'], {
        name: 'idx_payment_events_order_id',
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
      await queryInterface.dropTable('payment_events', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
