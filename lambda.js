'use strict';
const awsServerLessExpress = require('aws-serverless-express')
const https = require('https');
const request = require('request');

const app = require('./app');
const server = awsServerLessExpress.createServer(app)

exports.handler = (event, context) => {
    console.log("Evevt: " + JSON.stringify(event));
    awsServerLessExpress.proxy(server, event, context)


}

