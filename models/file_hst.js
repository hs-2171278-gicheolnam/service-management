'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class file_hst extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  };
  file_hst.init({
    userId: DataTypes.STRING,
    fileName: DataTypes.STRING,
    fileSize: DataTypes.STRING,
    phase: DataTypes.STRING,
    path: DataTypes.STRING,
    type: DataTypes.STRING,
    fileKey: DataTypes.STRING,
    checkTime: DataTypes.DATE,
    errorMsg: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'file_hst',
  });
  return file_hst;
};