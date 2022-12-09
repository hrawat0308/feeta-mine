const axios = require("axios");
const express = require('express');
let { validationResult } = require('express-validator');
let snapshot;

//map initialization
const test = new Map();

const checkDependentOfArray = (arr) => {
    if(arr.length === 0 || (arr.length == 1 && arr[0] == "")){
        return true;
    }
    else{
        return false;
    }
}

const getSuccessorStartTime = (successorsID) => {
    return new Date(test.get(successorsID).start);
}

const getPredecessorDueTime = (predecessorID) => {
    return new Date(test.get(predecessorID).due);
}

const checkSuccessorTime = (curTask) => {
    let successors = [];
    let result = {
        status : 0,
        at: []
    }
    let timeObject = {
        P_ID : "",
        S_ID: "",
        P_date : "",
        S_date: ""
    }
    test.forEach((values, keys)=>{
        if(values.dependent_of > 0){
            if(values.dependent_of.includes(curTask)){
                successors.push(values.id);
            }
        }
    });

    for(let i = 0; i < successors.length; i++){
        let P_Date = getPredecessorDueTime(curTask); 
        let S_Date = getSuccessorStartTime(successors[i]);
        if( P_Date > S_Date){
            timeObject.P_ID = curTask;
            timeObject.S_ID = successors[i];
            timeObject.P_date = P_Date;
            timeObject.S_date = S_Date;
            result.at = [...result.at, timeObject];
        }
    }

    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
    
}

const checkForSubtaskandDependency = () => {
    let result = {
        status: 0,
        at : []
    }
    test.forEach((values,keys)=>{
        if(values.subtasks == 0 && checkDependentOfArray(values.dependent_of) && values.is_milestone == false ){
            result.at = [...result.at, { id: values.id, name : values.name}]
        }
    });
    const firstTask = findTask1();
    result.at = result.at.filter((obj)=>{
        return (obj.id !== firstTask.id)
    });

    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
}

const findTask1 = (tasks) => {
    let [firstValue] = test.values();
    let firstTask = new Date(firstValue.start);
    let task1 = {
        id : firstValue.id,
        name: firstValue.name
    }
    test.forEach((values, keys)=>{
        if(new Date(values.start) < firstTask && values.subtasks == 0){
            firstTask = new Date(values.start);
            task1 = {
                id : values.id,
                name: values.name
            }
        }
    });
    return task1;
}

const checkUsersArray = (arr) => {
    if(arr.length == 0 || (arr.length == 1 && arr[0] == null)){
        return true;
    }
    else{
        return false;
    }
}

const checkAssignees = () => {       
    let result = {
        status: 0,
        at : []
    }
    test.forEach((values,keys)=>{
        if(values.subtasks == 0 && checkUsersArray(values.users) && values.is_milestone == false ){
            result.at = [...result.at, { id: values.id, name : values.name}]
        }
    });
    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
}

const overduecheck = () => {
    let result = {
        status: 0,
        at : []
    }
    const today = new Date();
    // console.log(new Date(today.getFullYear(),today.getMonth(),today.getDate()));
    test.forEach((values, keys)=>{
        if(new Date(values.due) < new Date(today.getFullYear(),today.getMonth(),today.getDate()) && (values.completed == "" || values.completed == false) && values.progress != "100%"){
            let users = values.users.map((user)=>{
                return {
                    user_id : user?.user_id,
                    id: user?.id,
                    name: user?.name,
                    email: user?.email
                }
            });
            result.at = [...result.at, {
                id: values.id,
                name: values.name,
                users : users 
            }];
        }
    });
    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
}

const checkEH_AH = (taskIDs) => {
    let result = {
        status: 0,
        at : []
    }
    for(let i = 0; i < taskIDs.length ; i++){
        const data = test.get(taskIDs[i]);
        if(data.estimated_hours == "" || data.actual_hours == ""){
            result.at = [...result.at, { id: data.id, name : data.name}];
        }
    }
    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
}

const descriptionCheck = (taskIDs) => {
    let result = {
        status: 0,
        at : []
    }
    for(let i = 0; i < taskIDs.length ; i++){
        const data = test.get(taskIDs[i]);
        if(data.notes.length < 5){
            result.at = [...result.at, { id: data.id, name : data.name}];
        }
    }
    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
}

const findTaskwithId = (taskID, foundTasks) => {
    for(let i = 0; i < foundTasks.length; i++){
        if(foundTasks[i].id == taskID){
            return foundTasks[i];
        }
    }
}

const taskinformationcompletenesscheck = () => {
    let result = {
        status: 0,
        error: "",
        at : []  
    }
    //check has atleast 1 assignee - check1
    //check EH and AH both filled out - check 2
    //has at least one predecesor and successor - check 3
    //description is atleast 5 chars in length - check 4
    let subtasksIDs = [...test.keys()];
    // const check1 = checkAssignees();
    const check2 = checkEH_AH(subtasksIDs);
    // const check3a = checkForSubtaskandDependency();
    // const check3b = checkSubtasksDate(subtasksIDs);
    const check4 = descriptionCheck(subtasksIDs);
    // if(check1.status == 0){
    //     result.at.push({
    //         error : "A task must have an assignee!!!",
    //         at : [...check1.at]
    //     });
    // }
    if(check2.status == 0){
        result.at.push({
            error: "A task must have estimate hours and actual hours!!!!",
            at: [...check2.at]
        });
    }
    // if(check3a.status == 0){
    //     result.at.push({
    //         error: "A task must always have a predecessor and successor!!!",
    //         at : [...check3a.at]
    //     });
    // }
    // if(check3b.status == 0){
    //     result.at.push({
    //         error: "Successor must always start after the predecessor due date!!!",
    //         at : [...check3b.at]
    //     });
    // }
    if(check4.status == 0){
        result.at.push({
            error: "Every task must have a description atleast 5 chars long!!!",
            at: [...check4.at]
        });
    }
    // for(let i = 0; i < subtasksIDs.length ; i++){
    //     if(check1.status == 0){
    //         const errorInTask = findTaskwithId(subtasksIDs[i], check1.at);
    //         result.error = "A task must have an assignee!!!";
    //         result.at = [...result.at,{id: errorInTask.id, name: errorInTask.name}];
    //         return result;
    //     }
    //     else if(check2.status == 0){
    //         const errorInTask = findTaskwithId(subtasksIDs[i], check2.at);
    //         result.error = "A task must have estimate hours and actual hours!!!!";
    //         result.at = [{id: errorInTask.id, name: errorInTask.name}];
    //         return result;
    //     }
    //     else if(check3a.status == 0){
    //         const errorInTask = findTaskwithId(subtasksIDs[i], check3a.at);
    //         result.error = "A task must always have a predecessor and successor!!!";
    //         result.at = [{id: errorInTask.id, name: errorInTask.name}];
    //         return result;
    //     }
    //     else if(check3b.status == 0){
    //         const errorInTask = findTaskwithId(subtasksIDs[i], check3b.at);
    //         result.error = "Successor must always start after the predecessor due date!!!";
    //         result.at = [{id: errorInTask.id, name: errorInTask.name}];
    //         return result;
    //     }
    //     else if(check4.status == 0){
    //         const errorInTask = findTaskwithId(subtasksIDs[i], check4.at);
    //         result.error = "Every task must have a description atleast 5 chars long!!!";
    //         result.at = [{id: errorInTask.id, name: errorInTask.name}];
    //         return result;
    //     }
    // }

    if(result.at.length !== 0){
        return result;
    }
    result.status = 1;
    result.error = "No Error, Task information is complete!!";
    return result;
}

const checkSubtasksDate = (subtasksIDs) =>{
    let result = {
        status: 0,
        at: []
    };
    for(let i = 0; i < subtasksIDs.length; i++){
        const timeResult = checkSuccessorTime(subtasksIDs[i]);
        if(!timeResult.status){
            result.at = [...result.at, ...timeResult.at];
        }   
    }
    if(result.at.length == 0){
        result.status = 1;
    }
    return result;
}

async function fetchDataAsync(url) {
        const response = await axios.get(url);
        if(response){
            snapshot = await response.data;
            const {tasks, project} = snapshot;
            //map code
        
            tasks.forEach((task)=>{
        if(task.subtasks == 0 && task.is_milestone == false){
            if(!test.has(task.id)){
                test.set(task.id, task);
            }
        }
    });
        }
        else{
            throw new Error("Failed to load snapshot");
        }
    
}

const checkErrors = () => {
    // get subtasks object
    let subtasks = [...test.values()];

    // get subtasks ID
    let subtasksIDs = [...test.keys()];
    let result = {};
    let result1 = checkForSubtaskandDependency();
    let result2 = checkSubtasksDate(subtasksIDs);
    // let result3 = checkAssignees();
    // let result4 = overduecheck();
    result.hanging = result1;
    result.time = result2;
    // result.assignee = result3;
    // result.overduecheck = result4;
    return result;
}

const checkWarnings = () => {
    let result = {};
    let result3 = checkAssignees();
    let result4 = overduecheck();
    let result5 = taskinformationcompletenesscheck();
    result.assignee = result3;
    result.overdue = result4;
    result.taskInfo = result5;
    return result;
}

const checks =  async (req,res,next)=>{
    const validationError = validationResult(req);
    if (!validationError.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "snapshot date or snapshot url is not provided!!"
        });
    }
    //empty the map
    test.clear();
    try{
        await fetchDataAsync(req.body.snapshot_url+'.json');
    }
    catch(error){
        console.log(error);
        return res.status(500).json({
            status: 0,
            msg: "failed to load snapshot"
        });
    }
    
    let errors = checkErrors();  
    if(errors.hanging.status == 0 || errors.time.status == 0){
        return res.status(422).json(errors);
    }
    else{
        let warnings = checkWarnings();
        req.warnings = warnings;
        req.snapshot = snapshot;
        return next();
    }  
};

exports.checks = checks;