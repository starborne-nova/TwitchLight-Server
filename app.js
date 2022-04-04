//-------------------------------------------------------------REQUIREMENTS---------------------------------------------------------//
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");
const secret = "<TWITCH SECRET>"
const sha256Hasher = crypto.createHmac("sha256", secret);
const token = "Bearer <TWITCH TOKEN>";
const client = "<TWITCH CLIENT>";
const light = "<EXTENSION AUTH>";
const ejs = require("ejs");
const cookieParser = require('cookie-parser');
const session = require('express-session');
const passport = require('passport');
const SQLiteStore = require('connect-sqlite3')(session);
const mainRouter = require('./routes/main');
const authRouter = require('./routes/auth');
const ensureLogIn = require('connect-ensure-login').ensureLoggedIn;
const ensureLoggedIn = ensureLogIn();
//-------------------------------------------------------------REQUIREMENTS END/ APP VARIABLES---------------------------------------------------------//


//-------------------------------------------------NOTE--------------------------------------------------------//

// {user_id:
//      {
//          name: '',
//          status: false,
//          game: '',
//          ticker: '',
//          profile: '',
//          update: date
//      }
// }
//-------------------------------------------------NOTE--------------------------------------------------------//

const app = express();
const twitchIds = {}
const twitchData = {};
var refreshList = "";
var refreshList2 = "";
var result = 0;

//-------------------------------------------------VARIABLES END/TEMP VARIABLES BEGIN--------------------------------------------------------//


//-------------------------------------------------TEMP VARIABLES END/ EXPRESS SETTINGS---------------------------------------------------------//

const web = axios.create({
    baseURL: 'https://api.twitch.tv/helix/',
    headers: { "Authorization": token, "Client-Id": client }
})

app.set('view engine', 'ejs');
app.locals.pluralize = require('pluralize');
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use('/jquery', express.static(__dirname + '/node_modules/jquery/dist/'));
app.use(express.json());
app.use(cookieParser());
app.use(cors());
app.options('*', cors());

app.use(session({
    secret: 'secret',
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // don't create session until something stored
    store: new SQLiteStore({ db: 'sessions.db', dir: 'var/db' })
  }));
  app.use(passport.authenticate('session'));
  
  app.use('/', authRouter);

const buildData = initData();
const buildNames = setTimeout(initUsernames, 5000);
const initServer = setTimeout(refresh, 10000);
const initProfile = setTimeout(initPFP, 15000);
const autoRefresh = setInterval(refresh, 900000);
const autoRefreshTicker = setInterval(refreshTicker, 900000);

//-------------------------------------------------------------EXPRESS SETTINGS END/ EXPRESS ROUTES---------------------------------------------------------//

app.get("/", function (req, res) {
    console.log(req.body);
    res.status(200).send("Acknowledged");
});

app.get("/admin", ensureLoggedIn, function(req, res){
    web.get("eventsub/subscriptions")
    .then(response=>{
        const subList = response.data.data
        res.render("dashboard", {subList: subList, result: result, user: req.user})
        result = 0;
    })
    
})

app.post("/admin", ensureLoggedIn, function(req, res){
    console.log(req.body)
    web.delete("eventsub/subscriptions?id=" + req.body.deleteID)
    .then(response=>{
        result = response.status;
        res.redirect("/admin")
    })
})

app.post("/admin/add", ensureLoggedIn, function(req,res){
    const sendData = {
        "type": req.body.eventsubType,
        "version": "1",
        "condition": {
            "broadcaster_user_id": req.body.twitchID
        },
        "transport": {
            "method": "webhook",
            "callback": "https://jabroni-server.herokuapp.com/twitchinc",
            "secret": secret
        }
    }
    web.post("eventsub/subscriptions", sendData)
    .then(response=>{
        result = response.status;
        res.redirect("/admin")
    })
})

app.post("/pulse", function (req, res) {
    const extension = req.headers.chrome
    if (extension === light) {
        res.status(200).send([twitchData]);
    }

    else if (extension === undefined) {
        res.status(403).send("Authorization missing or incorrect")
    }
})

app.get("/refresh", function (req, res) {
    refresh(res);
});

app.post("/twitchinc", function (req, res) {

    if (req.body.challenge) {
        console.log(req.body)
        const payload = req.body.challenge
        res.status(200).type(".html").send(payload)
    }

    else if (req.body.subscription.type === "channel.update") {
        console.log(req.body.event)
        const streamer = req.body.event.broadcaster_user_name;

        console.log("Update notification recieved");
        twitchData[streamer].game = req.body.event.category_name;
        twitchData[streamer].ticker = req.body.event.title;
        twitchData[streamer].update = new Date();

        res.status(200).send("Received");
    }

    else if (req.body.subscription.type === "stream.online") {
        console.log(req.body.event)
        const streamer = req.body.event.broadcaster_user_name;

        console.log("Online notification recieved");
        twitchData[streamer].status = true;
        twitchData[streamer].update = new Date();
        res.status(200).send("Received");
    }

    else if (req.body.subscription.type === "stream.offline") {
        console.log(req.body.event)
        const streamer = req.body.event.broadcaster_user_name;

        console.log("Offline notification recieved");
        twitchData[streamer].status = false;
        twitchData[streamer].update = new Date();
        res.status(200).send("Received");
    }

});

app.get("/show-subscriptions", function (req, res) {
    web.get("eventsub/subscriptions")
        .then(function (response) {
            console.log(response.data);
            res.send(response.data);
        })
        .catch(function (e) {
            console.log(e)
        });
});

let port = process.env.PORT;
if (port == null || port == "") {
    port = 3000;
}

app.listen(port, function () {
    console.log("Server successfully started on port " + port);
});

async function refresh(res) {
    web.get(("streams?user_id=" + refreshList))
        .then(function (response) {

            if (Object.keys(response.data).length > 0) {
                const dataIn = {};
                Object.assign(dataIn, response.data.data);

                response.data.data.forEach(obj => {

                    if (twitchData.hasOwnProperty(obj.user_name)) {
                        twitchData[obj.user_name].status = true;
                        twitchData[obj.user_name].game = obj.game_name;
                        twitchData[obj.user_name].ticker = obj.title;

                        console.log("FROM REFRESH: " + obj.user_name + " is live");
                    }
                });

                console.log("FOREACH DONE")

                if (res !== undefined) { res.send(dataIn); }
                return;
            }
            else if (Object.keys(response.data).length === 0) {
                falseSet();

                res.send("No followed streamers are live");
                console.log("REFRESH Data block empty");
            }
        })
        .catch(function (e) {
            console.log(e)
        });
}

async function refreshTicker() {
    web.get(("channels?broadcaster_id=" + refreshList2))
        .then(function (response) {

            console.log(response.data);

            if (response.data.status === 401) {
                refreshToken();
            }

            const dataIn = {};
            Object.assign(dataIn, response.data.data);

            response.data.data.forEach(obj => {
                twitchData[obj.broadcaster_name].ticker = obj.title;
            });
            console.log("Tickers Refreshed")
            console.log(twitchData)
        })
        .catch(function (e) {
            console.log(e)
        });
}

async function initData() {
    let broadcasters = [];
    web.get("eventsub/subscriptions")
        .then(function (response) {
            if (response.data.status === 401) {
                refreshToken();
            }

            for (let index = 0; index < response.data.data.length; index++) {
                if (!broadcasters.includes(response.data.data[index].condition.broadcaster_user_id)) {
                    broadcasters.push(response.data.data[index].condition.broadcaster_user_id)
                }
            }
        })
        .then(function () {
            broadcasters.forEach(function (val, index, array) {
                element = { [val]: index }
                Object.assign(twitchIds, element);
            })
            console.log(twitchIds)
        })
        .catch(function (e) {
            console.log(e)
        });
}

async function initUsernames() {
    let users = Object.keys(twitchIds);
    refreshList2 = users.join('&broadcaster_id=').substring(0);
    refreshList = users.join('&user_id=').substring(0);
    console.log(refreshList);

    web.get(('channels?broadcaster_id=' + refreshList2))
        .then(function (response) {
            const blocks = response.data.data
            blocks.forEach(block => {
                let blockid = ''
                let blockname = ''
                let blocktitle = ''
                for (let key in block) {
                    if (key === "broadcaster_id") {
                        blockid = block[key]
                    }
                    else if (key === "broadcaster_name") {
                        blockname = block[key]
                    }
                    else if (key === "title") {
                        blocktitle = block[key]
                    }
                }
                let element = {
                    [blockname]:
                    {
                        id: blockid,
                        status: false,
                        game: "empty",
                        ticker: blocktitle
                    }
                }
                Object.assign(twitchData, element)
            })
        })

        .catch(function (e) {
            console.log(e)
        });
}

async function initPFP(){
    let users = Object.keys(twitchData)
    let list = users.join('&login=').substring(0);
    web.get(("users?login=" + list))
    .then(response=>{
        const blocks = response.data.data
        blocks.forEach(block => {
            let blockname = ''
            for (let key in block) {
                if (key === "display_name") {
                    blockname = block[key]
                    twitchData[blockname].profile = block.profile_image_url
                }
            }
    })
    })

    .then(()=>{
        console.log(twitchData);
        console.log("Server Data Initialized")
    })
    .catch(e => {
        console.log(e);
    })
}

function falseSet() {
    twitchData.forEach(user => {
        for (let key in user) {
            if (key === "status") {
                user.key = false;
            }
        }
    })

    console.log(twitchData)
}
