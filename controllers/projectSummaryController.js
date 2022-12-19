const express = require('express');
let mysql = require('../Utils/dbConnection');
let { validationResult } = require('express-validator');


//**Controller Functions */

//get all the project
const allProjects = async (req, res, next) => {
    let tempConnection;
    try{
        tempConnection = await mysql.connection();
        const projects = await tempConnection.query(`select DISTINCT gantt_chart.project_name, gantt_chart.project_uid from gantt_chart`);
        await tempConnection.releaseConnection();
        return res.status(200).json({ status: 1, projects });
    } 
    catch (error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
      
}

// get snapshot date of that project id from above api
// same api for getting compare to dates
const snapshotDates = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "project ID is not provided!!"
        });
    }
    const project_id = req.params.id;
    let tempConnection;
    try{
        tempConnection = await mysql.connection();
        // const snapshot_dates = await tempConnection.query(`SELECT DISTINCT snapshot_date FROM gantt_chart WHERE project_uid='${project_id}'`);
        const snapshot_dates = await tempConnection.query(`select distinct DATE_FORMAT(snapshot_date, "%Y-%m-%d") as snapshot_date from gantt_chart where project_uid = '${project_id}';`);
        let snapshotDates = [];
        for(let i = 0; i < snapshot_dates.length; i++){
            snapshotDates.push({
                snapshot_date: new Date(snapshot_dates[i].snapshot_date).toISOString().substring(0,10)
            });
        }
        await tempConnection.releaseConnection();
        return res.status(200).json({ status: 1, snapshotDates });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

// get all the contributors
const taskContributors = async (req, res, next) => {
    let tempConnection;
    try {
        tempConnection = await mysql.connection();
        const contributors = await tempConnection.query(`select user_name, user_id from user_mapping`);
        await tempConnection.releaseConnection();
        return res.status(200).json({ status: 1, contributors });
    } 
    catch (error) {
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

// get latest project summary i.e of latest snapshot
const loadLatestProjectSummary = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "Project ID is not provided!!"
        });
    }
    let tempConnection;
    const project_id = req.query.project_id;
    let snapshot_date;
    try{
        tempConnection = await mysql.connection();
        
        //get latest snapshot date 
        snapshot_date = await tempConnection.query(`select DATE_FORMAT(MAX(snapshot_date), "%Y-%m-%d") as snapshot_date from project_master where project_id='${project_id}';`);
        snapshot_date = snapshot_date[0].snapshot_date;

        // find progress
        const progress_res = await tempConnection.query(`select sum(progress) as currProgress, COUNT(*) as total_progress from gantt_chart where project_uid = '${project_id}' and snapshot_date = '${snapshot_date}'`);
        const progress = parseInt(Math.round(progress_res[0].currProgress / progress_res[0].total_progress));

        // time elapsed
        const projectDates = await tempConnection.query(`select DATE_FORMAT(min(start_date), "%Y-%m-%d") as start_date, DATE_FORMAT(MAX(end_date), "%Y-%m-%d") as due_date, DATE_FORMAT(snapshot_date, "%Y-%m-%d") as curr_date from gantt_chart where project_uid = '${project_id}' and snapshot_date='${snapshot_date}';`);
        const start_date = new Date(projectDates[0].start_date);
        const due_date = new Date(projectDates[0].due_date);
        const curr_date = new Date(projectDates[0].curr_date);
        const total_days_assigned = diffDays(due_date, start_date)+1;
        const total_days_elapsed = diffDays(curr_date, start_date)+1;
        const timeElapsed = parseInt(Math.ceil((total_days_elapsed / total_days_assigned) * 100));
        
        //expected end date
        let days_left = diffDays(due_date, curr_date)+1;
        if(curr_date > due_date){
            days_left = -days_left;
        }
        let expected_end = { days_left, expected_end_date: getFormattedDate(due_date)};
        
        //overdue tasks
        let overdue_tasks_data = await tempConnection.query(`select task_id, task_title, DATE_FORMAT(end_date,"%Y-%m-%d") as end_date, assignees from gantt_chart where project_uid = '${project_id}' and snapshot_date='${snapshot_date}' and snapshot_date > end_date and completed is false and is_milestone is false and is_parent is false;`);
        for(let i = 0; i < overdue_tasks_data.length; i++){
            overdue_tasks_data[i].deadline = getFormattedDate(new Date(overdue_tasks_data[i].end_date));
            let assignee_names = [];
            overdue_tasks_data[i].delay_days = diffDays(new Date(snapshot_date), new Date(overdue_tasks_data[i].end_date)); 
            const assignees = JSON.parse(overdue_tasks_data[i].assignees);
            for(let j = 0; j < assignees.length; j++){
                const user_names = await tempConnection.query(`select user_name from user_mapping where user_id = '${assignees[j]}'`);
                if(user_names.length != 0){
                    assignee_names.push(user_names[0].user_name);
                }
            }
            overdue_tasks_data[i].assigned_to = assignee_names.join(", ");
            delete overdue_tasks_data[i].assignees;
            delete overdue_tasks_data[i].end_date;
        }

        //milestones
        let milestone_task = await tempConnection.query(`SELECT task_id, task_title, DATE_FORMAT(end_date, "%Y-%m-%d") as end_date, completed FROM gantt_chart WHERE is_milestone is true and project_uid = '${project_id}' and snapshot_date = '${snapshot_date}' order by end_date;`);
        for(let i = 0; i < milestone_task.length; i++){
            milestone_task[i].deadline = getFormattedDate(new Date(milestone_task[i].end_date));
            if(new Date(milestone_task[i].end_date) >= new Date(snapshot_date)){
                milestone_task[i].status = "Upcoming";
            }
            else{
                milestone_task[i].status = !milestone_task[i].completed ? "Not Completed" : "Completed"; 
            }
            delete milestone_task[i].completed;
            delete milestone_task[i].end_date;
        }

        //notes 
        let notes = await tempConnection.query(`select id, note, DATE_FORMAT(createdAt, "%d-%b-%Y %l:%i %p") as created_at from project_notes where project_id='${project_id}';`);


        await tempConnection.releaseConnection();
        res.json({
            project_details: {  project_id, snapshot_date, compare_to: "", progress, timeElapsed, bufferUsed: 0, expected_end   },
            overdue_tasks_data,
            milestone_task,
            notes
        });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}


// get project summary by comparing two snapshots of a project 
const projectSummary = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "Project ID , snapshot date, compare to date not provided!!"
        });
    }
    let tempConnection;
    const project_id = req.query.project_id;
    const snapshot_date = req.query.snapshot_date;
    const compare_to = req.query.compare_to;
    
    if (isSameDay(new Date(snapshot_date), new Date(compare_to))) {
        return res.status(200).json({ status: 0, message: "SAME_DATES_NOT_COMPARABLE" });
    }

    try{
        tempConnection = await mysql.connection();
        
        //progress
        const progress_res = await tempConnection.query(`select sum(progress) as currProgress, COUNT(*) as total_progress from gantt_chart where project_uid = '${project_id}' and snapshot_date = '${snapshot_date}'`);
        const progress = parseInt(Math.round(progress_res[0].currProgress / progress_res[0].total_progress));

        //days elapsed
        const projectDates = await tempConnection.query(`select min(start_date) as start_date, MAX(end_date) as due_date, snapshot_date as curr_date from gantt_chart where project_uid = '${project_id}' and snapshot_date='${snapshot_date}'`);
        const start_date = new Date(projectDates[0].start_date);
        const due_date = new Date(projectDates[0].due_date);
        const curr_date = new Date(projectDates[0].curr_date);

        const diff_time_assigned = Math.abs(due_date - start_date);
        const diff_time_elapsed = Math.abs(curr_date - start_date);

        const total_days_assigned = Math.ceil(diff_time_assigned / (1000 * 60 * 60 * 24));
        const total_days_elapsed = Math.ceil(diff_time_elapsed / (1000 * 60 * 60 * 24));
        const timeElapsed = parseInt(Math.ceil((total_days_elapsed / total_days_assigned) * 100));
        //days left for delivery
        const diff_time_left = Math.abs(due_date - curr_date);
        const days_left = Math.ceil(diff_time_left / (1000 * 60 * 60 * 24));

        let ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(due_date);
        let mo = new Intl.DateTimeFormat('en', { month: 'short' }).format(due_date);
        let da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(due_date);

        const expected_end_date = `${da}-${mo}-${ye}`;
        let expected_end = { days_left, expected_end_date };

        //overdue tasks
        let overdue_tasks_data;
        overdue_tasks_data = await tempConnection.query(`select task_id, task_title, end_date, assignees from gantt_chart  where project_uid = '${project_id}' and snapshot_date='${snapshot_date}' and snapshot_date > end_date and completed=0;`);
        
        for (var i = 0; i < overdue_tasks_data.length; i++) {
            //this is dummy delay days, later compute the delay days here
            overdue_tasks_data[i].delay_days = 2;
            let assignee_names = [];
            const assignee = JSON.parse(overdue_tasks_data[i].assignees);
            // console.log(assignee);
            for (var j = 0; j < assignee.length; j++) {
                const user_names = await tempConnection.query(`select user_name from user_mapping where user_id = '${assignee[j]}'`);
                if (!(user_names[0] == null)) {
                    assignee_names.push(user_names[0].user_name);
                    // console.log(assignee_names)
                }
                else {
                    assignee_names.push("NA");
                }
            }
            overdue_tasks_data[i]["assignee_names"] = assignee_names;
        }

        //milestone tasks
        let milestone_task = await tempConnection.query(`SELECT task_id, task_title, end_date FROM gantt_chart WHERE is_milestone = 1 and completed = 0 and project_uid = '${project_id}' and snapshot_date = '${snapshot_date}' order by end_date`);
        let is_delayed;
        let nextMilestoneIn;
        let flag = 0;

        for (var i = 0; i < milestone_task.length; i++) {
            let x = new Date(milestone_task[i].end_date);
            let y = new Date(milestone_task[i].CURRENT_DATE);
            if (y < x && flag == 0) {
                nextMilestoneIn = diffDays(y, x);
                flag = 1;
            }
            else if ((y == x) && flag == 0) {
                const next_endDate = milestone_task[i + 1].end_date;
                nextMilestoneIn = diffDays(next_endDate, y);
                flag = 1;
            }
            if (x < y) {
                is_delayed = 1;
            }
            else if (x > y) {
                is_delayed = 0;
            }
            milestone_task[i]["is_delayed"] = is_delayed;
        }

        // * rework*/
        // const rework = await query(`select count(*) as total_rework from gantt_chart where task_type='rework' and project_uid='${project_id}' and snapshot_date = '${snapshot_date}'`)
        // let total_rework = rework[0].total_rework;

        // delta goal end date
        let del_goal_end
    
        const goal_curr_snapshot = await tempConnection.query(`select max(end_date) as curr_end from gantt_chart where snapshot_date='${snapshot_date}' and project_uid = '${project_id}'`);
        const goal_compare_snapshot = await tempConnection.query(`select max(end_date) as prev_end from gantt_chart where snapshot_date='${compare_to}' and project_uid = '${project_id}'`);
        del_goal_end = diffDays(goal_curr_snapshot[0].curr_end, goal_compare_snapshot[0].prev_end);
        

        await tempConnection.releaseConnection();

        //delta next milestone
        res.status(200).json(
            { project_id, snapshot_date, compare_to, progress, timeElapsed, bufferUsed: 0, 
              expected_end, del_goal_end, delNextMilestone: "", delBuffeLastWeek: "", 
              delTotalRework: "", delReworkLastWeek: "", overdue_tasks_data, milestone_task, nextMilestoneIn 
            });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

//return task details
const taskDetails = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "Project ID, snapshot date are not provided!!"
        });
    }
    let tempConnection;
    const project_id = req.query.project_id;
    const snapshot_date = req.query.snapshot_date;
    try{
        tempConnection = await mysql.connection();
        let task_details = await tempConnection.query(`SELECT gantt_chart.project_name, gantt_chart.project_uid, gantt_chart.uid, gantt_chart.task_title, gantt_chart.start_date, gantt_chart.end_date, gantt_chart.task_type, user_mapping.user_name FROM gantt_chart INNER JOIN user_task_map ON gantt_chart.project_uid=user_task_map.project_id and gantt_chart.uid = user_task_map.task_uid and gantt_chart.snapshot_date = user_task_map.snapshot_date INNER JOIN user_mapping on user_task_map.assignee_id = user_mapping.user_id and gantt_chart.snapshot_date='${snapshot_date}' and gantt_chart.project_uid = '${project_id}'`);
        if(task_details.length == 0){
            let task_details_without_assignees = await tempConnection.query(`SELECT gantt_chart.project_name, gantt_chart.project_uid, gantt_chart.uid,
            gantt_chart.task_title, gantt_chart.start_date, gantt_chart.end_date, 
            gantt_chart.task_type
            FROM gantt_chart INNER JOIN user_task_map ON gantt_chart.project_uid=user_task_map.project_id 
            and gantt_chart.uid = user_task_map.task_uid 
            and gantt_chart.snapshot_date = user_task_map.snapshot_date
            and gantt_chart.is_Parent = false and gantt_chart.is_milestone = false 
            and gantt_chart.snapshot_date='${snapshot_date}' and gantt_chart.project_uid = '${project_id}';`);
        
            task_details = task_details_without_assignees.map((task)=>{
                task.user_name = "NA"
                return task;
            });
            // return res.status(200).json({ status: 1, task_details_without_assignees });
        }
        res.status(200).json({ status: 1, task_details });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

// returns contributor details based on project ID, contributor ID
const contributorDetail = async (req, res, next) =>{
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "Project ID, contributor Id,snapshot date, compare to date are not provided!!"
        });
    }
    let tempConnection;
    const project_id = req.query.project_id;
    const contributor_id = req.query.contributor_id;
    const snapshot_date = req.query.snapshot_date;
    const compare_to = req.query.compare_to;
    try{
        tempConnection = await mysql.connection();
        const contributorData = await tempConnection.query(`SELECT gantt_chart.project_name, gantt_chart.project_uid, gantt_chart.uid, gantt_chart.task_title, gantt_chart.start_date, gantt_chart.end_date, gantt_chart.task_type, gantt_chart.progress, user_mapping.user_name FROM gantt_chart INNER JOIN user_task_map ON gantt_chart.project_uid=user_task_map.project_id and gantt_chart.uid = user_task_map.task_uid and gantt_chart.snapshot_date = user_task_map.snapshot_date INNER JOIN user_mapping on user_task_map.assignee_id = user_mapping.user_id and user_task_map.assignee_id = '${contributor_id}' and gantt_chart.snapshot_date='${snapshot_date}' and gantt_chart.project_uid = '${project_id}'`);
        for (var i = 0; i < contributorData.length; i++) {
            //three option for task status ON_TIME, LATE, OVERDUE
            let task_status = "ON_TIME";
            if ((new Date(contributorData[i].end_date) < new Date(snapshot_date)) && (contributorData[i].progress < 100)) {
              task_status = "OVERDUE";
            }
            else {
                const compare_data = await tempConnection.query(`select * from gantt_chart where uid = '${contributorData[i].uid}' and snapshot_date = '${compare_to}' and project_uid = '${project_id}' and end_date < '${new Date(contributorData[i].end_date).toISOString().substring(0,10)}' and completed = 1`);
                compare_data.length > 0 ? task_status = "LATE" : task_status = "ON_TIME"; 
            }
            contributorData[i]["task_status"] = task_status;
            // contributorData[i]["crr_end"] = compare_data[i].end_date;
        }
        
        await tempConnection.releaseConnection();
        res.status(200).json({ status: 1, complianceScore: "", productivityScore: "", timelinessScore: "", contributorData });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

const performanceMetrics = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "project Id, snapshot date, baseline date are not provided!!"
        });
    }
    let tempConnection;
    const project_id = req.query.project_id;
    const snapshot_date = req.query.snapshot_date;
    const baseline_date = req.query.baseline_date;
    try{
        tempConnection = await mysql.connection();
        const basedata_query = await tempConnection.query(`select task_id, uid,on_cp, task_title, DATE_FORMAT(start_date,"%Y-%m-%d") as start_date, DATE_FORMAT(end_date,"%Y-%m-%d") as end_date, DATE_FORMAT(snapshot_date,"%Y-%m-%d") as snapshot_date from gantt_chart where snapshot_date = '${baseline_date}' and is_parent = 0  order by start_date`);
        const actdata_query = await tempConnection.query(`select task_id, uid,on_cp, task_title, DATE_FORMAT(start_date,"%Y-%m-%d") as start_date, DATE_FORMAT(end_date,"%Y-%m-%d") as end_date, DATE_FORMAT(snapshot_date,"%Y-%m-%d") as snapshot_date from gantt_chart where snapshot_date = '${snapshot_date}' and is_parent = 0  order by start_date`);
        const basedata = JSON.parse(JSON.stringify(basedata_query));
        const actdata = JSON.parse(JSON.stringify(actdata_query));
        const delayArray = [];
        const baselineData = [];
        for (var i = 0; i < basedata.length; i++) {
            baselineData.push(basedata[i]);
        }
        for (var i = 0; i < actdata.length; i++) {
            delayArray.push(actdata[i]);
        }
        
        //compare the act data array with the base data array and enter the base data end date to delayarray and also the additional task added in between the actual new snapshot
        for (var i = 0; i < actdata.length; i++) {
            for (var j = 0; j < basedata.length; j++) {
                if (actdata[i].uid == basedata[j].uid) {
                    delayArray[i]["base_end_date"] = basedata[j].end_date;
                }
            }
        }
        let diffAEBE;
        let numOfNonWorkingDays;
        for (var i = 0; i < delayArray.length; i++) {
            if (delayArray[i].base_end_date) {
                diffAEBE = diffDays_inPerformance(new Date(delayArray[i].end_date), new Date(delayArray[i].base_end_date));
                numOfNonWorkingDays = checkWeekends(new Date(delayArray[i].start_date), new Date(delayArray[i].end_date));
                // console.log(diffAEBE);
                delayArray[i]["AEsubBE"] = diffAEBE;
                delayArray[i]["predec_delay"] = 0;
                delayArray[i]["net_delay"] = 0;
                delayArray[i]["num_of_nonWorkingDays"] = numOfNonWorkingDays;
                delayArray[i]["user_delay"] = [];
            }
            else {
                delayArray[i]["base_end_date"] = "NA";
                diffAEBE = 0
                // console.log(diffAEBE)
                delayArray[i]["AEsubBE"] = diffAEBE;
                delayArray[i]["predec_delay"] = 0;
                delayArray[i]["net_delay"] = 0;
                delayArray[i]["user_delay"] = [];
            }
        }
        let delayedArr = delayArray.sort((a, b) => Date.parse(new Date(a.start_date)) - Date.parse(new Date(b.start_date)));
        let baselineDataArr = baselineData.sort((a, b) => Date.parse(new Date(a.start_date)) - Date.parse(new Date(b.start_date)));
        let dpdMapping = [];
        const dpdtask = await tempConnection.query(`select gantt_uid, dpd_uid from depends_on_map where snapshot_date = '${snapshot_date}'`);
        for (var i = 0; i < dpdtask.length; i++) {
            let dpd = [];
            dpd.push(dpdtask[i].gantt_uid);
            dpd.push(dpdtask[i].dpd_uid);
            dpdMapping.push(dpd);
        }
        let dpdMappingBaseline = [];
        const dpdtask_baseline = await tempConnection.query(`select gantt_uid, dpd_uid from depends_on_map where snapshot_date = '${baseline_date}'`);
        for (var i = 0; i < dpdtask_baseline.length; i++) {
            let dpd = [];
            dpd.push(dpdtask_baseline[i].gantt_uid);
            dpd.push(dpdtask_baseline[i].dpd_uid);
            // dpd.set(dpdtask_baseline[i].gantt_uid, dpdtask_baseline[i].dpd_uid)
            dpdMappingBaseline.push(dpd);
        }

        for (var i = 0; i < dpdMapping.length; i++) {
            let pred_task_uid = dpdMapping[i][1];
            let successor_uid = dpdMapping[i][0];;
      
            //search for the pred task in delayedArr
            let pred_task_data = delayedArr.find(e => {
                if (e.uid == pred_task_uid) {
                    let new_predec_uid;
                    if (e.base_end_date == "NA") {
                    //successor = dpdmapping[i][0] find the predecessor of the successor in dpdMappingof Baseline data, we will get new_predec_uid, search the new one in delayed array and do operation jus like for normal tasks  */
                    let predecessor_delay = 0;
                        for (var k = 0; k < dpdMappingBaseline.length; k++) {
                            if (successor_uid == dpdMappingBaseline[k][0]) {
                                new_predec_uid = dpdMappingBaseline[k][1];
                                delayedArr.find(a => {
                                    if (a.uid == new_predec_uid) {
                                        let predDelay = diffDays(new Date(e.end_date), new Date(a.base_end_date))
                                        predecessor_delay = Math.max(predDelay, predecessor_delay);
                                    }
                                });
                                
                                delayedArr.find(b => {
                                    if (b.uid == successor_uid) {
                                        b.predec_delay = predecessor_delay;
                                        b.net_delay = b.AEsubBE - b.predec_delay - b.num_of_nonWorkingDays
                                    }
                                });
                            }
                        }
                    }
                    else {
                        let predecessor_delay = 0;
                        let predDelay = diffDays(new Date(e.end_date), new Date(e.base_end_date));
                        predecessor_delay = Math.max(predDelay, predecessor_delay);
                        console.log(predecessor_delay);
                        console.log(e.task_title);
                        delayedArr.find(b => {
                            if (b.uid == successor_uid) {
                                console.log(b.task_title);
                                b.predec_delay = predecessor_delay;
                                b.net_delay = b.AEsubBE - b.predec_delay - b.num_of_nonWorkingDays;
                            }
                        });
                    }
                }
            });
        }

        let non_critical_tasks_result = await tempConnection.query(`select uid as task_id from gantt_chart where project_uid = '${project_id}' and snapshot_date='${snapshot_date}' and on_cp is false`);
        let non_critical_tasks = non_critical_tasks_result.map((non_critical_task)=>{
            return non_critical_task.task_id;
        });

        //making all non-critical tasks net delay as 0
        for(let i = 0; i < delayedArr.length; i++){
            if(non_critical_tasks.includes(delayArray[i].uid)){
                delayArray[i].net_delay = 0;
            }
        }
        let user_delay = [];
        for (var i = 0; i < delayedArr.length; i++) {
            let res = await tempConnection.query(`select user_id,user_name from user_mapping where user_id in (select assignee_id from user_task_map where task_uid = '${delayedArr[i].uid}' and snapshot_date='${snapshot_date}') and user_project_id = '${project_id}' `);
            if (res.length > 0) {
                let userNetDelay = [];
                userNetDelay.push(res[0].user_id);
                userNetDelay.push(res[0].user_name);
                userNetDelay.push(delayedArr[i].net_delay);
                user_delay.push(userNetDelay);
                delayArray[i]["user_delay"].push({
                    user_id : res[0].user_id,
                    user_name: res[0].user_name,
                    user_net_delay : delayedArr[i].net_delay
                });
            }
        }
        console.log("This is user delay", user_delay);
        res.json({ msg: "done", basedata, actdata, delayedArr, dpdMapping, dpdMappingBaseline, user_delay});
        await tempConnection.releaseConnection();
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

const addNote = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "project Id and note are not provided!!"
        });
    }
    let tempConnection;
    const { project_id, note } = req.body;
    const val = [];
    val.push([project_id, note]);
    try{
        tempConnection = await mysql.connection();
        await tempConnection.query('INSERT INTO project_notes(project_id, note) VALUES ?', [val]);
        await tempConnection.releaseConnection();
        return res.status(201).json({ status: 1, message: "note created" }); 
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

const getNote = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "project Id is not provided !!"
        });
    }
    let tempConnection;
    let project_id = req.params.id;
    try{
        tempConnection = await mysql.connection();
        const notes = await tempConnection.query(`select project_id, note, createdAt from project_notes where project_id = '${project_id}'`);
        await tempConnection.releaseConnection();
        res.status(200).json({ status: 1, notes });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}

const deleteSnapshot = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 0,
            msg: "project ID or Snapshot Date not provided!!"
        });
    }
    const project_id = req.query.project_id;
    const snapshot_date = req.query.snapshot_date;
    let tempConnection;
    try{
        tempConnection = await mysql.connection();
        // let query = ``;
        // await tempConnection.query(query);
        await tempConnection.releaseConnection();
        res.json({
            status: 1,
            msg: "Dummy function"
        });
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" });
    }
}


//**Helper Functions */
const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth();
}

//x-max date , y-min date
const diffDays = (max_date, min_date)=>{
  const timeDiff = Math.abs(max_date - min_date);
  const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  return dayDiff;
}

const diffDays_inPerformance = (max_date, min_date) =>{
    const timeDiff = max_date - min_date;
    const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    return dayDiff
}

// get this from database or somewhere else as this is diff for diff projects
//This is DUMMY, later get it from payload
const working_days = {
    "0": false,
    "1": true,
    "2": true,
    "3": true,
    "4": true,
    "5": true,
    "6": false
}

//dates array from payload, DUMMY
const payload_dates = [
    {
        "name": "Shiv's vacation",
        "start": "2022-07-28",
        "end": "2022-08-18",
        "id": "3IdPDQyxRIB3P4GwTLcd",
        "is_holiday": true,
        "disabled": false,
        "user_id": "sHrvocS1DHZL4ss1h9xA"
    },
    {
        "name": "Guru Nanak Jayanti",
        "start": "2022-10-15",
        "end": "2022-10-17",
        "id": "eB5kOMfDZiQxnPFHFRCB",
        "is_holiday": true,
        "disabled": false,
        "user_id": false
    }
];

const checkWeekends = (start_date, end_date)=>{
    let count = 0;
    let loop = new Date(start_date);
    while(loop <= end_date){
        //checking if any day b/w start and end date was a weekend ????

        //simply checking if the day was saturday or sunday
        // if(loop.getDay() == 6 || loop.getDay() == 0){
        //     count++;
        // }
        
        //checking if it was a working day or not by comparing dates from working_day object from JSON payload
        if(!working_days[loop.getDay()]){
            count++;
        }

        // check if any date b/w start and end date was a company holiday ???
        for(let i = 0; i < payload_dates.length; i++){
            if(payload_dates[i]["user_id"] == false){
                if(payload_dates[i]["start"] == loop.getFullYear()+"-"+(loop.getMonth()+1)+"-"+loop.getDate()){   
                    let numOfDays = numOfCompanyHoliday(new Date(payload_dates[i]["start"]), new Date(payload_dates[i]["end"]));
                    count += numOfDays;
                }
            }
        }
        let newDate = loop.setDate(loop.getDate()+1);
        loop = new Date(newDate);
    }
    return count;
}

const numOfCompanyHoliday = (start_date, end_date) => {
    let count = 0;
    let loop = new Date(start_date);
    while(loop <= end_date){
        count++;
        let newDate = loop.setDate(loop.getDate()+1);
        loop = new Date(newDate);
    }
    return count;
}

const getFormattedDate = (date) => {
    let ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date);
    let mo = new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
    let da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date);
    return `${da}-${mo}-${ye}`; 
}

exports.allProjects = allProjects;
exports.snapshotDates = snapshotDates;
exports.taskContributors = taskContributors;
exports.projectSummary = projectSummary;
exports.taskDetails = taskDetails;
exports.contributorDetail = contributorDetail;
exports.performanceMetrics = performanceMetrics;
exports.addNote = addNote;
exports.getNote = getNote;
exports.loadLatestProjectSummary = loadLatestProjectSummary;
exports.deleteSnapshot = deleteSnapshot;