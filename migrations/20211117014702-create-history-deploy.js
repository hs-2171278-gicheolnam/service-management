'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('history_deploys', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      groupId: {
        type: Sequelize.STRING
      },
      deployTime: {
        type: Sequelize.STRING
      },
      user: {
        type: Sequelize.STRING
      },
      result: {
        type: Sequelize.STRING
      },
      service: {
        type: Sequelize.STRING
      },
      deployId: {
        type: Sequelize.STRING
      },
      deployEndTime: {
        type: Sequelize.STRING
      },
      deployType: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('history_deploys');
  }
};