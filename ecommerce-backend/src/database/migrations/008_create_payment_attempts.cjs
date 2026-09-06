'use strict';

/**
 * Migration 008: Create Payment Attempts Table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'payment_attempts',
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
          attempt_number: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          razorpay_order_id: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          razorpay_payment_id: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          razorpay_refund_id: {
            type: Sequelize.STRING(255),
            allowNull: true,
          },
          status: {
            type: Sequelize.STRING(50),
            allowNull: false,
            defaultValue: 'INITIATED',
          },
          failure_reason: {
            type: Sequelize.STRING(500),
            allowNull: true,
          },
          amount_paise: {
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

      // Add unique constraint (order_id, attempt_number)
      await queryInterface.addConstraint('payment_attempts', {
        fields: ['order_id', 'attempt_number'],
        type: 'unique',
        name: 'uq_payment_attempts_order_attempt',
        transaction,
      });

      // Add CHECK constraints
      await queryInterface.sequelize.query(
        `ALTER TABLE payment_attempts ADD CONSTRAINT chk_payment_attempts_attempt_number CHECK (attempt_number > 0);`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE payment_attempts ADD CONSTRAINT chk_payment_attempts_status CHECK (status IN ('INITIATED', 'SUCCESS', 'FAILED', 'REFUNDED'));`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE payment_attempts ADD CONSTRAINT chk_payment_attempts_amount_paise CHECK (amount_paise >= 0);`,
        { transaction }
      );

      // Add indexes & partial unique indexes
      await queryInterface.addIndex('payment_attempts', ['order_id'], {
        name: 'idx_payment_attempts_order_id',
        transaction,
      });
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX idx_payment_attempts_rzp_order ON payment_attempts(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX idx_payment_attempts_rzp_payment ON payment_attempts(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX uq_one_success_payment_per_order ON payment_attempts(order_id) WHERE status = 'SUCCESS';`,
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
      await queryInterface.dropTable('payment_attempts', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
