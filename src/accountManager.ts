import {accStore, config, findAccountByUsername, serialize} from "./index";
import {sendCompletion, sendFile, sendJSON, sendText} from "express-wsutils";
import {Account, MicrosoftAccount, MicrosoftAuth, MojangAccount} from "minecraft-auth";
import {Request, Response, Router} from "express";

import basicAuth from "express-basic-auth";

export let securedRoutes = Router()
if(config.password === 'root'){
    console.warn("Use of default password. Access to web ui will be disabled");
    securedRoutes.use((Request: any, res: Response, next: any)=>{
        sendText(res,"Cannot use default password",401);
    })
}

securedRoutes.use(basicAuth({
    users: { admin: config.password },
    challenge: true // <--- needed to actually show the login dialog!
}));

securedRoutes.post("/authserver-addAccount", async (req:Request, res:Response) => {
    if (!req.header("Content-Type")?.toLowerCase()?.includes("application/json")) {
        await sendJSON(res, {
            "error": "Unsupported Media Type",
            "errorMessage": "The server is refusing to service the request because the entity of the request is in a format not supported by the requested resource for the requested method"
        }, 400)
        return;
    }
    let body = req.body;
    if (!body.type) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "type is null"}, 400)
        return;
    }
    if ((!body.code_username || !body.code_password)) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "code credentials is null"}, 400)
        return;
    }
    if (body.type === "mojang" && (!body.username || !body.password)) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "credentials is null"}, 400)
        return;
    }
    if (body.type === "microsoft" && (!body.code)) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "credentials is null"}, 400)
        return;
    }
    if (body.type === "token" && (!body.token)) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "credentials is null"}, 400)
        return;
    }

    let acc: Account|undefined = findAccountByUsername(body.code_username);
    if (acc) {
        await sendJSON(res, {"error": "ForbiddenOperationException", "errorMessage": "Account already exists."}, 400)
        return;
    }
    let pacc;
    if (body.type === "mojang") {
        pacc = new MojangAccount();
        try {
            await pacc.Login(body.username, body.password, true);
        } catch (e) {
            await sendJSON(res, e, 500)
            return;
        }
    }
    if (body.type === "microsoft") {
        pacc = new MicrosoftAccount();
        try {
            await pacc.authFlow(body.code);
        } catch (e) {
            await sendJSON(res, e, 500)
            return;
        }
    }

    if (body.type === "token") {
        pacc = new Account(body.token, "token");
        if (await pacc.checkValidToken()) {

        } else {
            await sendJSON(res, {
                "error": "ForbiddenOperationException",
                "errorMessage": "Invalid credentials. Invalid token."
            }, 400)
            return;
        }
    }
    
    if(!pacc){
        await sendJSON(res, {"error": "ForbiddenOperationException", "errorMessage": "Account type is invalid."}, 400)
        return;
    }

    pacc.properties.authserver_username = body.code_username;
    pacc.properties.authserver_password = body.code_password;
    await sendCompletion(res, "added!", false, 200);
    accStore.addAccount(pacc);
    await serialize();
})

securedRoutes.post("/authserver-removeAccount", async (req:Request, res:Response) => {
    if (!req.header("Content-Type")?.toLowerCase()?.includes("application/json")) {
        await sendJSON(res, {
            "error": "Unsupported Media Type",
            "errorMessage": "The server is refusing to service the request because the entity of the request is in a format not supported by the requested resource for the requested method"
        }, 400)
        return;
    }
    let body = req.body;
    if ((!body.code_username)) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "code username is null"}, 400)
        return;
    }
    let acc: Account|undefined = findAccountByUsername(body.code_username);
    if (!acc) {
        await sendJSON(res, {"error": "ForbiddenOperationException", "errorMessage": "Account does not exist."}, 400)
        return;
    }
    accStore.deleteAccount(acc);
    await serialize();
    await sendCompletion(res, "removed!", false, 200);
})

securedRoutes.post("/authserver-editAccount", async(req:Request, res:Response) => {
    let acc = await getAccountFromReq(req, res)
    if (!acc) return;
    let body = req.body;

    if (!acc) {
        await sendJSON(res, {"error": "ForbiddenOperationException", "errorMessage": "Account does not exist."}, 400)
        return;
    }

    if ((body.code_username_new)) {
        acc.properties.authserver_username = body.code_username_new;
    }
    if ((body.code_password_new)) {
        acc.properties.authserver_password = body.code_password_new;
    }
    if ((body.alternative_passwords)) {
        acc.properties.alternative_passwords = body.alternative_passwords;
    }

    await serialize();
    await sendCompletion(res, "changed!", false, 200);
})

securedRoutes.post("/authserver-accountAction", async(req:Request, res:Response) => {
    let _acc = await getAccountFromReq(req, res)
    let body = req.body;

    if (!_acc) {
        await sendJSON(res, {"error": "ForbiddenOperationException", "errorMessage": "Account does not exist."}, 400)
        return;
    }
    try {
        if (_acc.type == "mojang") {
            // @ts-ignore
            let acc: MojangAccount = _acc;

            if (body.action == "use") {
                return sendJSON(res, await acc.use(), 200)
            }
            if (body.action == "refresh") {
                return sendJSON(res, await acc.refresh(), 200)
            }
            if (body.action == "login") {
                return sendJSON(res, await acc.Login(body.username, body.password, true), 200);
            }
        }
        if (_acc.type == "microsoft") {
            // @ts-ignore
            let acc: MicrosoftAccount = _acc;

            if (body.action == "use") {
                return sendJSON(res, await acc.use(), 200)
            }
            if (body.action == "refresh") {
                return sendJSON(res, await acc.refresh(), 200)
            }
            if (body.action == "authFlow") {
                if ((!body.code)) {
                    await sendJSON(res, {
                        "error": "IllegalArgumentException",
                        "errorMessage": "credentials is null"
                    }, 400)
                    return;
                }
                return sendJSON(res, await acc.authFlow(body.code), 200);
            }
        }

        if (body.action == "profile") {
            let resp = await _acc.getProfile()
            return sendJSON(res, resp, 200)
        }
        if (body.action == "ownership") {
            let resp = await _acc.checkOwnership()
            return sendJSON(res, resp, 200)
        }
        if (body.action == "validateToken") {
            let resp = await _acc.checkValidToken()
            return sendJSON(res, resp, 200)
        }

    } catch (e:any) {
        await sendText(res, e.message, 500)
        return;
    }

    await serialize();
    await sendCompletion(res, "Nothing changed!", true, 400);
})

securedRoutes.get("/authserver-rawAccounts", async(req:Request, res:Response) => {
    await sendJSON(res, accStore.accountList, 200);
})

securedRoutes.get("/authserver-msUrl", async(req:Request, res:Response) => {
    await sendText(res, MicrosoftAuth.createUrl(), 200);
})

securedRoutes.get("/authserver", async(req:Request, res:Response) => {
    await sendFile(req, res, 'src/accountManager.html', 200)
})
securedRoutes.get("/", async(req:Request, res:Response) => {
    await sendFile(req, res, 'src/accountManager.html', 200)
})

securedRoutes.get("/authserver/add", async(req:Request, res:Response) => {
    await sendFile(req, res, 'src/addAccount.html', 200)
})
securedRoutes.get("/authserver/view", async(req:Request, res:Response) => {
    await sendFile(req, res, 'src/accountView.html', 200)
})


securedRoutes.get("/authserver.js", async(req:Request, res:Response) => {
    await sendFile(req, res, 'src/accountManagerScript.js', 200)
})

export async function getAccountFromReq(req:Request, res:Response): Promise<Account|undefined> {
    if (!req.header("Content-Type")?.toLowerCase()?.includes("application/json")) {
        await sendJSON(res, {
            "error": "Unsupported Media Type",
            "errorMessage": "The server is refusing to service the request because the entity of the request is in a format not supported by the requested resource for the requested method"
        }, 400)
        return undefined;
    }
    let body = req.body;
    if ((!body.code_username)) {
        await sendJSON(res, {"error": "IllegalArgumentException", "errorMessage": "code username is null"}, 400)
        return undefined;
    }
    return findAccountByUsername(body.code_username);
}