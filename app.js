var http = require("http");
var request = require('request');
var express = require('express');
//var shell = require('shelljs');
var CSV = require('comma-separated-values');
const uuidv1 = require('uuid/v1');
var Promise = require('promise');

var async = require("async");

var app = express();

app.get('/hello', function(req, res){

    var name = "Biswa";
    if(req.query.name && req.query.name != ""){
        name = req.query.name;
    }
    res.json({"message" : "Welcome "+name+" ... " });
});

app.get('/api', function(req, res){
     res.json({"message" : "Within GET APIs ... " });
        
    // GRADEBOOK JOSN

    var gradebook_data = { 
                            "userOrder": [
                                { "property": "familyName", "direction": "ASC" },
                                { "property": "givenName", "direction": "ASC" }
                            ],  
                            "userAttributes": [ "familyName", "givenName", "emailAddress" ],
                            "categoryAverage": false
                     }
                     async.forEachOf(gradebook_data.userOrder, function (result, i, callback) {
                        
                        index = i;
                        memberID = result.property;
                        console.log('index'+index);
                        console.log('memberID'+memberID);

                        console.log('1');
                        var accessToken =  get_access_token_LO();
                        setTimeout(function() {
                            console.log("Called TO UPDATE - ");
                             }, 1000);
                        console.log('accessToken = '+accessToken);
                        console.log('2');
                                        // Do more Stuff
                            // The next iteration WON'T START until callback is called
                            callback();
                            console.log('3');
                            console.log('4');
                        });
                        console.log('5');
                        
    // CALL FOR ACCES TOKEN


});

app.listen(3000, function(){
    console.log("App Started On port 3000");
})


function call_course_list_API(token)
{
    process.stdout.write(token);
    request.get('http://some.server.com/', {
        'auth': {
        'bearer': 'bearerToken'
        }
    });
   
}

function get_access_token_LO()
{
    console.log("App IN FUNCTION START");
    request({
        url: 'https://karma-test.difference-engine.com/oauth2/token?grant_type=client_credentials',
        method: 'POST',
        auth: {
            user: 'grade-sync',
            pass: '3f7s-xnx9ydzm-uhdx'
        },
        form: {
            'grant_type': 'client_credentials'
        }
        }, function(err, res) {
            console.log("RES = "+ res);
            console.log("ERR = "+err);
             var json = res;
       console.log("Access Token:", json);
         return json.access_token;
        });
        console.log("App IN FUNCTION END");
}

function print_msg(msg)
{
    process.stdout.write(msg);
   
}
module.exports = app;