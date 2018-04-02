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

const tempCollection = `tempF`
const doorStatusCol = `doorStatus`

let db

function start() {
    console.log('starting')
    console.log('apiToken is', apiToken)
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

function initExpress() {
    app.use(express.static('.'))
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({
        extended: true
    }))

    // some simple security
    app.use((req, res, next) => {
        if (req.headers['x-api-token'] !== apiToken) {
            res.sendStatus(401)
        } else {
            next()
        }
    })

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
        // save temp to database
        try {
            req.body.dateTime = moment().toDate()
            const result = await db.collection(tempCollection)
                .insertOne(req.body)
            res.status(201).send(result)
        } catch (err) {
            res.status(500).send(err)
        }
    })

    /*
      post body should look like:
      { message: "Garage door open @ 7:00 pm"}
    */
    app.post('/sendAlert', async(req, res) => {
        try {
            await sendEmail('cp@cjparker.us', 'this is a test', 'test from node')
            res.status(201).send('success')
        } catch (err) {
            res.status(500).send(err)
        }
    })

    /*
      post body looks like:
      { doorOpen : true | false }
    */
    app.post('/doorStatus', async(req, res) => {
        try {
            req.body.dateTime = moment().toDate()
            const result = await db.collection(doorStatusCol)
                .insertOne(req.body)
            res.status(201).send(result)
        } catch (err) {
            res.status(500).send(err)
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
