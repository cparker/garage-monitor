#!/usr/bin/env node

/*
  This runs on the ras pi
*/

const moment = require('moment')
const doorOpenAlertHours = {
    min: process.env.DOOR_OPEN_ALERT_HOUR_MIN || 5, // 5am
    max: process.env.DOOR_OPEN_ALERT_HOUR_MAX || 19 // 7pm
}

const motionAlertHours = {
    min: process.env.MOTION_ALERT_HOUR_MIN || 5, // 5am
    max: process.env.MOTION_ALERT_HOUR_MAX || 19 // 7pm
}

const doorOpenMessage = `The garage door is open @ __TIME__`
const doorIsOpeningMessage = `The garage door is opening @ __TIME__`
const doorIsClosingMessage = `The garage door is closing @ __TIME__`
const motionDetectedMessage = `Movement detected in garage @ __TIME__`

function start() {
    console.log('start')
    console.log(`args ${JSON.stringify(process.argv, null, 2)}`)

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

function checkUploadTemp() {
    // get temp from sensor and post to cloud DB
}

function isDoorOpen() {
    return true
}

function sendAlert(message) {
    console.log(`sending message: ${message}`)
    // send email
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

}

function handleDoorOpen() {
    const now = moment()
    if (isDoorAlertingActive()) {
        sendAlert(doorIsOpeningMessage.replace('__TIME__', now.format('LT')))
    }
}

function handleDoorClose() {
    const now = moment()
    if (isDoorAlertingActive()) {
        sendAlert(doorIsClosingMessage.replace('__TIME__', now.format('LT')))
    }
}

function handleMotionEvent() {
    const now = moment()
    if (isMotionAlertingActive()) {
        sendAlert(motionDetectedMessage.replace('__TIME__', now.format('LT')))
    }
}

// starts things off
start()
