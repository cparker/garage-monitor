const AWS = require('aws-sdk')
const tableName = 'garageState'
let docClient = new AWS.DynamoDB.DocumentClient()


/*
  records should look like
  timestamp : "2018-06-27T08:50:41-06:00", // the primary key
  open: true,
  temp: 33.33
*/

exports.handler = (event, context, callback) => {
    console.log('incoming event', event)

    const genericResponse = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        isBase64Encoded: false
    }

    if (event.httpMethod === 'GET') {

        const dbParams = {
            TableName: tableName,
            Key: { id: `${event.queryStringParameters.id}` }
        }

        docClient.get(dbParams, (err, data) => {
            if (err) {
                genericResponse.body = JSON.stringify(err)
                callback(null, genericResponse)
            } else {
                genericResponse.body = JSON.stringify(data.Item)
                callback(null, genericResponse)
            }
        })
    } else if (event.httpMethod === 'POST') {
        const toInsert = {}
        const parsedBody = JSON.parse(event.body)
        Object.assign(toInsert, parsedBody)
        toInsert.id = parsedBody.timestamp

        const dbParams = {
            TableName: tableName,
            Item: toInsert
        }
        console.log('inserting', dbParams)

        docClient.put(dbParams, (err, data) => {
            if (err) {
                genericResponse.body = JSON.stringify(err)
                callback(null, genericResponse)
            } else {
                genericResponse.body = JSON.stringify(data)
                callback(null, genericResponse)
            }
        })
    } else {
        genericResponse.body = JSON.stringify({ message: `no handler for ${event.httpMethod}` })
        callback(null, genericResponse)
    }
}
