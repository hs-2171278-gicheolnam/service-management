const { Sequelize, sequelize, Services, Variable, ShareService} = require("../models")
import ServerService from "./ServerService"
import FileUtil from "../utils/FileUtil"
import DockerClient from "../utils/DockerClient"
import SshClient from '../utils/SshClient'
const ScheduleService = require('./ScheduleService')
const dockerDefaultPort = process.env.docker_default_api||2375

let sync = {}
const GroupSvcService = {
    async findServiceById(id) {
        const regService = await Services.findOne({
            where: { id }
        })

        const variables = await Variable.findAll({
            where: {serviceId: id}
        })
        return {
            ...regService.dataValues,
            variables: variables.filter(variable => variable['type'] === 'container'),
            logFiles: variables.filter(variable => variable['type'] === 'process'),
        }
    },
    async findServiceByGroupId(groupId) {
        return await Services.findAll({
            where: { groupId },
            attributes: {
                include: [
                    [
                        sequelize.literal(`(
                            SELECT name
                              FROM servers a
                             WHERE a.id = service.serverId
                        )`),
                        "server_name"
                    ]
                ]
            }
        })
    },
    async addService(groupId, reqService) {
        let service = {}
        let regService = {}
        try {
            regService = await Services.create({
                name: reqService['name'], groupId,
                serverId: reqService['server'],
                type: reqService['type'],
                isSchedule: false,
                cron: reqService['cron'],
                yaml: reqService['type'] === 'container' ? reqService['yaml'] : "",
                pidCmd: reqService['type'] === 'process' ? reqService['pidCmd'] : "",
                startScript: reqService['type'] === 'process' ? reqService['startScript'] : "",
                stopScript:  reqService['type'] === 'process' ? reqService['stopScript'] : "",
            })
            service = regService['dataValues']
            service['variables'] = []
            service['logFiles'] = []

            const id = String(regService['id'])
            const type = reqService['type']
            const variables = type === 'container' ? reqService['variables'] : reqService['logFiles']
            const yaml = reqService['yaml'];

            if ((await Variable.count({ where: { serviceId: id } })) > 0) {
                await Variable.destroy({ where: { serviceId: id } })
            }
            await this.appendVariables({serviceId: id, type: type, variables: variables})

            const dockerComposeServicePath = await FileUtil.getDockerComposeServicePath({
                groupId: groupId,
                serviceId: id
            })
            await FileUtil.cleanDockerComposeFile(dockerComposeServicePath)

            if (type === 'container') {
                await FileUtil.writeDockerCompose({dockerComposeServicePath, yaml, variables})
            } else if (type === 'process') {
                // TODO 프로세스 처리 필요시 사용.
            }
        } catch (err) {
            console.error('err', err)
            if (regService['id']) {
                await Services.destroy({where: { id: regService['id']}})
                await Variable.destroy({ where: { serviceId: regService['id'] } })
            }

            throw err
        }
        return service;
    },
    async editService(user, id, reqService) {
        const registryService = await Services.findOne({
            where: { id }
        })

        await Services.update({
            name: reqService['name'],
            serverId: reqService['server'],
            type: reqService['type'],
            isSchedule: Boolean(reqService['isSchedule']),
            cron: reqService['cron'],
            yaml: reqService['type'] === 'container' ? reqService['yaml'] : "",
            pidCmd: reqService['type'] === 'process' ? reqService['pidCmd'] : "",
            startScript: reqService['type'] === 'process' ? reqService['startScript'] : "",
            stopScript:  reqService['type'] === 'process' ? reqService['stopScript'] : "",
        }, {
            where: { id }
        })
        const variables = reqService['type'] === 'container' ? reqService['variables'] : reqService['logFiles']
        const yaml = reqService['yaml'];

        await Variable.destroy({ where: { serviceId: id } })
        await this.appendVariables({serviceId: id, type: reqService['type'], variables: variables})


        const regService = await this.findServiceById(id)
        const groupId = regService['groupId']
        const type = reqService['type']

        const dockerComposeServicePath = await FileUtil.getDockerComposeServicePath({groupId: groupId, serviceId: id})
        await FileUtil.cleanDockerComposeFile(dockerComposeServicePath)

        if (type === 'container') {
            await FileUtil.writeDockerCompose({dockerComposeServicePath, yaml, variables})
        } else if (type === 'process') {
            // TODO 프로세스 처리 필요시 사용.
        }

        // 스케줄 주기 변경
        if (regService['isSchedule']) {
            if (registryService['cron'] !== reqService['cron']) {
                // 기존 스케줄 제거
                ScheduleService.cancelJob(`${groupId}_${id}`)

                // 신규 스케줄 등록
                ScheduleService.createJob(`${groupId}_${id}`, reqService['cron'], regService)
            }
        }

        return {
            ...reqService
        }
    },
    async appendVariables({serviceId, type, variables}){
        let tmp = []
        const variableSize = variables.length
        for (let i = 0; i < variableSize; i++) {
            tmp.push((await Variable.create({
                serviceId: serviceId,
                key: variables[i]['key'],
                value: variables[i]['value'],
                type: type,
            }))['dataValues'])
        }
        return tmp
    },
    async removeService(groupId, serviceId) {
        let regService = await this.findServiceById(serviceId)
        if (String(regService['groupId']) === String(groupId)) {
            const dockerComposeFilePath = await FileUtil.getDockerComposeServicePath({
                groupId: groupId,
                serviceId: serviceId
            })
            await FileUtil.cleanDockerComposeFile(dockerComposeFilePath)

            await Variable.destroy({ where: { serviceId: serviceId } })
            await Services.destroy({ where: { id: serviceId } })

            await ScheduleService.cancelJob(`${groupId}_${serviceId}`)
            return regService
        } else {
            return await ShareService.destroy({where: { serviceId: serviceId, toGroupId: groupId }})
        }
    },
    async getState(groupId, serviceId) {
        let result = {}
        const service = await this.findServiceById(serviceId)

        if (!service['serverId'] || Number(service['serverId']) < 0) {
            return result
        }

        result['shared'] = service['groupId'] !== groupId
        groupId = service['groupId']

        const server = await ServerService.findServerById(service['serverId'])

        if(service['type'] === 'container') {
            result['type'] = "container"
            result['services'] = await FileUtil.getServiceNameList({groupId, serviceId})
            const ip = server['ip']
            const port = server['dockerPort']
            const servicePath = await FileUtil.getDockerComposeServicePath({groupId, serviceId})
            const dockerClient = new DockerClient(ip, port||dockerDefaultPort, servicePath)
            const containerIds = await dockerClient.getContainerIds()

            let containerInfoList = []
            for (let i = 0; i < containerIds.length; i++) {
                try {
                    containerInfoList.push({
                        id: containerIds[i],
                        inspect: await dockerClient.inspect(containerIds[i].substring(0, 12)),
                        stats: await dockerClient.stats(containerIds[i].substring(0, 12))
                    })
                } catch(err) {
                    containerInfoList.push({
                        id: containerIds[i],
                        error: err
                    })
                }
            }
            result['containers'] = containerInfoList
        } else if (service['type'] === 'process') {
            result['type'] = "process"

            const sshClient = new SshClient( server['ip'], server['port'], server['user'], server['password'])
            const pidResult = await sshClient.exec(service['pidCmd'], {})
            const pid = pidResult.join("").replace("\n", "")

            if (/[^0-9]+/.test(pid)) {
                throw new Error("PID Not Found Error. pid: " + String(pid||""))
            }
            result['pid'] = pid
            if (pid !== "") {
                let tmpPs = (await sshClient.exec(`ps -p ${pid} -o %cpu,%mem,lstart|tail -n 1`)).join("")
                if (!tmpPs.includes("%CPU") || !tmpPs.includes("%MEM")) {
                    let tmpPsArr = tmpPs.split(" ").filter(p => p.length !== 0)
                    result['cpuUsage'] = tmpPsArr[0]
                    result['memUsage'] = tmpPsArr[1]
                    result['startTime'] = tmpPs.replace(tmpPsArr[0], "").replace(tmpPsArr[1], "").trim()
                } else {
                    result['cpuUsage'] = ""
                    result['memUsage'] = ""
                    result['startTime'] = ""
                }
                result['stat'] = (await sshClient.exec(`cat /proc/${pid}/stat`)).join("").trim().split(" ")
                result['ports'] = (await sshClient.exec(`netstat -tnlp|grep ${pid}/|awk '{print $4}'`))
                result['exeCwd'] = (await sshClient.exec(`readlink /proc/${pid}/cwd && cat /proc/${pid}/cmdline | sed -e "s/\\x00/ /g"; echo`))
                try {
                    for (let i = 0; i < result['ports'].length; i++) {
                        result['ports'][i] = result['ports'][i].replace(/[a-z,()-]/gi, "").trim()
                    }
                } catch (e) {
                    console.log("parse error", e)
                }
            }
        }

        return result
    },
    async startServices(user, groupId, serviceId) {
        const syncKey = `${groupId}_${serviceId}`
        if (sync[syncKey]) {
            return sync[syncKey]
        } else {
            sync[syncKey] = {
                start: new Date().getTime(),
                action: "start",
                user: user
            }
        }

        try {
            let result = {}

            const service = await this.findServiceById(serviceId)

            if (!service['serverId'] || Number(service['serverId']) < 0) {
                return result
            }
            groupId = service['groupId']
            const server = await ServerService.findServerById(service['serverId'])

            if(service['type'] === 'container') {
                const ip = server['ip']
                const port = server['dockerPort']||dockerDefaultPort
                const servicePath = await FileUtil.getDockerComposeServicePath({groupId, serviceId})
                const dockerClient = new DockerClient(ip, port, servicePath)
                result = await dockerClient.dockerCompose("upAll")
            } else if (service['type'] === 'process') {
                const sshClient = new SshClient( server['ip'], server['port'], server['user'], server['password'])
                result = await sshClient.exec(service['startScript'], {})
            }
        } catch (err) {
            let errMsh = ""
            try {
                errMsh = JSON.stringify(err)
            } catch (err2) {
                errMsh = err
            }
            throw new Error(errMsh)
        } finally {
            delete sync[syncKey]
        }
    },
    async stopServices(user, groupId, serviceId) {
        const syncKey = `${groupId}_${serviceId}`
        if (sync[syncKey]) {
            return sync[syncKey]
        } else {
            sync[syncKey] = {
                start: new Date().getTime(),
                action: "stop",
                user: user
            }
        }

        try {
            let result = {}
            const service = await this.findServiceById(serviceId)

            if (!service['serverId'] || Number(service['serverId']) < 0) {
                return result
            }
            groupId = service['groupId']
            const server = await ServerService.findServerById(service['serverId'])

            if(service['type'] === 'container') {
                const ip = server['ip']
                const port = server['dockerPort']
                const servicePath = await FileUtil.getDockerComposeServicePath({groupId, serviceId})
                const dockerClient = new DockerClient(ip, port||dockerDefaultPort, servicePath)
                result = await dockerClient.dockerCompose("down")
            } else if (service['type'] === 'process') {
                const sshClient = new SshClient( server['ip'], server['port'], server['user'], server['password'])
                result = await sshClient.exec(service['stopScript'], {})
            }
        } catch (err) {
            let errMsh = ""
            try {
                errMsh = JSON.stringify(err)
            } catch (err2) {
                errMsh = err
            }
            throw new Error(errMsh)
        } finally {
            delete sync[syncKey]
        }
    },
    async updateServices(user, groupId, serviceId) {
        const syncKey = `${groupId}_${serviceId}`
        if (sync[syncKey]) {
            return sync[syncKey]
        } else {
            sync[syncKey] = {
                start: new Date().getTime(),
                action: "update",
                user: user
            }
        }

        try {
            let result = {}
            const service = await this.findServiceById(serviceId)

            if (!service['serverId'] || Number(service['serverId']) < 0) {
                return result
            }
            groupId = service['groupId']
            const server = await ServerService.findServerById(service['serverId'])

            if(service['type'] === 'container') {
                const ip = server['ip']
                const port = server['dockerPort']
                const servicePath = await FileUtil.getDockerComposeServicePath({groupId, serviceId})
                const dockerClient = new DockerClient(ip, port||dockerDefaultPort, servicePath)
                result['pullAll'] = await dockerClient.dockerCompose("pullAll")
                result['down'] = await dockerClient.dockerCompose("down")
                result['upAll'] = await dockerClient.dockerCompose("upAll")
            } else {
                result["message"] = "Not Supported.";
            }
        } catch (err) {
            let errMsh = ""
            try {
                errMsh = JSON.stringify(err)
            } catch (err2) {
                errMsh = err
            }
            throw new Error(errMsh)
        } finally {
            delete sync[syncKey]
        }
    },
    async findServiceHealth(services) {
        let results = []
        for (let i = 0; i < services.length; i++) {
            try {
                const service = Object.assign({}, services[i]['dataValues'])
                const serviceId = service['id']
                const serverId = service['serverId']
                const type = service['type']

                if (!serverId || serverId === '-1') {
                    continue
                }

                const serverInfo = await ServerService.findServerById(serverId)

                if (type === 'container') {
                    const serviceNames = await FileUtil.getServiceNameList({groupId: service['groupId'], serviceId})

                    const servicePath = await FileUtil.getDockerComposeServicePath({groupId: service['groupId'], serviceId})
                    const client = new DockerClient(serverInfo['ip'], serverInfo['dockerPort']||dockerDefaultPort, servicePath)
                    const containerIds = await client.getContainerIds()
                    let stats = {}
                    for (let j = 0; j < containerIds.length; j++ ) {
                        try {
                            const containerId = containerIds[j].substring(0, 12)
                            stats[containerId] = await client.stats(containerId)
                        } catch (e) {
                            console.log("stopped container")
                        }
                    }

                    results.push({
                        ...service,
                        health: {
                            serviceNames: serviceNames,
                            stats: stats
                        }
                    })
                } else if (type === 'process') {
                    const sshClient = new SshClient( serverInfo['ip'], serverInfo['port'], serverInfo['user'], serverInfo['password'])
                    const pidResult = await sshClient.exec(service['pidCmd'], {})
                    const pid = pidResult.join("").replace("\n", "")

                    if (/[^0-9]+/.test(pid) || pid === "") {
                        results.push({
                            ...service,
                            health: {
                                running: false,
                                stats: {}
                            }
                        })
                    } else {

                        let tmpPs = (await sshClient.exec(`ps -p ${pid} -o %cpu,%mem,lstart|tail -n 1`)).join("")
                        if (!tmpPs.includes("%CPU") || !tmpPs.includes("%MEM")) {
                            const tmpPsArr = tmpPs.split(" ").filter(p => p.length !== 0)
                            results.push({
                                ...service,
                                health: {
                                    running: true,
                                    stats: {
                                        cpuUsage: tmpPsArr[0]||"",
                                        memUsage: tmpPsArr[1]||"",
                                    }
                                }
                            })
                        }
                    }
                } else {
                    // ignore
                }
            } catch (err) {
                console.log("조회 실패.", err)
            }
        }
        return results
    },
    async shareServices(serviceId, fromGroupId, toGroupIds) {
        let results = []
        const size = toGroupIds.length
        for (let i = 0; i <size; i++) {
            const cnt = await ShareService.count({
                where: {
                    serviceId: serviceId,
                    fromGroupId: fromGroupId,
                    toGroupId: toGroupIds[i]
                }
            })
            if (cnt === 0) {
                results.push(await ShareService.create({
                    serviceId: serviceId,
                    fromGroupId: fromGroupId,
                    toGroupId: toGroupIds[i]
                }))
            }
        }
        return results
    },
    async findShareServiceByGroupId(groupId) {
        let results = []
        const share = await ShareService.findAll({
            where: {
                toGroupId: groupId
            }
        })

        const services = await this.findServiceByGroupId(groupId)
        const shareSvcIds = share.filter(svc => !services.find(s => s['id'] === svc['id'])).map(svc => svc['serviceId'])

        if (shareSvcIds.length > 0) {
            results = await Services.findAll({
                where: {
                    id: {
                        [Sequelize.Op.in]: shareSvcIds
                    }
                },
                attributes: {
                    include: [
                        [
                            sequelize.literal(`(
                            SELECT name
                              FROM servers a
                             WHERE a.id = service.serverId
                        )`),
                            "server_name"
                        ]
                    ]
                }
            })
        }
        return results
    },
    async editSchedule(id, groupId, schedule) {
        // const service = await this.findServiceById(id)
        const service = await Services.findOne({where: { id: id, groupId: groupId }})

        if (schedule === 'true') {
            ScheduleService.createJob(`${groupId}_${id}`, service['cron'], service['dataValues'])
        } else {
            ScheduleService.cancelJob(`${groupId}_${id}`)
        }

        await Services.update({ isSchedule: schedule === "true" }, {
            where: { id }
        })
    }
}
export default GroupSvcService
