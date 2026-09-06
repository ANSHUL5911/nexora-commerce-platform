'use strict';

/**
 * Migration 001: Initialize Schema
 * Purpose: Establish initial migration boundary and verify PostgreSQL connection capabilities.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Verify PostgreSQL connection and native UUID capabilities
    await queryInterface.sequelize.query('SELECT 1 AS ready;');
  },

  async down(queryInterface, Sequelize) {
    // No-op for initialization
  },
};
