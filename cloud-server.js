/*
  Runs in cloud
*/

const express = require('express')
const bodyParser = require('body-parser')
const moment = require('moment')
const app = express()
const defaultDBConnection = `mongodb://localhost/garageMonitor`
const dbURI = process.env.MONGODB_URI || defaultDBConnection
const dbName = dbURI.substr(dbURI.lastIndexOf('/')+1)
const MongoClient = require('mongodb').MongoClient
const expressPort = process.env.PORT || 5000

let db

function initExpress() {
    app.use(express.static('.'))
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({
        extended: true
    }))
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
    app.post('/temp', (req, res) => {
        // save temp to database
    })

    /*
      post body should look like:
      { message: "Garage door open @ 7:00 pm"}
    */
    app.post('/sendAlert', (req, res) => {
        // call email service
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

function start() {
    console.log('starting')
    initExpress()
    initMongo()
}

start()
