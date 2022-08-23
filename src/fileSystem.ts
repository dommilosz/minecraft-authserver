import {config} from "./index";

let fs: any;
let firebase: any;

let localMode = config.fileLocation === 'local';

if (localMode) {
    fs = require('fs');
} else {
    firebase = require('./firebase');
}

export async function writeJSON(path: string, data: any) {
    if (localMode) {
        fs.writeFileSync(path, JSON.stringify(data), {encoding: "utf-8"});
    } else {
        try {
            path = path.replace(".","_");
            let ref = firebase.realtime_db.ref(`data/${path}`);
            await ref.set(data);
        } catch (e) {
            console.error(e);
            return {}
        }
    }
}

export async function readJSON<T = any>(path: string): Promise<T | {}> {
    if (localMode) {
        if (!fs.existsSync(path)) return {};
        try {
            return JSON.parse(fs.readFileSync(path));
        } catch {
            return {};
        }
    } else {
        try {
            path = path.replace(".","_");
            let ref = firebase.realtime_db.ref(`data/${path}`);
            let snapshot = await ref.once('value');
            if (snapshot.exists()) {
                return snapshot.val();
            }
        } catch {
            return {}
        }
    }
    return {};
}
