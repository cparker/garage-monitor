#!/usr/bin/env node

/*
  This runs on the ras pi
*/

const moment = require('moment')
const _ = require('lodash')
const raspi = require('raspi')
const gpio = require('raspi-gpio')
const restClient = require('request-promise')
const tempSensor = require('ds18b20')
const doorOpenAlertHours = {
    min: process.env.DOOR_OPEN_ALERT_HOUR_MIN || 5, // 5am
    max: process.env.DOOR_OPEN_ALERT_HOUR_MAX || 19 // 7pm
}

const motionAlertHours = {
    min: process.env.MOTION_ALERT_HOUR_MIN || 5, // 5am
    max: process.env.MOTION_ALERT_HOUR_MAX || 19 // 7pm
}

const apiToken = process.env.API_TOKEN

const doorOpenMessage = `The garage door is open @ __TIME__`
const doorIsOpeningMessage = `The garage door is opening @ __TIME__`
const doorIsClosingMessage = `The garage door is closing @ __TIME__`
const motionDetectedMessage = `Movement detected in garage @ __TIME__`

const baseURL = `http://garage-monitor.herokuapp.com`
const postTempURL = `${baseURL}/temp`
const sendAlertURL = `${baseURL}/sendAlert`
const doorStatusURL = `${baseURL}/doorStatus`

const motionEventRearmSec = 60

const motionPin = process.env.MOTION_SENSOR_PIN || 4
const switchPin = process.env.SWITCH_PIN || 5
const tempSensorID = process.env.TEMP_SENSOR_ID || '12345'

let lastMotionEvent

function start() {
    console.log('start')
    console.log(`args ${JSON.stringify(process.argv, null, 2)}`)

    if (!apiToken) {
        console.log('API_TOKEN is not set on env')
        process.exit(1)
    }

    switch (process.argv[2]) {
        case 'checkDoorStatusAndAlert':
            checkDoorStatusAndAlert()
            break

        case 'checkUploadTemp':
            checkUploadTemp()
            break

        case 'checkUploadDoor':
            checkUploadDoor()
            break

        default:
            startMonitor()
            break
    }
}

function checkUploadDoor() {
    // post door status
}

async function checkUploadTemp() {
    const temp = tempSensor.temperatureSync(tempSensorID)

    const post = {
        uri: postTempURL,
        method: 'POST',
        json: true,
        body: {
            tempF: temp // TODO what actually comes back from the sensor?
        },
        headers: {
            'x-api-token': apiToken
        }
    }
    try {
        const result = await restClient(post)
        console.log('successfully posted temp', result)
    } catch (err) {
        console.log('caught error while posting temp', err)
    }
}

function isDoorOpen() {
    return true
}

async function sendAlert(message) {
    console.log(`sending message: ${message}`)
    const alertPost = {
        uri: sendAlertURL,
        request: 'POST',
        json: true,
        body: {
            message: message
        },
        headers: {
            'x-api-token': apiToken
        }

    }
    try {
        const result = await restClient(alertPost)
        console.log('send alert result', result)
    } catch (err) {
        console.log('error sending alert', err)
    }
}

function isDoorAlertingActive() {
    const now = moment()
    return now.hour() <= doorOpenAlertHours.min || now.hour() >= doorOpenAlertHours.max
}

function isMotionAlertingActive() {
    const now = moment()
    return now.hour() <= motionAlertHours.min || now.hour() >= motionAlertHours.max
}

/*
  Called on a cron to check the door status and take action accordingly
*/
function checkDoorStatusAndAlert() {
    // if door open after 7pm, send alert
    const now = moment()
    if (isDoorOpen() && isDoorAlertingActive()) {
        sendAlert(doorOpenMessage.replace('__TIME__', now.format('LT')))
    }
}

function startMonitor() {
    console.log('starting monitor')
    raspiInit()
}

function raspiInit() {
    raspi.init(() => {
        // motion sensor
        const motionInput = new gpio.DigitalInput({
            pin: `GPIO${motionPin}`
        })

        // motion pin should go HIGH for a short period when motion is detected
        motionInput.on('change', motionPinState => {
            console.log(`motion pin state changed ${motionPinState}`)
            handleMotionEvent()
        })

        // switch sensor
        const switchInput = new gpio.DigitalInput({
            pin: `GPIO${switchPin}`,
            pullResistor: gpio.PULL_DOWN
        })

        switchInput.on('change', _.debounce(switchPinState => {
            console.log(`switch pin state changed ${switchPinState}`)

            if (switchPinState === gpio.HIGH) {
                handleDoorOpen()
            } else {
                handleDoorClose()
            }

        }, 1000))

    })
}

async function handleDoorOpen() {
    const now = moment()
    const post = {
        uri: doorStatusURL,
        request: 'POST',
        json: true,
        body: {
            doorOpen: true
        },
        headers: {
            'x-api-token': apiToken
        }
    }

    try {
        const result = await restClient(post)
        console.log('posted door status', result)
    } catch (err) {
        console.log('error posting door status', err)
    }

    if (isDoorAlertingActive()) {
        sendAlert(doorIsOpeningMessage.replace('__TIME__', now.format('LT')))
    }
}

async function handleDoorClose() {
    const now = moment()
    const post = {
        uri: doorStatusURL,
        request: 'POST',
        json: true,
        body: {
            doorOpen: false
        },
        headers: {
            'x-api-token': apiToken
        }
    }

    try {
        const result = await restClient(post)
        console.log('posted door status', result)
    } catch (err) {
        console.log('error posting door status', err)
    }
    if (isDoorAlertingActive()) {
        sendAlert(doorIsClosingMessage.replace('__TIME__', now.format('LT')))
    }
}

function handleMotionEvent() {
    const now = moment()
    if (isMotionAlertingActive() && now.diff(lastMotionEvent || 0) > motionEventRearmSec * 1000) {
        lastMotionEvent = now
        sendAlert(motionDetectedMessage.replace('__TIME__', now.format('LT')))
    }
}

// starts things off
start()