#!/usr/bin/env node

/*
  testing deploy 2
  This runs on the ras pi
*/

const moment = require('moment')
const _ = require('lodash')
const raspi = require('raspi')
const gpio = require('raspi-gpio')
const CronJob = require('cron').CronJob
const restClient = require('request-promise')
const tempSensor = require('ds18b20')
const doorOpenAlertHours = {
    min: process.env.DOOR_OPEN_ALERT_HOUR_MIN || 0,
    max: process.env.DOOR_OPEN_ALERT_HOUR_MAX || 23
}

const motionAlertHours = {
    min: process.env.MOTION_ALERT_HOUR_MIN || 5, // 5am
    max: process.env.MOTION_ALERT_HOUR_MAX || 18 // 6pm
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

const motionPin = process.env.MOTION_SENSOR_PIN || 6
const switchPin = process.env.SWITCH_PIN || 5
const tempSensorID = process.env.TEMP_SENSOR_ID || '28-01157173a0ff'

let lastMotionEvent, switchInput, motionInput

let globalDoorOpenState

function start() {
    console.log('start')
    console.log(`args ${JSON.stringify(process.argv, null, 2)}`)

    if (!apiToken) {
        console.log('API_TOKEN is not set on env')
        process.exit(1)
    }


    /*
      NOTE: if one node process monitoring pins is already running, a second node process will fail upon attempting 
      to access pins
    */
    switch (process.argv[2]) {
        case 'checkDoorStatusAndAlert':
            raspi.init(() => {
                createPinInputs(async() => {
                    await checkDoorStatusAndAlert()
                    process.exit(0)
                })
            })
            break

        case 'checkUploadTemp':
            checkUploadTemp()
            break

        case 'checkUploadDoor':
            raspi.init(() => {
                createPinInputs(async() => {
                    await checkUploadDoor()
                    process.exit(0)
                })
            })
            break

        default:
            startMonitor()
            break
    }
}

function setupCron() {
    // every 30 minutes, all day everyday, upload the door state
    const checkUploadDoorJob = new CronJob('0 */30 * * * *', checkUploadDoor, null, true)

    // one minute after every hour, upload the temperature
    const checkUploadTempJob = new CronJob('0 1 * * * *', checkUploadTemp, null, true) // the :01 of every hour

    // every 15 minutes, NOT in the 'middle' of the day, send alert if the door is open
    // const checkDoorStatusAndAlertJob = new CronJob('*/15 0-5,19-23 * * *', checkDoorStatusAndAlert, null, true)
    const checkDoorStatusAndAlertJob = new CronJob('*/15 * * * *', checkDoorStatusAndAlert, null, true)
}

async function checkUploadDoor() {
    console.log('checkUploadDoor job started')
    // read the status of the switch and upload door status
    const post = {
        method: 'POST',
        uri: doorStatusURL,
        body: {
            isOpen: isDoorOpen()
        },
        json: true,
        headers: {
            'x-api-token': apiToken
        }
    }
    console.log('about to post', post)
    globalDoorOpenState = isDoorOpen()

    try {
        const result = await restClient(post)
        console.log('posted door status', result)
    } catch (err) {
        console.log('caught error posting door status', err)
    }
}

async function checkUploadTemp() {
    console.log('checkUploadTemp job started')
    const tempF = cToF(tempSensor.temperatureSync(tempSensorID))
    console.log('read temp', tempF)

    const post = {
        uri: postTempURL,
        method: 'POST',
        json: true,
        body: {
            tempF: tempF
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
    // when the garage door is open, the switch contacts are 'touching', which means current is flowing
    // which means the pin state should be high
    return switchInput.read() === gpio.HIGH
}

async function sendAlert(message) {
    console.log(`sending message: ${message}`)
    const alertPost = {
        uri: sendAlertURL,
        method: 'POST',
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
    // return now.hour() <= doorOpenAlertHours.min || now.hour() >= doorOpenAlertHours.max
    // FIXME bad logic here
    return true
}

function isMotionAlertingActive() {
    const now = moment()
    //return now.hour() <= motionAlertHours.min || now.hour() >= motionAlertHours.max
    // FIXME : this is turning out to be a little too unreliable so disabling for now
    return false
}

/*
  Called on a cron to check the door status and take action accordingly
*/
async function checkDoorStatusAndAlert() {
    console.log('checkDoorStatusAndAlert job started')
    // if door open after 7pm, send alert
    const now = moment()
    if (isDoorOpen() && isDoorAlertingActive()) {
        await sendAlert(doorOpenMessage.replace('__TIME__', now.format('LT')))
    }
}

function startMonitor() {
    console.log('starting monitor')
    raspiInit()
    setupCron()
}

function createPinInputs(cb) {

    // motion sensor
    motionInput = new gpio.DigitalInput({
        pin: `GPIO${motionPin}`,
        pullResistor: gpio.PULL_DOWN
    })

    // switch sensor
    switchInput = new gpio.DigitalInput({
        pin: `GPIO${switchPin}`,
        pullResistor: gpio.PULL_DOWN
    })

    if (cb) {
        cb()
    }
}

function raspiInit() {
    raspi.init(() => {
        createPinInputs()

        // motion pin should go HIGH for a short period when motion is detected
        motionInput.on('change', motionPinState => {
            console.log(`motion pin state changed ${motionPinState}`)
            handleMotionEvent()
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
    // hack here because I'm seeing spurious close signals from the switch pin
    if (globalDoorOpenState === true) {
        console.log('ignoring this open event because the door is already open')
        return false
    }
    globalDoorOpenState = true
    const now = moment()
    const post = {
        uri: doorStatusURL,
        method: 'POST',
        json: true,
        body: {
            isOpen: true
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
    return true
}

async function handleDoorClose() {
    if (globalDoorOpenState === false) {
        console.log('ignoring handleDoorClose because its already closed')
        return false
    }
    globalDoorOpenState = false
    const now = moment()
    const post = {
        uri: doorStatusURL,
        method: 'POST',
        json: true,
        body: {
            isOpen: false
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
    return true
}


function handleMotionEvent() {
    const now = moment()
    if (isMotionAlertingActive() && now.diff(lastMotionEvent || 0) > motionEventRearmSec * 1000) {
        lastMotionEvent = now
        sendAlert(motionDetectedMessage.replace('__TIME__', now.format('LT')))
    }
}

function cToF(ctemp) {
    return ctemp * 9.0/5.0 + 32.0
}

// starts things off
start()
