'use strict';

/**
 * Seeder 04: Orders, Order Items, and Payment Attempts Seed
 * Deterministic test orders validating relational integrity across lifecycle states.
 * Note: Razorpay identifiers in test fixtures are clearly marked test data and do not represent real gateway transactions.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const orders = [
        {
          id: 'e0000000-0000-4000-8000-000000000001',
          user_id: 'c0000000-0000-4000-8000-000000000001',
          order_status: 'PAID',
          total_cost_paise: 849900, // ₹8,499.00
          shipping_fee_paise: 0,
          shipping_full_name: 'Aarav Mehta',
          shipping_address_line1: 'Flat 402, Monolith Residences, Altamount Road',
          shipping_city: 'Mumbai',
          shipping_state: 'Maharashtra',
          shipping_pincode: '400026',
          shipping_phone: '+919876543210',
          guest_token_hash: null,
          reservation_expires_at: new Date('2026-01-01T00:15:00Z'),
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:05:00Z'),
        },
        {
          id: 'e0000000-0000-4000-8000-000000000002',
          user_id: 'c0000000-0000-4000-8000-000000000002',
          order_status: 'PENDING_PAYMENT',
          total_cost_paise: 420000, // ₹4,200.00
          shipping_fee_paise: 0,
          shipping_full_name: 'Diya Sharma',
          shipping_address_line1: 'Villa 12, Golf Links Enclave',
          shipping_city: 'New Delhi',
          shipping_state: 'Delhi',
          shipping_pincode: '110003',
          shipping_phone: '+919812345678',
          guest_token_hash: null,
          reservation_expires_at: new Date(Date.now() + 15 * 60 * 1000), // Active 15m window
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'e0000000-0000-4000-8000-000000000003',
          user_id: null, // Guest order
          order_status: 'DELIVERED',
          total_cost_paise: 380000, // ₹3,800.00
          shipping_fee_paise: 0,
          shipping_full_name: 'Rohan Verma',
          shipping_address_line1: '14/B Lavelle Road',
          shipping_city: 'Bengaluru',
          shipping_state: 'Karnataka',
          shipping_pincode: '560001',
          shipping_phone: '+919988776655',
          guest_token_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA-256 test hash
          reservation_expires_at: new Date('2026-01-02T00:15:00Z'),
          created_at: new Date('2026-01-02T00:00:00Z'),
          updated_at: new Date('2026-01-05T12:00:00Z'),
        },
      ];

      await queryInterface.bulkInsert('orders', orders, { transaction });

      const orderItems = [
        {
          id: 'f0000000-0000-4000-8000-000000000001',
          order_id: 'e0000000-0000-4000-8000-000000000001',
          product_id: 'd0000000-0000-4000-8000-000000000002',
          product_name_snapshot: 'Minimalist Silk Evening Shirt',
          quantity: 1,
          unit_price_paise: 849900,
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'f0000000-0000-4000-8000-000000000002',
          order_id: 'e0000000-0000-4000-8000-000000000002',
          product_id: 'd0000000-0000-4000-8000-000000000007',
          product_name_snapshot: 'Artisanal Ceramic Vessel',
          quantity: 1,
          unit_price_paise: 420000,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'f0000000-0000-4000-8000-000000000003',
          order_id: 'e0000000-0000-4000-8000-000000000003',
          product_id: 'd0000000-0000-4000-8000-000000000008',
          product_name_snapshot: 'Cashmere Ribbed Knit Beanie',
          quantity: 1,
          unit_price_paise: 380000,
          created_at: new Date('2026-01-02T00:00:00Z'),
          updated_at: new Date('2026-01-02T00:00:00Z'),
        },
      ];

      await queryInterface.bulkInsert('order_items', orderItems, { transaction });

      const paymentAttempts = [
        {
          id: 'a1000000-0000-4000-8000-000000000001',
          order_id: 'e0000000-0000-4000-8000-000000000001',
          attempt_number: 1,
          razorpay_order_id: 'order_test_fixture_001',
          razorpay_payment_id: 'pay_test_fixture_001',
          razorpay_refund_id: null,
          status: 'SUCCESS',
          failure_reason: null,
          amount_paise: 849900,
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:05:00Z'),
        },
        {
          id: 'a1000000-0000-4000-8000-000000000002',
          order_id: 'e0000000-0000-4000-8000-000000000002',
          attempt_number: 1,
          razorpay_order_id: 'order_test_fixture_002',
          razorpay_payment_id: null,
          razorpay_refund_id: null,
          status: 'INITIATED',
          failure_reason: null,
          amount_paise: 420000,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      await queryInterface.bulkInsert('payment_attempts', paymentAttempts, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.bulkDelete(
        'payment_attempts',
        {
          id: ['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002'],
        },
        { transaction }
      );
      await queryInterface.bulkDelete(
        'order_items',
        {
          id: [
            'f0000000-0000-4000-8000-000000000001',
            'f0000000-0000-4000-8000-000000000002',
            'f0000000-0000-4000-8000-000000000003',
          ],
        },
        { transaction }
      );
      await queryInterface.bulkDelete(
        'orders',
        {
          id: [
            'e0000000-0000-4000-8000-000000000001',
            'e0000000-0000-4000-8000-000000000002',
            'e0000000-0000-4000-8000-000000000003',
          ],
        },
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
