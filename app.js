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
app.use(morgan('tiny'));
app.use('/api',routes);

app.listen(process.env.PORT, ()=>{
    console.log(`Server running on port ${process.env.PORT}`);
});