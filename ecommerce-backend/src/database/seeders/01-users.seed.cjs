'use strict';

/**
 * Seeder 01: Users Seed
 * Deterministic test accounts with valid hex UUIDs and development credentials.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const passwordHash = '$2b$12$K8yQd1v4p7Qp6M9Jz0W9uuG8yP6Qp5M9Jz0W9uuG8yP6Qp5M9Jz0W';

    const users = [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        email: 'admin@nexora.local',
        password_hash: passwordHash,
        role: 'admin',
        full_name: 'Nexora System Administrator',
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'c0000000-0000-4000-8000-000000000001',
        email: 'customer1@nexora.local',
        password_hash: passwordHash,
        role: 'customer',
        full_name: 'Aarav Mehta',
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'c0000000-0000-4000-8000-000000000002',
        email: 'customer2@nexora.local',
        password_hash: passwordHash,
        role: 'customer',
        full_name: 'Diya Sharma',
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    await queryInterface.bulkInsert('users', users, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', {
      id: [
        'a0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000002',
      ],
    });
  },
};
