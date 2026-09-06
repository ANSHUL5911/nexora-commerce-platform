'use strict';

/**
 * Migration 010: Create Idempotency Records Table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'idempotency_records',
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            allowNull: false,
          },
          idempotency_key: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          request_path: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          status: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'IN_PROGRESS',
          },
          request_hash: {
            type: Sequelize.STRING(64),
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
          response_code: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          response_body: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          expires_at: {
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

      // Add composite uniqueness constraint on (idempotency_key, request_path)
      await queryInterface.addConstraint('idempotency_records', {
        fields: ['idempotency_key', 'request_path'],
        type: 'unique',
        name: 'uq_idempotency_scope',
        transaction,
      });

      // Add CHECK constraint on status
      await queryInterface.sequelize.query(
        `ALTER TABLE idempotency_records ADD CONSTRAINT chk_idempotency_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED_RETRYABLE'));`,
        { transaction }
      );

      // Add index on expires_at for TTL cleanup
      await queryInterface.addIndex('idempotency_records', ['expires_at'], {
        name: 'idx_idempotency_records_expires_at',
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
      await queryInterface.dropTable('idempotency_records', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
