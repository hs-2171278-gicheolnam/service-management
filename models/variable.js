'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class variable extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      variable.belongsTo(models.Services, {foreignKey: "serviceId"})
    }
  };
  variable.init({
    serviceId: DataTypes.STRING,
    key: DataTypes.STRING,
    value: DataTypes.STRING,
    type: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'variable',
  });

  return variable;
};