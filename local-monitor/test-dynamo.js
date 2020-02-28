/**
 * This is a little javascript test for accessing the garageState dynamo DB in AWS
 * just trying to understand queries and so forth
 */

const AWS = require('aws-sdk')
AWS.config.update({ region: 'us-east-1' })
const tableName = 'garageState'
let ddb = new AWS.DynamoDB()
let docClient = new AWS.DynamoDB.DocumentClient()

console.log('READY')

/*
 * does a scan, but this returns un javascript friendly data
 */
function simpleScan() {
    let params = {
        TableName: tableName
    }

    ddb.scan(params, (err, data) => {
        if (err) {
            console.log('ERROR', err)
        }

        if (data) {
            console.log('DATA', data.Items)
        }
    })
}

function docPut() {
    let params = {
        TableName: 'dailyGarageState',
        Item: {
            theday: '2018-08-14',
            thetime: '15:32:01',
            doorOpen: true,
            temp: 56.6
        }
    }

    docClient.put(params, (err, result) => {
        if (err) {
            console.log('ERROR', err)
        }

        if (result) {
            console.log('RESULT', result)
        }
    })
}

function docGet() {
    let params = {
        ExpressionAttributeValues: {
            ':v1': '2018-08-14'
        },
        KeyConditionExpression: 'theday = :v1',
        TableName: 'dailyGarageState'
    }

    docClient.query(params, (err, data) => {
        if (err) {
            console.log('ERROR', err)
        }

        if (data) {
            console.log('DATA\n\n', JSON.stringify(data.Items, null, 2))
        }
    })
}

docGet()
