'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.dropTable(
      'deploy_history'
    );
  }
};