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
var express = require('express');
var CSV = require('comma-separated-values');
const uuidv1 = require('uuid/v1');
var Promise = require('promise');
var async = require("async");

var router = express.Router();
var Redshift = require('node-redshift');


// SET REGION CONFIG
//AWS.config.update({region: 'us-east-1'});

// SET GLOBAL VARIABLES
var access_token = "";

var LO_URL = "" ;
var LO_USRID = "" ;
var LO_PASS = "" ;

var Canvas_URL = "" ;
var Canvas_Token = "";

var start_cours_no = 0;

var Batch_NO = uuidv1();
var MsgNO = 1;

var redshiftClient;
var options;
var res;

var clientConfiguration = {
    user: "karma",
    database: "lo2bb",
    password: "Arcman.1",
    port: 5439,
    host: "lo.cuj89sxvybd2.us-east-2.redshift.amazonaws.com",
  };
  


console.log('Loading function');
// START API FUNCTION handler. Run BY Default for AWS Lambda Function

exports.handler = (event, context, callback) => {

    LO_URL  = event.lourl;
    LO_USRID = event.louserid;
    LO_PASS = event.lopwd;
    
    Canvas_URL= event.canvasurl ;
    Canvas_Token= event.canvastoken;

    start_cours_no= event.start_cours_no;
    
    //callback(null, "LO_URL_GOT = "+LO_URL+" canvas_URL_GOT =  "+Canvas_URL+" EVENT = "+JSON.stringify(event));

    insert_log_messages(MsgNO++, 'Info', 'Start') ;
    
    // CONNECT TO REDSHIFT
    redshiftClient = new Redshift(clientConfiguration);
    options = {raw: true};

    
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
        console.log("Canvas_URL = "+Canvas_URL);
        console.log("Canvas_Token = "+Canvas_Token);

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

                // CONNECT TO REDSHIFT
               // redshiftClient = new Redshift(clientConfiguration);
              //  options = {raw: true};
                var no_of_course_canvas = 1;
                // INSERT INTO CANVAS COURSE TABLE BY LOOP
                async.forEachOf(Courses_from_Canvas, function (one_course, i, callback) {
                  
                    var p_id = uuidv1();
                    var insert_time = getCurrentDateTime();

                    var canvas_course_id = one_course.id.toString();
                    var canvas_course_name = one_course.name;

                    var queryStr = "INSERT INTO int_lo_canvas_courses_from_canvas (canvas_course_name, canvas_course_id, upload_session)  VALUES ( '"+canvas_course_name+"', '"+canvas_course_id+"', '"+Batch_NO+"' );"
                   

                    // execute query and invoke callback...
                    redshiftClient.query(queryStr, options, function(error, result) {
                        if(error)
                        {
                            var errMsg = "Error Code: " + error.code + " ; Error Severity: " + error.severity + "; Message: " + error.message;
                            //console.log (errMsg)
                            insert_log_messages(MsgNO++, 'Error', 'Could not insert into int_lo_canvas_courses_from_canvas. Error return from DB = '+errMsg) ;
                           // reject(errMsg);
                        }
                        else{
                            no_of_course_canvas = no_of_course_canvas+1;
                        }

                    });
                
                    callback();

                });

                insert_log_messages(MsgNO++, 'Success', no_of_course_canvas+' - Courses Inserted to Canvas Course table (int_lo_canvas_courses_from_canvas) ') ;
                
                resolve(Courses_from_Canvas);
                //return access_token;

            }
        });


    })
}


// FUNCTION TO GET ALL THE ACCESSMENT and STUDENTS BY COURSES FROM CANVAS
function getAssignment_StudentsFromCanvas(AllCoursesfromCanvas) {

    
    insert_log_messages(MsgNO++, 'Info', 'Start Fetching Accessment and Students from Canvas') ;

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
    

                    var no_of_assignment_canvas = 1;
                    // INSERT INTO CANVAS ASSIGNMENTS TABLE BY LOOP
                    async.forEachOf(Assignments_from_Canvas_by_Course, function (one_assingment, i, callback) {
                  
                        var canvas_assign_id = one_assingment.id.toString();
                        var canvas_assign_name = one_assingment.name;
                        var canvas_assign_course_id = one_assingment.course_id.toString();

                        var queryStr = "INSERT INTO int_lo_canvas_assignments_of_course_from_canvas (course_id, assign_id, assign_name, upload_session)  VALUES ( '"+canvas_assign_course_id+"', '"+canvas_assign_id+"', '"+canvas_assign_name+"', '"+Batch_NO+"' );"
                    

                        // execute query and invoke callback...
                        redshiftClient.query(queryStr, options, function(error, result) {
                            if(error)
                            {
                                var errMsg = "Error Code: " + error.code + " ; Error Severity: " + error.severity + "; Message: " + error.message;
                                //console.log (errMsg)
                                insert_log_messages(MsgNO++, 'Error', 'Could not insert into int_lo_canvas_assignments_of_course_from_canvas. Error return from DB = '+errMsg) ;
                            // reject(errMsg);
                            }
                            else{
                                no_of_assignment_canvas = no_of_assignment_canvas+1;
                            }

                        });
                    
                        callback();

                    });


                insert_log_messages(MsgNO++, 'Success', no_of_assignment_canvas+' - Assignments Inserted to Canvas Assignment table (int_lo_canvas_assignments_of_course_from_canvas) ') ;
    
                    
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
    
                    var no_of_students_canvas = 1;
                    // INSERT INTO CANVAS STUDENT TABLE BY LOOP
                    async.forEachOf(Students_from_Canvas_by_Course, function (one_student, i, callback) {
                  
                        var canvas_student_id = one_student.user.id.toString();
                        var canvas_student_name = one_student.user.name;
                        var canvas_student_email = one_student.user.login_id;
                        var canvas_student_courseid = one_student.course_id.toString();


                        var queryStr = "INSERT INTO int_lo_canvas_students_from_canvas (course_id, student_id, student_name, student_email, upload_session) VALUES ( '"+canvas_student_courseid+"', '"+canvas_student_id+"', '"+canvas_student_name+"', '"+canvas_student_email+"', '"+Batch_NO+"' );"
                        // execute query and invoke callback...
                        redshiftClient.query(queryStr, options, function(error, result) {
                            if(error)
                            {
                                var errMsg = "Error Code: " + error.code + " ; Error Severity: " + error.severity + "; Message: " + error.message;
                                //console.log (errMsg)
                                insert_log_messages(MsgNO++, 'Error', 'Could not insert into int_lo_canvas_students_from_canvas. Error return from DB = '+errMsg) ;
                            // reject(errMsg);
                            }
                            else{
                                no_of_students_canvas = no_of_students_canvas+1;
                            }

                        });
                    
                        callback();

                    });


                insert_log_messages(MsgNO++, 'Success', no_of_students_canvas+' - Students Inserted to Canvas Student table (int_lo_canvas_students_from_canvas) ') ;



    
                }
            });

            
    
            insert_log_messages(MsgNO++, 'Info', ' End Fetching Assignments and Students For CourseID-'+canvas_course_id) ;


        }
       // reject(AllCoursesfromCanvas);
       // callback(null, dataFromGetDataFunction) ;

       insert_log_messages(MsgNO++, 'Info', 'End of Fetching All Assignments and Students from Canvas') ;
       resolve(AllCoursesfromCanvas);
    })
}



// FUNCTION TO GET ALL COURSES FROM LO
function get_all_courses_from_LO(access_token_from_lo) {

    insert_log_messages(MsgNO++, 'Info', 'Start Fetching Courses from LO') ;

    return new Promise(function (resolve, reject) {
        request({
            url: LO_URL+'api/v2/courses;limit=100;offset='+start_cours_no,
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
          // if(LO_Course_id == "360943816")
          // {
            insert_data_to_csv_import_table(LO_Course_id, LO_Course_Name) ;
         //  }

            
        }

      // callback();
      setTimeout(function() {
        resolve('1');
         }, 1000);
       // resolve('1');


    })
}


function insert_data_to_csv_import_table(param_course_id, param_course_name)
{

    
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
                //console.log("ERROR IN FETCH GRADEBOOK = "+errAPI);
                insert_log_messages(MsgNO++, 'Error', 'Error In Fetching GRADEBOOK from LO - '+JSON.stringify(errAPI)) ;
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
                        if(assignment_name == '')
                            assignment_name = 'NULL'
                        if(LO_student_email_id == '')
                            LO_student_email_id = 'NULL'
                        if(LO_student_family_name == '')
                            LO_student_family_name = 'NULL'
                        if(LO_student_given_name == '')
                            LO_student_given_name = 'NULL'

                    if(assignment_mark != '' && last4Assign != '(NC)')
                    {
                        
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
                            
                        insert_into_db(params) ;
                    }

                    }
                    
                    
                }
                
            }


    });

}

function insert_into_db(table_param)
{
    var dynamodb = new AWS.DynamoDB();
    dynamodb.putItem(table_param, function(err, data) {
        //console.log("ERROR = "+ err);
        if(err)
        {
            insert_log_messages(MsgNO++, 'Error', " Not Inserted to  table ("+ table_param.TableName+") - ERROR === "+ err+"   PARAMETERE ==="+ JSON.stringify(table_param));

        }
        //console.log("DATA = "+ data);
    });
}

function update_marks_to_Canvas(dataFromLOCourseInsert)
{
   var no_of_assignment_update = 0;
    console.log("IN UPDATE FUNCTION START");
return new Promise(function (resolve, reject) {
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
              
              //  console.log(Course_name_from_LOtable);

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
                        //console.log(dataCanvas);
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
                                    //console.log(dataCanvasStudent);
                                    
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
                                               // console.log("ASSIGNMENT GOT FROM TABLE - "+dataCanvasAssign)
                                                if(dataCanvasAssign.Items != ""){
                                                 //   console.log("To update Enroll ID"+get_Canvas_student_ID) ;
                                                    var get_Canvas_Assign_ID = dataCanvasAssign.Items[0].assignid

                                                    // UPDATE MARKS IN CANVAS
                                                    update_marks_in_Canvas(got_canvas_courseID, get_Canvas_Assign_ID, get_Canvas_student_ID, score_from_LOtable)
                                                    
                                                }
                                                else{
                                                    console.log("No AssignMent FOUND FOR NAME == "+assign_from_LOtable);
                                                    var get_Canvas_Assign_ID = create_assignment_in_Canvas(got_canvas_courseID, assign_from_LOtable, 100, get_Canvas_student_ID, score_from_LOtable) ;
                                                }

                                                
                                                
                                               
                                                no_of_assignment_update = no_of_assignment_update+1;
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

            resolve(no_of_assignment_update+" - Assignnents Updated.") ;
        }
    });

    console.log("IN UPDATE FUNCTION END");
   
    
});
} 

// FUNCTION TO CREATE ASSIGNMENTS IN CANVAS

function create_assignment_in_Canvas(CourseID, name, points_possible, get_Canvas_student_ID, score_from_LOtable){
    
        console.log("START CREATE ASSIGNMENT - CourseID"+CourseID+" - AssignmentNAME -"+name+"  Score - "+points_possible);

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
            }, function(errAPI, resAPI, body) {
                if (errAPI) {
                    console.log("ERROR IN CREATING ASSIGNMENT TO CANVAS: "+errAPI);
                    insert_log_messages(MsgNO++, 'Error', 'Assignments not created in canvas - '+errAPI) ;
                    //reject(err);
                }  
                else{
                    
                    var json_create_assign = JSON.parse(resAPI.body);
                   
                    console.log("Create Assignment Return - "+json_create_assign  );
                    console.log("Create Assignment ID  - "+json_create_assign.id  );
                    // resolve(json_update_mark);
                    
                    // UPDATE MARKS IN CANVAS
                    update_marks_in_Canvas(CourseID, json_create_assign.id, get_Canvas_student_ID, score_from_LOtable);

                    return json_create_assign.id;
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
                user: LO_USRID,
                pass: LO_PASS
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
                    if(res.statusCode == 200){
                        var json = JSON.parse(res.body);
                        access_token = json.access_token;
                        insert_log_messages(MsgNO++, 'Success', 'Got Access Token from LO - '+access_token) ;
                        resolve(access_token);
                    }
                    else{
                        reject('Status Code = '+res.statusCode);

                    }
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
            //console.log("ERROR = "+ err);
            if(err)
            {
                console.log( " Not Inserted to  table ("+ params.TableName+") - ERROR === "+ err+"   PARAMETERE ==="+ JSON.stringify(params));
    
            }
            //console.log("DATA = "+ data);
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


