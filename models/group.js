'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class group extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      group.hasMany(models.GroupAuth, {foreignKey: "groupId", sourceKey: "id"})
      group.hasMany(models.GroupServer, {foreignKey: "groupId", sourceKey: "id"})
      group.hasMany(models.Services, {foreignKey: "groupId", sourceKey: "id"})
    }
  };
  group.init({
    name: DataTypes.STRING,
    description: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'groups',
  });

  return group;
};