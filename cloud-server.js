/*
  Runs in cloud (assuming heroku)

  depends on: mongo, mailgun
*/

const express = require('express')
const bodyParser = require('body-parser')
const moment = require('moment')
const app = express()
const defaultDBConnection = `mongodb://localhost/garageMonitor`
const dbURI = process.env.MONGODB_URI || defaultDBConnection
const dbName = dbURI.substr(dbURI.lastIndexOf('/') + 1)
const MongoClient = require('mongodb').MongoClient
const expressPort = process.env.PORT || 5000
const apiToken = process.env.API_TOKEN
const restClient = require('request-promise')
const MAIL_API_KEY = process.env.MAILGUN_API_KEY
const MAIL_DOMAIN = process.env.MAILGUN_DOMAIN
const MAIL_API_URL = `https://api:${MAIL_API_KEY}@api.mailgun.net/v3/${MAIL_DOMAIN}/messages`
const attSMSGateway = `txt.att.net`
const emailAlertSubj = `garage door alert`
const CP_PHONE = process.env.CP_PHONE

// this can be comma separated, these addresses need to be configured in mailgun
const alertReceiveList = process.env.ALERT_LIST || `${CP_PHONE}@${attSMSGateway}`

const tempCollection = `tempF`
const doorStatusCol = `doorStatus`

let db

function start() {
    console.log('starting')
    checkToken()
    initExpress()
    initMongo()
}

function checkToken() {
    if (!apiToken) {
        console.log('apiToken is null.  Is API_TOKEN set on env?')
        process.exit(1)
    }
}

function tokenValid(req) {
    return req.headers['x-api-token'] === apiToken
}

function initExpress() {
    app.use(express.static('.'))
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({
        extended: true
    }))

    // some simple security
    // app.use((req, res, next) => {
    //     if (req.headers['x-api-token'] !== apiToken) {
    //         res.sendStatus(401)
    //     } else {
    //         next()
    //     }
    // })

    registerRoutes()
    app.listen(expressPort, '0.0.0.0', () => {
        console.log(`express listening on ${expressPort}`)
    })
}

function registerRoutes() {
    /*
      post body should look like:
      { tempF: 55.0 }
    */
    app.post('/temp', async(req, res) => {
        console.log('handling POST /temp')
        if (tokenValid(req)) {
            // save temp to database
            try {
                req.body.dateTime = moment().toDate()
                const result = await db.collection(tempCollection)
                    .insertOne(req.body)
                res.status(201).send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        } else {
            res.status(401).send('invalid api token')
        }
    })

    app.get('/temp', async(req, res) => {
        console.log('handling GET temp')

        const tempResult = await db.collection(tempCollection)
            .find()
            .sort({
                $natural: -1
            })
            .limit(1)
            .toArray()

        if (tempResult && tempResult.length >= 1) {
            res.status(200).json(tempResult[0])
        } else {
            res.status(404)
        }
    })

    /*
      post body should look like:
      { message: "Garage door open @ 7:00 pm"}
    */
    app.post('/sendAlert', async(req, res) => {
        if (tokenValid(req)) {
            try {
                await sendEmail(alertReceiveList, emailAlertSubj, req.body.message)
                res.status(201).send('success')
            } catch (err) {
                res.status(500).send(err)
            }
        } else {
            res.status(401).send('invalid api token')
        }
    })

    /*
      post body looks like:
      { doorOpen : true | false }
    */
    app.post('/doorStatus', async(req, res) => {
        if (tokenValid(req)) {
            try {
                req.body.dateTime = moment().toDate()
                const result = await db.collection(doorStatusCol)
                    .insertOne(req.body)
                res.status(201).send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        } else {
            res.status(401).send('invalid api token')
        }
    })

    app.get('/doorStatus', async(req, res) => {
        const doorStatResult = await db.collection(doorStatusCol)
            .find()
            .sort({
                $natural: -1
            })
            .limit(1)
            .toArray()

        if (doorStatResult && doorStatResult.length >= 1) {
            res.status(200).json(doorStatResult[0])
        } else {
            res.status(404)
        }
    })
}

function initMongo() {
    MongoClient.connect(dbURI, (err, client) => {
        if (err) {
            console.log(`error connecting to mongo`, err)
        } else {
            db = client.db(dbName)
            console.log(`Connected to mongo ${dbURI}`)
        }
    })
}

async function sendEmail(pTo, subj, textBody) {
    const emailFormFields = {
        from: `garage-monitor@cjparker.us`,
        to: pTo,
        subject: subj,
        text: textBody
    }
    const emailPost = {
        method: 'POST',
        uri: MAIL_API_URL,
        form: emailFormFields
    }
    return restClient.post(MAIL_API_URL, emailPost)
}

start()
