'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('deploys');
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('deploys');
  }
};