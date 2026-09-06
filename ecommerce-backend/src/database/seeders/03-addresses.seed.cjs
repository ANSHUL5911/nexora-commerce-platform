'use strict';

/**
 * Seeder 03: Addresses Seed
 * Standardized shipping profiles for seeded customers.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addresses = [
      {
        id: 'c1000000-0000-4000-8000-000000000001',
        user_id: 'c0000000-0000-4000-8000-000000000001',
        full_name: 'Aarav Mehta',
        address_line1: 'Flat 402, Monolith Residences, Altamount Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400026',
        phone: '+919876543210',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'c1000000-0000-4000-8000-000000000002',
        user_id: 'c0000000-0000-4000-8000-000000000002',
        full_name: 'Diya Sharma',
        address_line1: 'Villa 12, Golf Links Enclave',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110003',
        phone: '+919812345678',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    await queryInterface.bulkInsert('addresses', addresses, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('addresses', {
      id: ['c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002'],
    });
  },
};
