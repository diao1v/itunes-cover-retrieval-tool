// Setup Express
const express = require("express");
const app = express();
const port = 8000;

// Setup Handlebars
const handlebars = require("express-handlebars");
app.engine(
  "handlebars",
  handlebars({
    defaultLayout: "main",
  })
);
app.set("view engine", "handlebars");

// Setup body-parser
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: false }));

const cookieParser = require("cookie-parser"); 
app.use(cookieParser());

// Make the "public" folder available statically
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

const route = require("./routes/route");
app.use(route);

//connect database with mongoose
const mongoose = require("mongoose");
const dbURL = "Your mongoDB URL";
mongoose.connect(dbURL, {useNewUrlParser:true, useUnifiedTopology: true})
    .then((result) => app.listen(port, function() {
        console.log(`app listening on port ${port}!`);
        })
    )
    .catch((err) => console.log(err))


