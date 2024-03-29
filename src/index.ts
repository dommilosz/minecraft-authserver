import {sendJSON} from "express-wsutils";
import rateLimit from 'express-rate-limit'
import express, {json} from 'express'
import {Account, AccountsStorage, CrackedAuth, MicrosoftAuth, MojangAuth} from "minecraft-auth";
import configured from "configuredjs";

export const config = configured({
    path: "config.json", writeMissing: true, defaultConfig: {
        port: 8080,
        rateLimits: {
            window: 15 * 60,
            limit: 30
        },
        fileLocation: "local",
        password: "root",
        ms: {
            appID: "",
            appSecret: "",
            redirectUrl: "",
        }
    }
})

import {readJSON, writeJSON} from "./fileSystem";
import {securedRoutes} from "./accountManager";
import * as Crypto from "crypto";


MicrosoftAuth.setup({
    appID: config.ms.appID,
    redirectURL: config.ms.redirectUrl,
    appSecret: config.ms.appSecret
});

const app = express()
export let accStore = new AccountsStorage();
let _validTokens: { [key: string]: { uuid: string, accessToken: string } };

function createHash(input: string) {
    return Crypto.createHash('sha256').update(input).digest('base64');
}

function getValidTokens(accessToken: string) {
    return _validTokens[createHash(accessToken)];
}

async function setValidTokens(accessToken: string, value: { uuid: string; accessToken: string }) {
    _validTokens[createHash(accessToken)] = value;
    await writeJSON('authserver-tokens.json', _validTokens);
}

readJSON("authserver-tokens.json").then(data => {
    _validTokens = data;
    deserialize().then(() => {
        app.listen(config.port, () => {
            console.log(`App listening on port ${config.port}`)
        })
    })
});

export async function deserialize() {
    let data = await readJSON("authserver-accounts.json");
    if (data.length < 1) return;
    accStore = AccountsStorage.deserialize(JSON.stringify(data.accounts ?? []));
}

export async function serialize() {
    let data = accStore.serialize();
    await writeJSON("authserver-accounts.json", {accounts: JSON.parse(data)});
}

export function findAccountByUsername(username: string): Account | undefined {
    let matching: Account | undefined = undefined;
    accStore.accountList.forEach((el: Account) => {
        if (el.properties.authserver_username) {
            if (el.properties.authserver_username === username) {
                matching = el;
            }
        }
    })
    return matching;
}

const limiter = rateLimit({
    windowMs: config.rateLimits.window * 1000, // 15 minutes
    max: config.rateLimits.limit, // Limit each IP to 30 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

app.use(json({limit: '50mb'}));

app.use("/authenticate",limiter);
app.use("/validate",limiter);
app.use("/refresh",limiter);

app.post("/authenticate", async (req, res) => {
    if (!req.header("Content-Type")?.toLowerCase()?.includes("application/json")) {
        await sendJSON(res, {
            "error": "Unsupported Media Type",
            "errorMessage": "The server is refusing to service the request because the entity of the request is in a format not supported by the requested resource for the requested method"
        }, 415)
        return;
    }
    let body = req.body;
    if (!body.username || !body.password) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "credentials is null"}, 403)
        return;
    }

    let account: Account | undefined = findAccountByUsername(body.username);
    if (!account || (account.properties.authserver_password != body.password && !account.properties.alternative_passwords.includes(body.password))) {
        await sendJSON(res, {
            "error": "ForbiddenOperationException",
            "errorMessage": "Invalid credentials. Invalid username or password."
        }, 403)
        return;
    }

    let clientToken = body.clientToken;
    if (account.type === "mojang") {
        // @ts-ignore
        let pacc: MojangAccount = account;
        await pacc.use();
        if (!clientToken)
            clientToken = pacc.clientToken;
    }
    if (account.type === "microsoft") {
        // @ts-ignore
        let pacc: MicrosoftAccount = account;
        if (!clientToken)
            clientToken = CrackedAuth.uuid(account.properties.authserver_password + ";" + account.properties.authserver_username);
        await pacc.use();
    }

    await account.getProfile();

    if(!account.accessToken || !account.uuid){
        await sendJSON(res, {"error": "Account doesn't have required data", "errorMessage": "Access token or uuid is null"}, 403)
        return;
    }

    await setValidTokens(account.accessToken, {uuid: account.uuid, accessToken: account.accessToken});
    await sendJSON(res, {
        "user": {
            "username": body.username,
            "properties": [
                {
                    "name": "preferredLanguage",
                    "value": "en-us"
                },
                {
                    "name": "registrationCountry",
                    "value": "country"
                }
            ],
            "id": account.uuid
        },
        "clientToken": clientToken,
        "accessToken": account.accessToken,
        "availableProfiles": [
            {
                "name": account.username,
                "id": account.uuid
            }
        ],
        "selectedProfile": {
            "name": account.username,
            "id": account.uuid
        }
    }, 200)
    await serialize();
})

app.post("/validate", async (req, res) => {
    if (!req.header("Content-Type")?.toLowerCase()?.includes("application/json")) {
        await sendJSON(res, {
            "error": "Unsupported Media Type",
            "errorMessage": "The server is refusing to service the request because the entity of the request is in a format not supported by the requested resource for the requested method"
        }, 415)
        return;
    }
    let body = req.body;
    if (!body.accessToken) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "accessToken is null"}, 403)
        return;
    }

    if (!await MojangAuth.validateToken(body.accessToken)) {
        await sendJSON(res, {
            "error": "ForbiddenOperationException",
            "errorMessage": "Invalid accessToken."
        }, 403)
        return;
    }

    await sendJSON(res, undefined, 200)
})

app.post("/refresh", async (req, res) => {
    if (!req.header("Content-Type")?.toLowerCase()?.includes("application/json")) {
        await sendJSON(res, {
            "error": "Unsupported Media Type",
            "errorMessage": "The server is refusing to service the request because the entity of the request is in a format not supported by the requested resource for the requested method"
        }, 415)
        return;
    }
    let body = req.body;
    if (!body.accessToken) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "accessToken is null"}, 403)
        return;
    }
    if (!body.clientToken) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "clientToken is null"}, 403)
        return;
    }

    let valid = false;
    let _account: Account | undefined;

    let validToken = getValidTokens(body.accessToken)

    if (validToken) {
        valid = true;
        _account = accStore.getAccountByUUID(validToken.uuid);
    }

    let clientToken = body.clientToken;
    if (_account?.type === "mojang") {
        // @ts-ignore
        let pacc: MojangAccount = _account;
        await pacc.use();
        if (!clientToken)
            clientToken = pacc.clientToken;
    }
    if (_account?.type === "microsoft") {
        // @ts-ignore
        let pacc: MicrosoftAccount = _account;
        if (!clientToken)
            clientToken = CrackedAuth.uuid(_account.properties.authserver_password + ";" + _account.properties.authserver_username);
        await pacc.use();
    }
    if (!valid) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "accessToken is invalid"}, 403)
        return;
    }
    if (!_account) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "Account is undefined"}, 403)
        return;
    }

    await _account?.getProfile();

    if(!_account.accessToken || !_account.uuid){
        await sendJSON(res, {"error": "Account doesn't have required data", "errorMessage": "Access token or uuid is null"}, 403)
        return;
    }

    await setValidTokens(_account.accessToken, {uuid: _account.uuid, accessToken: _account.accessToken})

    await sendJSON(res, {
        "user": {
            "username": body.username,
            "properties": [
                {
                    "name": "preferredLanguage",
                    "value": "en-us"
                },
                {
                    "name": "registrationCountry",
                    "value": "country"
                }
            ],
            "id": _account.uuid
        },
        "clientToken": clientToken,
        "accessToken": _account.accessToken,
        "availableProfiles": [
            {
                "name": _account.username,
                "id": _account.uuid
            }
        ],
        "selectedProfile": {
            "name": _account.username,
            "id": _account.uuid
        }
    }, 200)

    await sendJSON(res, undefined, 200)
})

app.get("/code", async (req, res) => {
    res.write(req.url.split("?code=")[1]);
    res.end();
})


app.use(securedRoutes);
