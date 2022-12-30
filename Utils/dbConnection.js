let pool = require('../config/database').pool;


const connection = () => {
    return new Promise((resolve, reject) => {
        pool.getConnection((error, tempConnection) => {
            console.info("All Connections", pool._allConnections.length);
            console.info("free Connections", pool._freeConnections.length);
            if(error)
               return reject(error);
            const query = (sqlQuery, bindParams) => {
                    return new Promise((resolve, reject) => {
                        tempConnection.query(sqlQuery, bindParams, (err, rows, fields) => {
                            if(err) return reject(err);
                            resolve(rows);
                        });
                    });
                };

            const releaseConnection = () => {
                return new Promise((resolve, reject) => {
                    if(error) return reject(error);
                    resolve(tempConnection.release());
                });
            };
            resolve({query, releaseConnection})
        });
    });
};



const query = (sql, binding) => {
    return new Promise((resolve, reject) => {
      pool.query(sql, binding, (err, result, fields) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  };

  

module.exports = {connection, query};