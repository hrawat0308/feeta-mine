let mysql = require('../Utils/dbConnection');

function BellmanFord(graph)
{
    const distance_list = create_distance_list_map(graph);
    console.log(distance_list);
    const path = new Map([
        [graph[0][0],[graph[0][0]]]
    ]);

  for(let i = 0; i < graph.length; i++){
    let distance = distance_list.get(graph[i][0]) + graph[i][2];
    if( distance < distance_list.get(graph[i][1]) ){
        distance_list.set(graph[i][1], distance);

        if(!path.has(graph[i][0])){
            let pathstring = graph[i][0].toString() + graph[i][1].toString();
            let arr = [pathstring];
            path.set(graph[i][1], arr);
        }
        else{
            let arr = path.get(graph[i][0]);
            let latestPath = arr[arr.length-1];
            path.set(graph[i][1], [latestPath+"-"+graph[i][1].toString()]);
        }

    }
  }

  const path_array = path.get(graph[graph.length-1][1])[0].split("-");
  const path_days = distance_list.get(graph[graph.length-1][1]);
  console.log(path_array);
  console.log(distance_list);
  return [path_days, path_array];
}
 

const criticalPath = async (req, res, next) => {
    const project_id = req.query.project_id;
    const snapshot_date = req.query.snapshot_date;
    let tempConnection;
    let tasks;
    try{
        tempConnection = await mysql.connection();
        let tasks_query = `SELECT gantt_chart.project_name, gantt_chart.project_uid,  
        gantt_chart.uid as task_id, dom.dpd_uid, gantt_chart.task_title, DATE_FORMAT(gantt_chart.start_date,"%Y-%m-%d") as start_date, 
        DATE_FORMAT(gantt_chart.end_date,"%Y-%m-%d") as end_date
        FROM gantt_chart  
        inner join depends_on_map dom on gantt_chart.uid = dom.gantt_uid
        and  gantt_chart.snapshot_date='${snapshot_date}' and dom.snapshot_date='${snapshot_date}'
        and gantt_chart.project_uid = '${project_id}' and is_parent is false 
        and is_milestone is false order by start_date;
        `;
        let milestone_query = `SELECT gantt_chart.project_name, gantt_chart.project_uid,  
        gantt_chart.uid as task_id, dom.dpd_uid, gantt_chart.is_milestone,gantt_chart.task_title, DATE_FORMAT(gantt_chart.start_date,"%Y-%m-%d") as start_date, 
        DATE_FORMAT(gantt_chart.end_date,"%Y-%m-%d") as end_date
        FROM gantt_chart  
        inner join depends_on_map dom on gantt_chart.uid = dom.gantt_uid
        and  gantt_chart.snapshot_date='${snapshot_date}' and dom.snapshot_date='${snapshot_date}'
        and gantt_chart.project_uid = '${project_id}' and is_parent is false 
        and is_milestone is true order by start_date;
        `;
        tasks = await tempConnection.query(tasks_query);
        milestones = await tempConnection.query(milestone_query);
        let graph;
        graph = create_graph(tasks, milestones);
        console.log(graph);
        const [path_days, path_array] =  BellmanFord(graph);
        let result = "start";
        for(let i = 0; i < path_array.length; i++){
            let [{task_title}] = await tempConnection.query(`select task_title from gantt_chart where uid = '${path_array[i]}';`);
            result = result + " -> " + task_title;
        }
        result = result + " -> end";
        let [{project_start, project_end}] = await tempConnection.query(`select DATE_FORMAT(MIN(start_date), "%Y-%m-%d") as project_start,
                                    DATE_FORMAT(MAX(end_date), "%Y-%m-%d") as project_end from gantt_chart 
                                    where project_uid = '${project_id}' and snapshot_date = '${snapshot_date}';`);        
        


        res.json({criticalPath: {
            path : result,
            slack : diffDays(new Date(project_start), new Date(project_end))+1 + path_days,
            project_duration: diffDays(new Date(project_start), new Date(project_end))+1,
            path_days,
            path_array 
        }});
    }
    catch(error){
        await tempConnection.releaseConnection();
        console.log(error);
        return res.status(500).json({ status: 0, message: "SERVER_ERROR" }); 
    }
}

//** Helper Functions */
const create_distance_list_map = (graph) => {
    const distance_list = new Map();
    distance_list.set(graph[0][0], 0);
    distance_list.set(graph[graph.length-1][1], 10000);
    for(let i = 0; i < graph.length; i++){
        if(!distance_list.has(graph[i][1])){
            distance_list.set(graph[i][1], 10000);
        }
    }
    return distance_list;
}


const working_days = {
    "0": false,
    "1": true,
    "2": true,
    "3": true,
    "4": true,
    "5": true,
    "6": false
}

const create_graph = (tasks, milestones) => {
    const graph =  tasks.map((task, index)=>{
        let duration = diffDays(new Date(task.end_date), new Date(task.start_date))+1;
        duration = duration;
        if(index == 0){
            let start = milestones.find((milestone)=>{
                return milestone.dpd_uid == ''
            });
            return [
                start.task_id,
                task.task_id,
                -duration
            ];
        }
        else{
            return [
                task.dpd_uid,
                task.task_id,
                -duration
            ];
        }
    });

    let end_milestone = milestones.filter((milestone)=>{
        return milestone.dpd_uid != '';
    });

    for(let i = 0; i < end_milestone.length; i++){
        graph.push([
            end_milestone[i].dpd_uid,
            end_milestone[i].task_id,
            0
        ]);
    }
    return graph;
}

const checkWeekends = (start_date, end_date)=>{
    let count = 0;
    let loop = new Date(start_date);
    while(loop <= end_date){
        //checking if it was a working day or not by comparing dates from working_day object from JSON payload
        if(!working_days[loop.getDay()]){
            count++;
        }
        let newDate = loop.setDate(loop.getDate()+1);
        loop = new Date(newDate);
    }
    return count;
}

const diffDays = (max_date, min_date)=>{
    const timeDiff = Math.abs(max_date - min_date);
    const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    const num_of_weekends = checkWeekends(min_date,max_date);
    return dayDiff - num_of_weekends;
}

exports.criticalPath = criticalPath;