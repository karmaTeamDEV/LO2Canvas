/*+===========================================================================
 ||
 ||       Language:  Node.js
 ||
 ||        Version:  9.2.0
 ||
 ||    Description:  API to fetch grades from LO and update it to Canvas.
 ||                  Fetch all Courses, Assignmets, Students from Canvas.
 ||                  Get access token from LO. 
 ||                  Fetch all Courses and Gradebooks from LO using the access token.
 ||                  Chek the Assignments of LO in Canvas. If not present create in Camvas. 
 ||                  Update the Grades of LO in Canvas and update the Status.
 ||
 ||    Source Path:  https://github.com/karmaTeamDEV/LO2Canvas.git
 ||
 |+-----------------------------------------------------------------------
 ||
 ||      Developer:  Biswa Panda / Padma Pradhan
 ||
 ||          Email:  biswa002@gmail.com / pradhan.padma@gmail.com 
 ||
 ||       Phone No:  +91-943 866 5655 / +91-700 890 2901
 ||
 ||           Date:  11/27/2017
 ||
 |+-----------------------------------------------------------------------
 ||
 ||      Tested By:  Churchill Rout
 ||
 ||          Email:  churchill.rout@gmail.com
 ||
 ||       Phone No:  +91-785 385 4946
 ||
 ||           Date:  11/28/2017
 ||
 |+-----------------------------------------------------------------------
 ||
 ||    Reviewed By:  Sonali Susmita / Manaw Modi
 ||
 ||          Email:  sonali.sushmita@gmail.com / manaw.modi@gmail.com 
 ||
 ||       Phone No:  +91-933 783 2497 / +91-943 703 2211
 ||
 ||           Date:  11/29/2017
 ||
 ++==========================================================================*/ 

'use strict';

// LOAD LIBRARIES
var AWS = require("aws-sdk");
var https = require('https');
var request = require('request');
var CSV = require('comma-separated-values');
const uuidv1 = require('uuid/v1');
var Promise = require('promise');
var async = require("async");

// SET REGION CONFIG
AWS.config.update({region: 'us-east-2'});

// SET GLOBAL VARIABLES
var access_token = "";

var LO_URL = "https://karma-test.difference-engine.com/";

var Canvas_URL = "https://learningobjects.instructure.com/";
var Canvas_Token = "3~9Y1aDtficzadsxwl8qKEnPf9OO3JFkVeeySn6fZV0R7n5MyuUjG19cXT7dqU9KHz";


var Batch_NO = uuidv1();
var MsgNO = 1;

console.log('Loading function');
// START API FUNCTION handler. Run BY Default for AWS Lambda Function

exports.handler = (event, context, callback) => {

    insert_log_messages(MsgNO++, 'Info', 'Start') ;
    
    UpdateScoreLOtoCanvas('Start').then(function (LOCanvasUpdateFunction) {

        callback(null, LOCanvasUpdateFunction);

        insert_log_messages(MsgNO++, 'Info', 'End') ;
    })
    
};




// API RUNNER FUNCTION WITH PROMISE FOR LO to CANVAS MASTER
function UpdateScoreLOtoCanvas(initialData) {

    return getCoursesFromCanvas(initialData)
        .then(getAssignment_StudentsFromCanvas)
        .then(get_access_token_LO)
        .then(get_all_courses_from_LO)
        .then(get_score_for_courses_LO)
        .then(update_marks_to_Canvas)
}





// FUNCTION TO GET ALL THE COURSES FROM CANVAS. 

function getCoursesFromCanvas(firstData) {

    insert_log_messages(MsgNO++, 'Info', 'Start Fetching Courses from Canvas') ;

    return new Promise(function (resolve, reject) {

        request({ //API CAL GET ALL COURSES FROM CANVAS USING REQUEST LIBRARY
            url: Canvas_URL+'api/v1/courses?access_token='+Canvas_Token,
            method: 'GET',
            
        }, function(err, res, body) { // CALLBACK FUNCTION TO HANDEL RETURNS OF CANVAS API CALL
            
            if (err) { // IF GOT ERROR FROM CANVAS API CALL
                insert_log_messages(MsgNO++, 'Error', 'Error In Fetching Courses from Canvas - '+err) ;
                reject(err);
            }  
            else{ // IF GOT SCCUSS FROM CANVAS API CALL
                
                var Courses_from_Canvas = JSON.parse(res.body);

                insert_log_messages(MsgNO++, 'Success', Courses_from_Canvas.length+' Courses Fetched from Canvas') ;

                // INSERT INTO CANVAS COURSE TABLE BY LOOP
                for(var c=0; c<Courses_from_Canvas.length; c++ )
                {
                    var p_id = uuidv1();
                    var insert_time = getCurrentDateTime();
                    var canvas_course_id = Courses_from_Canvas[c].id.toString();
                    var canvas_course_name = Courses_from_Canvas[c].name;
                    
                    // CREATE DB OBJECT AND PARAMETERS FOR INSERT
                    var dynamodb = new AWS.DynamoDB();
                    var params = {
                            TableName:"int_lo_canvas_courses_from_canvas",
                            Item:{
                                id : { S:p_id},
                                courseid : { S:canvas_course_id},
                                name : { S:canvas_course_name},
                                InserTime : { S:insert_time},
                                Batch: { S:Batch_NO}
                            }
                        };
                     // INSERT TO DYNAMO DB
                    dynamodb.putItem(params, function(err, data) {

                        if(err)
                        {
                            insert_log_messages(MsgNO++, 'Error', ' Not Inserted to Canvas Course table'+err) ;
                            reject(err);
                        }
                        //console.log("DATA = "+ data);
                    });
                    
                    
                }
                insert_log_messages(MsgNO++, 'Success', c+' - Courses Inserted to Canvas Course table') ;
                
                resolve(Courses_from_Canvas);
                //return access_token;

            }
        });


    })
}


// FUNCTION TO GET ALL THE ACCESSMENT and STUDENTS BY COURSES FROM CANVAS
function getAssignment_StudentsFromCanvas(AllCoursesfromCanvas) {

    
    insert_log_messages(MsgNO++, 'Info', 'Start Fetching Accessment from Canvas') ;

    return new Promise(function (resolve, reject) {

        // START COURSE LOOP
        for(var c=0; c<AllCoursesfromCanvas.length; c++ )
        {
            var canvas_course_id = AllCoursesfromCanvas[c].id.toString();

            // FETCH ASSIGNMENTS FOR COURSE CANVAS
            insert_log_messages(MsgNO++, 'Info', ' Start Fetching For CourseID-'+canvas_course_id) ;
            request({
                url: Canvas_URL+"api/v1/courses/"+canvas_course_id+"/assignments?override_assignment_dates=false&access_token="+Canvas_Token,
                method: 'GET',
                
            }, function(err, res, body) {
                    
                if (err) {
                    console.log("ERROR IN FETCH ASSIGNMENTS FROM CANVAS: COURSEID - "+canvas_course_id+" - "+err);
                    insert_log_messages(MsgNO++, 'Error', 'Error In Fetching Assignments from Canvas - '+err) ;
                    reject(err);
                }  
                else{
                    
                    var Assignments_from_Canvas_by_Course = JSON.parse(res.body);

                    insert_log_messages(MsgNO++, 'Success', Assignments_from_Canvas_by_Course.length+' Assignments Fetched from Canvas For CourseID-'+canvas_course_id) ;
    
                    // INSERT INTO CANVAS ASSIGNMENTS TABLE BY LOOP
                    for(var a=0; a<Assignments_from_Canvas_by_Course.length; a++ )
                    {
                        var p_id = uuidv1();
                        var insert_time = getCurrentDateTime();
                        var canvas_assign_id = Assignments_from_Canvas_by_Course[a].id.toString();
                        var canvas_assign_name = Assignments_from_Canvas_by_Course[a].name;
                        var canvas_assign_course_id = Assignments_from_Canvas_by_Course[a].course_id.toString();
                        //console.log(" msg_id = "+ msg_id +" msg_insert_time = "+msg_insert_time);
                    
                        var dynamodb = new AWS.DynamoDB();
                        var params = {
                                TableName:"int_lo_canvas_assignments_of_course_from_canvas",
                                Item:{
                                    id : { S:p_id},
                                    assignid : { S:canvas_assign_id},
                                    courseid : { S:canvas_assign_course_id},
                                    name : { S:canvas_assign_name},
                                    InserTime : { S:insert_time},
                                    Batch: { S:Batch_NO}
                                }
                            };
                         
                        dynamodb.putItem(params, function(err, data) {
                            //console.log("ERROR = "+ err);
                            if(err)
                            {
                                insert_log_messages(MsgNO++, 'Error', ' Not Inserted to Canvas Assignment table'+err) ;
                                reject(err);
                            }
                            //console.log("DATA = "+ data);
                        });
                        
                        
                    }
                    //insert_log_messages(MsgNO++, 'Success', a+' - Courses Inserted to Canvas Course table') ;
    
                    
                    //return access_token;
    
                }
            });

            
    
            // FETCH STUDENTS FOR COURSE CANVAS
            request({
                url: Canvas_URL+"api/v1/courses/"+canvas_course_id+"/enrollments?type[]=StudentEnrollment&access_token="+Canvas_Token,
                method: 'GET',
                
            }, function(err, res, body) {
                    
                if (err) {
                    console.log("ERROR IN FETCH STUDENTS FROM CANVAS: COURSEID - "+canvas_course_id+" - "+err);
                    insert_log_messages(MsgNO++, 'Error', 'Error In Fetching Students from Canvas - '+err) ;
                    reject(err);
                }  
                else{
                    
                    var Students_from_Canvas_by_Course = JSON.parse(res.body);

                    insert_log_messages(MsgNO++, 'Success', Students_from_Canvas_by_Course.length+' Students Fetched from Canvas For CourseID-'+canvas_course_id) ;
    
                    // INSERT INTO CANVAS ASSIGNMENTS TABLE BY LOOP
                    for(var s=0; s<Students_from_Canvas_by_Course.length; s++ )
                    {
                        var p_id = uuidv1();
                        var insert_time = getCurrentDateTime();
                        var canvas_student_id = Students_from_Canvas_by_Course[s].user.id.toString();
                        var canvas_student_name = Students_from_Canvas_by_Course[s].user.name;
                        var canvas_student_email = Students_from_Canvas_by_Course[s].user.login_id;
                        var canvas_student_courseid = Students_from_Canvas_by_Course[s].course_id.toString();
                        //console.log(" msg_id = "+ msg_id +" msg_insert_time = "+msg_insert_time);
                    
                        var dynamodb = new AWS.DynamoDB();
                        var params = {
                                TableName:"int_lo_canvas_students_from_canvas",
                                Item:{
                                    id : { S:p_id},
                                    enrollid : { S:canvas_student_id},
                                    login_id : { S:canvas_student_email},
                                    courseid : { S:canvas_student_courseid},
                                    name : { S:canvas_student_name},
                                    InserTime : { S:insert_time},
                                    Batch: { S:Batch_NO}
                                }
                            };
                         
                        dynamodb.putItem(params, function(err, data) {
                            //console.log("ERROR = "+ err);
                            if(err)
                            {
                                insert_log_messages(MsgNO++, 'Error', ' Not Inserted to Canvas Student table'+err) ;
                                reject(err);
                            }
                            //console.log("DATA = "+ data);
                        });
                        
                        
                    }
                    //insert_log_messages(MsgNO++, 'Success', a+' - Courses Inserted to Canvas Course table') ;
    
                    
                    //return access_token;
    
                }
            });

            
    
            insert_log_messages(MsgNO++, 'Info', ' End Fetching For CourseID-'+canvas_course_id) ;
            console.log("COurseID END - "+canvas_course_id);


        }
       // reject(AllCoursesfromCanvas);
       // callback(null, dataFromGetDataFunction) ;
       resolve(AllCoursesfromCanvas);
        console.log('END getAssignment_StudentsFromCanvas FUNCTION');
    })
}



// FUNCTION TO GET ALL COURSES FROM LO
function get_all_courses_from_LO(access_token_from_lo) {

    insert_log_messages(MsgNO++, 'Info', 'Start Fetching Courses from LO') ;

    return new Promise(function (resolve, reject) {
        request({
            url: LO_URL+'api/v2/courses;limit=100;offset=0',
            auth: {
                'bearer': access_token_from_lo
            }
            }, function(err, res, body) {
                
                if (err) {
                    console.log("ERROR IN FETCH COURSE FROM LO: "+err);
                    insert_log_messages(MsgNO++, 'Error', 'Error In Fetching Courses from LO - '+err) ;
                    reject(err);
                    }  
                else{
                    
                    var json = JSON.parse(res.body);
                    var Courses_from_LO = json.objects;
                    //console.log("Courses from LO:", Courses_from_LO);
                    insert_log_messages(MsgNO++, 'Success', Courses_from_LO.length+' Courses Fetched from LO') ;
                    resolve(Courses_from_LO);
                    //return access_token;

                }
        });
    })
}

// FUNCTION TO FETCH GRADEBOOK FROM LO BY COURSEID
function get_score_for_courses_LO(Courses_from_LO) {
    console.log('IN get_score_for_courses_LO');


    return new Promise(function (resolve, reject) {


        for(var cn=0; cn<Courses_from_LO.length; cn++){

            var LO_Course_id = Courses_from_LO[cn].id.toString() ;
            var LO_Course_Name = Courses_from_LO[cn].courseName ;

            console.log("SENd - "+LO_Course_id);
           
            insert_data_to_csv_import_table(LO_Course_id, LO_Course_Name) ;

            setTimeout(function() {
                console.log("SENd - "+LO_Course_Name);
                 }, 1000);
        
            
        }

      // callback();
      setTimeout(function() {
        resolve('1');
         }, 5000);
       // resolve('1');


    })
}


function insert_data_to_csv_import_table(param_course_id, param_course_name)
{
    console.log("GOT - "+param_course_id);
    console.log("GOT - "+param_course_name);

    var gradebook_data = { 
        "userOrder": [
            { "property": "familyName", "direction": "ASC" },
            { "property": "givenName", "direction": "ASC" }
        ],  
        "userAttributes": [ "familyName", "givenName", "emailAddress" ],
        "categoryAverage": false
    }
    
    request({
        url: LO_URL+'api/v2/contexts/'+param_course_id+'/gradebook/export',
        method: 'POST',
        auth: {
                'bearer': access_token
                },
        json: gradebook_data
                    
        }, function(errAPI, resAPI) {

            if (errAPI) {
                console.log("ERROR IN FETCH GRADEBOOK = "+errAPI);
                insert_log_messages(MsgNO++, 'Error', 'Error In Fetching GRADEBOOK from LO - '+errAPI) ;
                reject(errAPI);
            }  
            else{
                        
                
               // console.log(resAPI.body);
                
                var grade_array =  new CSV(resAPI.body, { cast: false } ).parse();
               // console.log(grade_array);

                for(var gn=2; gn<grade_array.length; gn++ )
                {
                    var LO_student_family_name = grade_array[gn][0];
                    var LO_student_given_name = grade_array[gn][1];
                    var LO_student_email_id = grade_array[gn][2];

                    //console.log(LO_student_family_name);
                    // console.log(LO_student_given_name);
                    // console.log(LO_student_email_id);
                // console.log(uuidv1());
                    for(var as=3; as<grade_array[1].length; as++ ){

                        var p_id = uuidv1();
                        var insert_time = getCurrentDateTime();
                        var assignment_name = grade_array[1][as].trim();
                        var assignment_mark = grade_array[gn][as].toString();

                        var last4Assign = assignment_name.slice(-4);

                        // console.log("Check INSERT Val");
                        // console.log(p_id);
                        // console.log(assignment_name);
                        //  console.log("GOT - "+param_course_id);
                        //  console.log("GOT - "+param_course_name);
                        // console.log(LO_student_email_id);
                        // console.log(LO_student_family_name);
                        // console.log(LO_student_given_name);
                        // console.log(assignment_mark);
                        // console.log(insert_time);
                        // console.log(Batch_NO);

                    if(assignment_mark != '' && last4Assign != '(NC)')
                    {
                        var dynamodb = new AWS.DynamoDB();
                        var params = {
                                TableName:"int_lo_canvas_student_list_from_csv_import",
                                Item:{
                                    id : { S:p_id},
                                    Assign_Name : { S:assignment_name},
                                    CourseId : { S:param_course_id},
                                    CourseName : { S:param_course_name},
                                    Email_Address : { S:LO_student_email_id},
                                    Family_Name : { S:LO_student_family_name},
                                    Given_Name : { S:LO_student_given_name},
                                    Mark : { S:assignment_mark},
                                    InserTime : { S:insert_time},
                                    Batch: { S:Batch_NO},
                                    Update_satatus: { S:"Insert_from_LO"}
                                }
                            };
                            
                        dynamodb.putItem(params, function(err, data) {
                            //console.log("ERROR = "+ err);
                            if(err)
                            {
                            console.log(param_course_id+" - COURSEID Not Inserted to LO student GradeBook table - "+ err);
                                insert_log_messages(MsgNO++, 'Error', ' Not Inserted to LO student GradeBook table COURSEID - '+param_course_id+' - '+err) ;
                                
                            }
                            //console.log("DATA = "+ data);
                        });
                    }

                    }
                    
                    
                }
                
            }


    });

}



function update_marks_to_Canvas(dataFromLOCourseInsert)
{
    console.log("IN UPDATE FUNCTION START");
    // FETCH ALL ROWS FROM LO TABLE
    var docClient = new AWS.DynamoDB.DocumentClient();
        

    // Batch_NO =  "fde4fac0-d4e9-11e7-9469-a10e37cfef3a";
    var params = {
        TableName: "int_lo_canvas_student_list_from_csv_import",
        FilterExpression: "#Batch_Name = :BatchNO",
        ExpressionAttributeNames: {
            "#Batch_Name": "Batch",
        },
        ExpressionAttributeValues: { ":BatchNO": Batch_NO}
    
    };   

    console.log(Batch_NO);
    docClient.scan(params, function(err, data) {
        if (err) {
            console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
           // console.log("GetItem succeeded:", JSON.stringify(data, null, 2));
          // var all_rows = JSON.parse(data);
           var all_rows = data;
           
            async.forEachOf(all_rows.Items, function (one_row, i, callback) {
              var  no_of_row = i;
              var Course_name_from_LOtable = one_row.CourseName;
              var id_from_LOtable = one_row.id;
              var email_from_LOtable = one_row.Email_Address;
              var assign_from_LOtable = one_row.Assign_Name;
              var score_from_LOtable = one_row.Mark;
              
                console.log(Course_name_from_LOtable);

                // CHECK COURSE IN CANVAS COURSE TABLE
                var params_for_course_canvas = {
                    TableName: "int_lo_canvas_courses_from_canvas",
                    FilterExpression: "#Batch_Name = :BatchNO and #Course_Name = :Course_Name",
                    ExpressionAttributeNames: {
                        "#Batch_Name": "Batch",
                        "#Course_Name": "name"
                    },
                    ExpressionAttributeValues: { ":BatchNO": Batch_NO, ":Course_Name":  Course_name_from_LOtable }
                };
                docClient.scan(params_for_course_canvas, function(err, dataCanvas) {
                    if (err) {
                        console.error("Unable to read item from Canvas Course Table. Error JSON:", JSON.stringify(err, null, 2));
                    } else {  
                        console.log(dataCanvas);
                        if(dataCanvas.Items != ''){
                            var got_canvas_courseID = dataCanvas.Items[0].courseid ;
                            

                            // Check For StudentID
                            var params_for_student_canvas = {
                                TableName: "int_lo_canvas_students_from_canvas",
                                FilterExpression: "#Batch_Name = :BatchNO and #studentEmail = :studentEmail",
                                ExpressionAttributeNames: {
                                    "#Batch_Name": "Batch",
                                    "#studentEmail": "login_id"
                                },
                                ExpressionAttributeValues: { ":BatchNO": Batch_NO, ":studentEmail":  email_from_LOtable }
                            };
                            docClient.scan(params_for_student_canvas, function(err, dataCanvasStudent) {
                                if (err) {
                                    console.error("Unable to read item from Canvas Student Table. Error JSON:", JSON.stringify(err, null, 2));
                                } else { 
                                    console.log(dataCanvasStudent);
                                    
                                    if( dataCanvasStudent.Items != ''){
                                        var get_Canvas_student_ID = dataCanvasStudent.Items[0].enrollid
                                        console.log("To update student ID"+get_Canvas_student_ID) ;

                                        // Check Canvas ASSIGNMENT ID
                                        console.log("CHECK ASSIGNMENT - "+assign_from_LOtable)

                                        var params_for_assign_canvas = {
                                            TableName: "int_lo_canvas_assignments_of_course_from_canvas",
                                           // FilterExpression: "#Batch_Name = :BatchNO AND #Course_id = :Course_id AND name CONTAINS :Assign_Name",
                                           FilterExpression: 'contains (#Assign_Name, :Assign_Name) and #Batch_Name = :Batch_Name AND #Course_id = :Course_id',
                                            ExpressionAttributeNames: {
                                                "#Batch_Name": "Batch",
                                                "#Course_id": "courseid",
                                                "#Assign_Name": "name"
                                            },
                                            ExpressionAttributeValues: { ":Assign_Name":  assign_from_LOtable, ":Batch_Name":  Batch_NO, ":Course_id":  got_canvas_courseID }
                                        };
                                        docClient.scan(params_for_assign_canvas, function(err, dataCanvasAssign) {
                                            if (err) {
                                                console.error("Unable to read item from Assignment Table. Error JSON:", JSON.stringify(err, null, 2));
                                            } else {
                                                console.log("ASSIGNMENT - "+dataCanvasAssign)
                                                if(dataCanvasAssign.Items != ""){
                                                    console.log("To update Enroll ID"+get_Canvas_student_ID) ;
                                                    var get_Canvas_Assign_ID = dataCanvasAssign.Items[0].assignid
                                                    
                                                }
                                                else{
                                                    console.log("No AssignMent");
                                                    var get_Canvas_Assign_ID = create_assignment_in_Canvas(got_canvas_courseID, assign_from_LOtable, 100) ;
                                                }

                                                // UPDATE MARKS IN CANVAS
                                                update_marks_in_Canvas(got_canvas_courseID, get_Canvas_Assign_ID, get_Canvas_student_ID, score_from_LOtable)
                                                
                                                setTimeout(function() {
                                                    console.log("SEND TO UPDATE - ");
                                                     }, 1000);
                                            }
                                        });  

                                    }
                                    else{
                                        updateCsvTableStatus(id_from_LOtable, "Student Not Found", function(err, dataReturn) {console.log("updated to table - Student Not Found");});
                                    }


                                }
                            });


                        }
                        else{
                            updateCsvTableStatus(id_from_LOtable, "Course Not Found", function(err, dataReturn) {console.log("updated to table - Course Not Found");});
                        }

                    }          
                });

                callback();
            });


        }
    });

    console.log("IN UPDATE FUNCTION END");

} 

// FUNCTION TO CREATE ASSIGNMENTS IN CANVAS

function create_assignment_in_Canvas(CourseID, name, points_possible){
    
        console.log("In Update Mark PUT - CourseID"+CourseID+" - AssignID -"+AssignID+" - StudentID ="+StudentID+" Score - "+Score);
    
        var assignData = {
            "assignment[name]": name,
            "assignment[points_possible]": points_possible,
            "assignment[published]": true
        };
    
        request({
                url: Canvas_URL+"api/v1/courses/"+CourseID+"/assignments",
                method: 'POST',
                auth: {
                        'bearer': Canvas_Token
                    },
                form: assignData
            }, function(errAPI, resAPI) {
                if (errAPI) {
                    console.log("ERROR IN CREATING ASSIGNMENT TO CANVAS: "+errAPI);
                    insert_log_messages(MsgNO++, 'Error', 'Assignments not created in canvas - '+errAPI) ;
                    //reject(err);
                }  
                else{
                    
                    var json_create_assign = JSON.stringify(resAPI);
                   
                    console.log("Create Assignment Return - "+json_create_assign );
                    // resolve(json_update_mark);
                    return resAPI.id;
    
                }
    
            });
       
    }
    
// Function To update Marks in Canvas

function update_marks_in_Canvas(CourseID, AssignID, StudentID, Score){
    
        console.log("In Update Mark PUT - CourseID"+CourseID+" - AssignID -"+AssignID+" - StudentID ="+StudentID+" Score - "+Score);
    
        var scoreData = {
            "submission[posted_grade]": Score,
            "comment[text_comment]": 'AWS NODE'
        };
    
        request({
                url: Canvas_URL+"api/v1/courses/"+CourseID+"/assignments/"+AssignID+"/submissions/"+StudentID,
                method: 'PUT',
                auth: {
                        'bearer': Canvas_Token
                    },
                form: scoreData
            }, function(errAPI, resAPI) {
                if (errAPI) {
                    console.log("ERROR IN UPDATE MARK TO CANVAS: "+errAPI);
                    insert_log_messages(MsgNO++, 'Error', 'Marks not updates to canvas - '+errAPI) ;
                    //reject(err);
                }  
                else{
                    
                    var json_update_mark = JSON.stringify(resAPI);
                   
                    console.log("Update Marks Return - "+json_update_mark );
                    // resolve(json_update_mark);
                    //return access_token;
    
                }
    
        });
       
    }
    
        

// Function to update CSV table status
var updateCsvTableStatus = function(id_from_LOtable, status_val, callback) {
    var updateClient = new AWS.DynamoDB.DocumentClient();
    var params = {
        TableName:"int_lo_canvas_student_list_from_csv_import",
        Key: {
        id : id_from_LOtable
        },
        UpdateExpression: "set Update_satatus = :Update_satatus",
            ExpressionAttributeValues:{
                ":Update_satatus":status_val
            },
            ReturnValues:"Updated"
    };
    updateClient.update(params,callback);
}


// FUNCTION TO GET ACCESS TOKEN FROM LO
function get_access_token_LO(initialData) {

    insert_log_messages(MsgNO++, 'Info', 'Start Getting Access Token from LO') ;

    return new Promise(function (resolve, reject) { // START PROMISE TO WAIT NEXT FUNCTION
        request({ // CALL OAUTH API OF LO
            url: LO_URL+'oauth2/token?grant_type=client_credentials',
            method: 'POST',
            auth: { 
                user: 'grade-sync',
                pass: '3f7s-xnx9ydzm-uhdx'
            },
            form: {
                'grant_type': 'client_credentials'
            }
            }, function(err, res, body) { // CALLBACK FUNCTION TO HANDLE API RETURNS
                
                if (err) {
                    console.log("ERROR IN AUTH: "+err);
                    insert_log_messages(MsgNO++, 'Error', 'No Access Token from LO'+err) ;
                    reject(err);
                }  
                else{

                    var json = JSON.parse(res.body);
                    access_token = json.access_token;
                    insert_log_messages(MsgNO++, 'Success', 'Got Access Token from LO - '+access_token) ;
                    resolve(access_token);
;
                }
        });
    });

}




// FUNCTIONS TO INSERT ALL LOG MESSAGES
function insert_log_messages(msg_no_int, msg_type, msg_details)
{
    console.log('Log No '+msg_no_int+'-'+msg_details );

    var msg_id = uuidv1();
    var msg_insert_time = getCurrentDateTime();
    var msg_no = msg_no_int.toString();

    //console.log(" msg_id = "+ msg_id +" msg_insert_time = "+msg_insert_time);

    var dynamodb = new AWS.DynamoDB();
    var params = {
            TableName:"int_lo_canvas_err_msg_details",
            Item:{
                id : { S:msg_id},
                msg_no : { S:msg_no},
                msg_details : { S:msg_details},
                msg_type : { S:msg_type},
                msg_time : { S:msg_insert_time},
                msg_session: { S:Batch_NO}
            }
        };
     
    dynamodb.putItem(params, function(err, data) {

        if(err)
        {
            console.error("Not Inserted to log message table. Error JSON:", JSON.stringify(err, null, 2));
        }

    });
    
}

function getCurrentDateTime() {
    
    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;
    
}


