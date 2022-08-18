import React from 'react';
import fetch from "isomorphic-unfetch";
import { withSession } from 'next-session';
import AuthService from "../../../../../services/AuthService";
import SettingsService from "../../../../../services/SettingsService";
import UserService from "../../../../../services/UserService";
import JsonUtil from "../../../../../utils/JsonUtil";

async function settingsServices(req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json')
    await AuthService.validate(req, res);

    if (req.session.auth.user.admin === false) {
        res.statusCode = 403;
        return res.send({status: "fail", message: "접근 권한이 없습니다."});
    }

    try {
        const { userId } = req.query
        if (req.method === 'DELETE') {
            return res.send({
                status: "success",
                result: await UserService.removeUser(userId),
            })
        } else if (req.method === 'PUT') {
            const reqUserInfo = JSON.parse(req.body)
            return res.send({
                status: "success",
                result: await UserService.editUser(userId, reqUserInfo),
            })
        }
    } catch (error) {
        console.error(error);
    }
}

export default withSession(settingsServices)