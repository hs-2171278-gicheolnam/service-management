const { Deploy, HistoryDeploy } = require("../models");

export default {
  newDeploy: async (deploy) => {
    try {
        let registerDep = await Deploy.create(deploy);
        return {
            status: "success",
            deploy: registerDep
        }
    } catch (e) {
        return {
            status: "error",
            message: "에러가 발생하였습니다."
        }
    }
  }, 
  findDeploy: async (groupId) => {
      return await Deploy.findAll({where: {groupId: groupId}})
  },
  findExistDeploy: async (groupId, deploy_type) => {
      return await Deploy.findOne({where: {groupId: groupId, deploy_type: deploy_type}})
  },
  updateDeploy:  async (deploy) => {
      await Deploy.update({
          deploy_json: deploy.deploy_json
      }, {
          where: {
              groupId: deploy.groupId,
              deploy_type: deploy.deploy_type
          }
      })
  },
  removeDeploy: async () => {
      await Deploy.destroy({where: {groupId: "1"}})
  },
  newDeployHistory: async (history) => {
    try {
      let registerHst = await HistoryDeploy.create(history);
      return {
        status: "success",
        deployHistory: registerHst,
      };
    } catch (e) {
      return {
        status: "error",
        message: "에러가 발생하였습니다.",
      };
    }
  },
  updateDeployHistoryStatus : async (taskId, status) => {
    await HistoryDeploy.update({
        result: status
    }, {
        where: {
          deployId : taskId
        }
    })
  },
  findDeployHistory: async (groupId) => {
    try {
      return await HistoryDeploy.findAll({
        where: { groupId: groupId },
        order: [
          ["deployTime", "DESC"],
          ["id", "DESC"],
        ],
      }); 
    } catch (e){
      return {
        status: "error",
        message: e,
      };
    }
  },
  removeDeployHistory: async () => {
    await HistoryDeploy.destroy();
  },
};
