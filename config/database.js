require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    connectionLimit: process.env.CONNECTION_LIMIT,
    multipleStatements: true
});

pool.getConnection((err, conn)=>{
  if(err){
    console.log("check if database is connected:", err);
  }
  else{
    console.log("finally connected to database!!");
  }
  
});
module.exports.pool = pool;