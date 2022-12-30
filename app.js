const express = require("express");
require('dotenv').config();
const swaggerUI = require('swagger-ui-express');
const morgan = require('morgan');
const YAML = require('yamljs');
const swaggerJsDocs = YAML.load('./api.yaml');
let cors = require('cors');
const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(swaggerJsDocs));
morgan.token('id', function getId(req) {
    return req.id
  });
  
  morgan.token('req', function (req) {
    return JSON.stringify(req.body);
  });
  
  let loggerFormat = 'Logger --  :id [:date[web]] ":method :url" :status :response-time :req ';
  
  app.use(morgan(loggerFormat, {
    skip: (req, res) => {
      return res.statusCode >= 400
    },
    stream: process.stdout
  }));
  
  app.use(morgan(loggerFormat, {
    skip: (req, res) => {
      return res.statusCode < 400
    },
    stream: process.stderr
  }));

app.enable("trust proxy");
app.use('/api',routes);

app.use((req, res, next)=>{
    const error = new Error("Invalid Route");
    error.code = 404;
    return next(error);
});

app.use((err,req,res,next)=>{
    const error = err.message || "Something Went Wrong, Please try Again !!"
    const code = err.code || 502;
    res.status(code).json(error);
});

app.listen(process.env.PORT, ()=>{
    console.log(`Server running on port ${process.env.PORT}`);
});