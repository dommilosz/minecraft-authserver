async function fetchAccounts() {
    let accountsRaw = await fetch("/secure/authserver-rawAccounts");
    let accounts = await accountsRaw.json();

    let accountsDiv = document.querySelector("#accountsContainer");
    accountsDiv.innerHTML = accounts.map((acc => {
        return `<div class="account" onclick="openAccount('${acc.properties?.authserver_username}')">
            <div class="account_type_container">
                <div class="account_icon ${acc.type}_icon"></div>
                <span>${acc.type}</span>
            </div>
            <div class="account_props">
                <span>${acc.properties?.authserver_username ?? acc.username}</span><br/>
            </div>
        </div>`
    })) + `<div id="add_account" class="account" onclick="openIframe('/secure/authserver/add')">+</div>`
}

let selectedAccountType = '';
function changeAccountType(type){
    selectedAccountType = type;
    document.querySelectorAll("#creator > .acc_prop").forEach(el=>el.style.display = 'none');
    document.querySelectorAll(`#creator > .acc_prop.${type}`).forEach(el=>el.style.display = 'flex');
    document.querySelectorAll("#creator > .acc_prop.all").forEach(el=>el.style.display = 'flex');
}

async function addAccountDOM(){
    let json = {};
    let props = document.querySelectorAll(".acc_prop");
    props.forEach(el => {
        json[el.id] = el.value;
    })
    return await addAccount(selectedAccountType,json);
}

async function addAccount(type,props){
    let body = props;
    body["type"]=type;

    let resp = await (await fetch('/secure/authserver-addAccount', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();

    if (resp.error&&resp.errorMessage){
        alert(resp.error+"\n"+resp.errorMessage)
    }else
    if (resp.error&&resp.message){
        alert(resp.error+"\n"+resp.message)
    }else{
        alert("success");
    }
}

function openIframe(url){
    if(url === ''){
        document.querySelector("#iframe").src = url;
        document.querySelector("#iframe_container").style.display = 'none';
        return;
    }
    document.querySelector("#iframe").src = url;
    document.querySelector("#iframe_container").style.display = 'block';
}

async function accountActionUse(username){
    let body = {
        code_username:username,
        action:"use"
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function accountActionRefresh(username){
    let body = {
        code_username:username,
        action:"refresh"
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function accountActionLogin(username){
    let body = {
        code_username:username,
        action:"login",
        username:prompt("username"),
        password:prompt("password"),
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function accountActionAuthFlow(username){
    let body = {
        code_username:username,
        action:"authFlow",
        code:prompt("code"),
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function accountActionGetProfile(username){
    let body = {
        code_username:username,
        action:"profile",
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function accountActionOwnership(username){
    let body = {
        code_username:username,
        action:"ownership",
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}
async function accountActionValidateToken(username){
    let body = {
        code_username:username,
        action:"validateToken",
    }
    let resp = await (await fetch('/secure/authserver-accountAction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function deleteAccount(username){
    if(!confirm(`Do you want to remove ${username}?`))return;
    let body = {
        code_username:username,
    }
    let resp = await (await fetch('/secure/authserver-removeAccount', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function editAccount(username){
    let body = {
        code_username:username,
        code_username_new:prompt("new username"),
        code_password_new:prompt("new password"),
    }
    let resp = await (await fetch('/secure/authserver-editAccount', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

async function editAccountAltPasswords(username){
    let body = {
        code_username:username,
        alternative_passwords:prompt("Alt passwords separated by ;").split(";"),
    }
    let resp = await (await fetch('/secure/authserver-editAccount', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    })).json();
    alert(JSON.stringify(resp));
}

function findAccountByUsername(username,accounts) {
    let matching;
    accounts.forEach((el) => {
        if (el.properties.authserver_username) {
            if (el.properties.authserver_username === username) {
                matching = el;
            }
        }
    })
    return matching;
}

function deepStringify(obj,separator,count){
    Object.keys(obj).forEach(key=>{
        if(typeof obj[key] === "object"){
            obj[key] = deepStringify(obj[key]);
        }
    })
    return JSON.stringify(obj,separator,count);
}

async function fetchAccount(){
    let accountsRaw = await fetch("/secure/authserver-rawAccounts");
    let accounts = await accountsRaw.json();

    let actionsDiv = document.querySelector("#actions");
    let dataDiv = document.querySelector("#data");

    let username = location.hash.replace("#",'');

    let account = findAccountByUsername(username,accounts);

    dataDiv.innerText = deepStringify(account,null,2);

    let buttons = [];
    if(account.type==="mojang"||account.type==="microsoft"){
        buttons.push({text:"Use",onClick:()=>accountActionUse(username)})
        buttons.push({text:"Refresh",onClick:()=>accountActionRefresh(username)})
    }
    if(account.type==="mojang"){
        buttons.push({text:"Login",onClick:()=>accountActionLogin(username)})
    }
    if(account.type==="microsoft"){
        buttons.push({text:"AuthFlow",onClick:()=>accountActionAuthFlow(username)})
    }

    buttons.push({text:"GetProfile",onClick:()=>accountActionGetProfile(username)})
    buttons.push({text:"Ownership",onClick:()=>accountActionOwnership(username)})
    buttons.push({text:"Validate",onClick:()=>accountActionValidateToken(username)})

    buttons.push({text:"Edit",onClick:()=>editAccount(username)})
    buttons.push({text:"Remove",onClick:()=>deleteAccount(username)})
    buttons.push({text:"Alt passwords",onClick:()=>editAccountAltPasswords(username)})

    actionsDiv.innerHTML = "";
    buttons.forEach(btn=>{
        let button = document.createElement("button");
        button.onclick = btn.onClick;
        button.innerHTML = btn.text;
        actionsDiv.appendChild(button);
    })
}

function openAccount(username){
    openIframe("/secure/authserver/view#"+username);
}