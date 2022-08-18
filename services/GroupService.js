const { Sequelize, sequelize, Groups, GroupAuth, GroupServer, Services, Variable} = require("../models")
const ScheduleService = require("./ScheduleService")
import FileUtil from "../utils/FileUtil"
import path from "path"

export default {
    async findAll (userId, isAdmin) {
        let where = {}

        if (!isAdmin) {
            where['id'] = {
                [Sequelize.Op.in]: sequelize.literal(`(
                            SELECT groupId
                              FROM group_auths aa
                             WHERE aa.userId = ${userId}
                    )`)
            }
        }

        return await Groups.findAll({
            where,
            attributes: {
                include: [
                    [
                        sequelize.literal(`(
                            SELECT count(*)
                              FROM group_servers a
                             WHERE a.groupId = groups.id
                        )`),
                        "server_count"
                    ],
                    [
                        sequelize.literal(`(
                            SELECT count(*)
                              FROM services b
                             WHERE b.groupId = groups.id
                        )`),
                        "service_count"
                    ],
                    [
                        sequelize.literal(`(
                            SELECT count(*)
                              FROM group_auths c
                             WHERE c.groupId = groups.id
                        )`),
                        "user_count"
                    ]
                ]
            }
        })
    },
    async findByUserId (userId) {
        const groups = await GroupAuth.findAll({
            where: {userId: userId},
            include: [
                {model: Groups}
            ]
        });
        return groups.map(group => group['group'])
    },
    async newGroup ({name, description}) {
        const alreadyGroups = await Groups.findAll({where: {name}})
        if (alreadyGroups.length > 0) {
            return {
                status: "error",
                message: "이미 사용하고있는 그룹이름입니다."
            }
        }
        return {
            status: "success",
            group: await Groups.create({name, description})
        }
    },
    async  findById(groupId) {
        const group = await Groups.findOne({where: {id: groupId}})
        if (group) {
            return {
                status: "success",
                group: group
            }
        } else {
            return {
                status: "error",
                message: "그룹이 없습니다."
            }
        }
    },
    async editGroup(id, { name, description }) {
        try {
            return {
                status: 'success',
                group: await Groups.update({ name, description}, {where: {id}})
            }
        } catch (err) {
            console.error(err)
            return {
                status: 'error',
                message: JSON.stringify(err)
            }
        }
    },
    async removeGroup (id) {
        try {
            const groupPath = path.join(FileUtil.getHomePath(), String(id))
            await FileUtil.deleteFolderRecursive(groupPath)

            const svcList = await Services.findAll({where: {groupId: id}})
            const svcListSize = svcList.length
            for (let i = 0; i < svcListSize; i++) {
                try {
                    await ScheduleService.cancelJob(`${id}_${svcList[i]['id']}`)
                    await Variable.destroy({where: {serviceId: svcList[i]['dataValues']['id']}})
                } catch (err) {
                    console.error("error", err, svcList[i])
                }
            }
            await Services.destroy({where: {groupId: id}})
            await GroupServer.destroy({where: {groupId: id}})
            await GroupAuth.destroy({where: {groupId: id}})
            await Groups.destroy({where: { id }})
            return {
                status: 'success',
                groupId: id
            }
        } catch (err) {
            console.error(err)
            return {
                status: 'error',
                message: JSON.stringify(err)
            }
        }
    },
    async isRead(id, req, res) {
        try {
            const userId = req.session.auth.user.id;
            const admin = req.session.auth.user.admin;
            if (admin) {
                return;
            }
            const result = await GroupAuth.count({where: { userId: userId, groupId: id}});
            if (result === 0) {
                res.statusCode = 403;
                return res.send({
                    status: "fail",
                    message: "접근 권한이 없습니다."
                });
            }
        } catch (error) {
            console.error(error)
            res.statusCode = 403;
            return res.send({
                status: "fail",
                message: "접근 권한이 없습니다."
            });
        }
    }
}