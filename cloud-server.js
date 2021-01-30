// @flow
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
const restClient = require('request-promise')
const MAIL_API_KEY = process.env.MAILGUN_API_KEY
const MAIL_DOMAIN = process.env.MAILGUN_DOMAIN
const MAIL_API_URL = `https://api:${MAIL_API_KEY}@api.mailgun.net/v3/${MAIL_DOMAIN}/messages`
// const attSMSGateway = `txt.att.net`
// const CP_PHONE = process.env.CP_PHONE
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
const SLACK_PORTALS_WEBHOOK_URL = process.env.SLACK_PORTALS_WEBHOOK_URL
const slack = require('slack-notify')(SLACK_WEBHOOK_URL)
const slackPortals = require('slack-notify')(SLACK_PORTALS_WEBHOOK_URL)
const _ = require('lodash')

// this can be comma separated, these addresses need to be configured in mailgun
// const alertReceiveList = process.env.ALERT_LIST || `${CP_PHONE}@${attSMSGateway}`

const tempCollection = `tempF`
const doorStatusCol = `doorStatus`

const portalMap = {
  '1': 'front door',
  '2': 'basement door'
}

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
  app.use(
    bodyParser.urlencoded({
      extended: true
    })
  )

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
  app.post('/temp', async (req, res) => {
    console.log('handling POST /temp')
    if (tokenValid(req)) {
      // save temp to database
      try {
        req.body.dateTime = moment().toDate()
        const result = await db.collection(tempCollection).insertOne(req.body)
        res.status(201).send(result)
      } catch (err) {
        res.status(500).send(err)
      }
    } else {
      res.status(401).send('invalid api token')
    }
  })

  app.get('/temp', async (req, res) => {
    console.log('handling GET temp')

    const tempResult = await db
      .collection(tempCollection)
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
  app.post('/sendAlert', async (req, res) => {
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
  app.post('/doorStatus', async (req, res) => {
    if (tokenValid(req)) {
      try {
        req.body.dateTime = moment().toDate()
        const result = await db.collection(doorStatusCol).insertOne(req.body)
        res.status(201).send(result)
      } catch (err) {
        res.status(500).send(err)
      }
    } else {
      res.status(401).send('invalid api token')
    }
  })

  app.get('/doorStatus', async (req, res) => {
    const doorStatResult = await db
      .collection(doorStatusCol)
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

  app.get('/doorActivity', async (req, res) => {
    const now = moment()
    const doorStatResult = await db
      .collection(doorStatusCol)
      .find({ dateTime: { $gte: now.subtract(1, 'days').toDate() } })
      .toArray()

    if (doorStatResult && doorStatResult.length >= 1) {
      res.status(200).json(doorStatResult)
    } else {
      res.status(404)
    }
  })

  app.post('/smokedetector', async (req, res, next) => {
    if (tokenValid(req)) {
      if (req.body && req.body.message) {
        await sendSlack(`SMOKE DETECTOR: ` + req.body.message, {})
        res.status(200).send('OK')
      }
    } else {
      res.status(401).send('invalid api token')
    }
  })

  function handleFridgeTemperature(tempF, relativeHumidity, res) {
    sendSlack (`REFRIGERATOR: temp ${tempF} ºF, humidity ${relativeHumidity}%`)
    res.status(200).send('OK')
  }

  /**
   * {
   *  "alarmId" : 1,
   *  "alarmState" : 1
   * }
   *
   * alarmState 1 == sensors apart
   * alarmtState 0 == sensors togetger
   */
  app.post('/portals', async (req, res) => {

    function generateMessage(eventType, portalName, portalState, batteryLevel) {
      const now = moment()
      const portalStateChangeMap = {
        '0': 'closing',
        '1': 'opening',
        '12345': 'restarting'
      }

      const portalStateStaticMap = {
        '0': 'closed',
        '1': 'open'
      }

      const eventTypeMap = {
        '0': `${portalName} is ${_.get(portalStateChangeMap, portalState, '')} at ${now.format('hh:mm a')}, battery ${batteryLevel} v`,
        '1': `short interval : ${portalName} is ${_.get(portalStateStaticMap, portalState, '')} at ${now.format('hh:mm a')}`,
        '2': `heartbeat: ${portalName} is ${_.get(portalStateStaticMap, portalState, '')} at ${now.format('hh:mm a')}, battery level is ${batteryLevel} v`,
        '3': `${portalName} portal sensor is restarting at ${now.format('hh:mm a')}`
      }
      return _.get(eventTypeMap, eventType, `unknown event type ${eventType}`)
    }

    if (tokenValid(req)) {
      if (req.body) {
        console.log('got portals post', JSON.stringify(req.body, null, 2))
        const alarmId = `${_.get(req.body, 'alarmId', -1)}`
        const alarmState = `${_.get(req.body, 'alarmState', -1)}`
        const portalName = _.get(portalMap, alarmId, 'unknown')
        const batteryLevel = _.get(req.body, 'batteryLevel', '')
        const eventType = _.get(req.body, 'eventType', -1)

        // SPECIAL CASE - an alarm id of '10' is the temp sensor in the fridge
        // I'm monitoring the fridge temperature because it'd dying :( 
        if (alarmId === '10') {
          console.log('handling special case of fridge temperature monitor')
          const tempF = batteryLevel
          const relativeHumidity = eventType
          handleFridgeTemperature(tempF, relativeHumidity, res)
          return
        }
        
        // add the battery level to the message for event types 2 and 3, startup and heartbeat
        const message = generateMessage(eventType, portalName, alarmState, batteryLevel)

        // for now, don't send the 15 minute message, because that's too many
        // event type:
        // 0 - window switch changed state
        // 1 - portal state event (default 15 minute polling)
        // 2 - heartbeat
        // 3 - power up

        if (eventType === 0 || eventType === 3 || eventType === 2) {
          console.log('about to sendPortalsMessage (slack)')
          
          sendPortalsMessage(message)
            .then(() => {
              console.log('sent portals slack message OK')
              res.status(200).send('OK')
            })
            .catch(err => {
              console.error('error sending slack portals message')
              res.status(500).send(err)
            })
        }
      } else {
        console.error('error, no body in /portals')
      }
    } else {
      res.status(401).send('invalid api token')
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

async function sendPortalsMessage(text) {
  return new Promise((resolve, reject) => {
    slackPortals.send({ text, channel: '#portals' }, err => {
      if (err) {
        console.log('slack error', err)
        reject(err)
      } else {
        resolve('SLACKED')
      }
    })
  })
}

async function sendSlack(title, data) {
  return new Promise((resolve, reject) => {
    slack.alert(
      {
        text: title,
        fields: data
      },
      err => {
        if (err) {
          console.log('slack error', err)
          reject(err)
        } else {
          resolve('SLACKED')
        }
      }
    )
  })
}

start()
