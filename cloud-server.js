/*
  Runs in cloud (assuming heroku)

  depends on: mongo, mailgun
*/

const express = require('express')
const bodyParser = require('body-parser')
const moment = require('moment')
const app = express()
const defaultDBConnection = `mongodb://localhost/heroku_fvfzjdz2`
const dbURI = process.env.MONGODB_URI || defaultDBConnection
const dbName = dbURI.substr(dbURI.lastIndexOf('/') + 1)
const MongoClient = require('mongodb').MongoClient
const expressPort = process.env.PORT || 5000
const apiToken = process.env.API_TOKEN
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
const slack = require('slack-notify')(SLACK_WEBHOOK_URL)

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

      TODO : allow this to be switched on / off via state using the s3 API
    */
    app.post('/sendAlert', async(req, res) => {
        if (tokenValid(req)) {
            try {
                // await sendEmail(alertReceiveList, emailAlertSubj, req.body.message)
                await sendSlack(req.body.message, {})
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

    app.get('/doorActivity', async(req, res) => {
        const now = moment()
        const doorStatResult = await db.collection(doorStatusCol)
            .find({dateTime: {$gte: now.subtract(1, 'days').toDate()}})
            .toArray()

        if (doorStatResult && doorStatResult.length >= 1) {
            res.status(200).json(doorStatResult)
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

async function sendSlack(title, data) {
    return new Promise((resolve, reject) => {
        slack.alert({
            text: title,
            fields: data
        }, err => {
            if (err) {
                console.log('slack error', err)
                reject(err)
            } else {
                resolve('SLACKED')
            }
        })
    })
}

start()
