import React from 'react';
import fetch from "isomorphic-unfetch";
import { withSession } from 'next-session';
import AuthService from "../../../../services/AuthService";
import SettingsService from "../../../../services/SettingsService";

import JsonUtil from "../../../../utils/JsonUtil";

async function settingsServices(req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json')
    await AuthService.validate(req, res);

    if (req.session.auth.user.admin === false) {
        res.statusCode = 403;
        return res.send({status: "fail", message: "접근 권한이 없습니다."});
    }

    try {
        if (req.method === 'GET') {
            return res.send({
                status: "success",
                users: await SettingsService.getUsers(),
            })
        }
    } catch (error) {
        console.error(error);
        return res.send({
            status: "error",
            message: "에러가 발생하였습니다."
        })
    }
}

export default withSession(settingsServices)