const express = require('express');
const morgan = require('morgan');
const http = require('http');
const cors = require('cors');
const app = express();
const env = require('./config/env');
var cookieParser = require("cookie-parser");
const jwt = require('jsonwebtoken')
var authController = require("./routes/auth-controller");
const path = require('path');
const { userModel, complainModel, organizationModel } = require('./model/index');


const multer = require("multer");

const storage = multer.diskStorage({ // https://www.npmjs.com/package/multer#diskstorage
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, `${new Date().getTime()}-${file.filename}.${file.mimetype.split("/")[1]}`)
    }
})
var upload = multer({ storage: storage })

var socketIo = require("socket.io");
const PORT = 5000 || process.env.PORT;

const server = http.createServer(app);
var io = socketIo(server);

app.use("/", express.static(path.resolve(path.join(__dirname, "./uploads"))));

io.on('connection', () => {
    console.log('socket connected');
})

app.use(morgan('dev'));
app.use(cors({
    origin: ["http://localhost:3000", 'https://envycle.herokuapp.com', "http://localhost"],
    credentials: true,
}));
app.use(cookieParser())
app.use(express.json());


app.use('/auth', authController);


app.use(function (req, res, next) {
    if (!req.cookies.jToken) {
        res.status(401).send("include http-only credentials with every request")
        return;
    }
    jwt.verify(req.cookies.jToken, env.SERVER_SECRET, function (err, decodedData) {
        if (!err) {
            const issueDate = decodedData.iat * 1000; // 1000 miliseconds because in js ms is in 16 digits
            const nowDate = new Date().getTime();
            const diff = nowDate - issueDate; // 86400,000

            if (diff > 30000000) { // expire after 5 min (in milis)
                res.clearCookie('jToken');
                res.status(401).send("token expired")
            }
            else {
                var token = jwt.sign({
                    id: decodedData.id,
                    username: decodedData.name,
                    email: decodedData.email,
                    role: decodedData.role,
                    name: decodedData.name,
                    // phoneNumber: decodedData.phoneNumber,
                    // gender: decodedData.gender,
                    // age: decodedData.age,
                }, env.SERVER_SECRET)
                res.cookie('jToken', token, {
                    maxAge: 86_400_000,
                    httpOnly: true
                });
                req.body.jToken = decodedData;
                req.headers.jToken = decodedData;
                next();
            }
        } else {
            res.status(401).send("invalid token")
        }
    });
})




app.get("/profile", (req, res, next) => {
    userModel.findById(req.body.jToken.id, "name email role",
        function (err, doc) {
            if (!err) {
                res.send({
                    profile: doc
                })
            } else {
                res.status(500).send({
                    message: "server error"
                })
            }
        })
});


app.post('/register-organization', (req, res) => {
    if (!req.body.name || !req.body.location) {
        return res.send(`
        please send following in JSON body
        e.g
        {
            "name" : "organization-name",
            "location" : "location"
        }
        `)
    }
    organizationModel.findOne({ name: req.body.name }, (err, organization) => {
        if (organization) {
            return res.status(400).send({
                message: "organization already exists"
            })
        } else {
            organizationModel.create({
                name: req.body.name,
                location: req.body.location,
                image: req.body.image
            }).then(organization => {
                return res.status(200).send({
                    organization,
                    message: 'organization registered succesfully'
                })
            }).catch(err => {
                return res.status(500).send({
                    message: 'an error occurred'
                })
            })
        }
    })
})


app.get('/organization', (req, res) => {
    organizationModel.find({}, (err, organization) => {
        if (!err) {
            return res.status(200).send({
                message: 'All organizations feteched',
                organization,
            })
        } else {
            return res.status(400).send({
                message: 'Error occoured',
            })
        }
    })
})

app.post('/complain', upload.any(), (req, res, next) => {

    let body = JSON.parse(req.body.dataa);

    userModel.findOne({ email: req.headers.jToken.email }, (err, user) => {
        if (!err) {
            organizationModel.findOne({ name: body.organization.name }, (err, organization) => {
                if (organization) {
                    complainModel.create({
                        email: body.anonymous ? 'anonymous' : req.headers.jToken.email,
                        name: body.anonymous ? 'anonymous' : req.headers.jToken.name,
                        organizationName: body?.organization.name,
                        locationText: body.locationText,
                        image: req.files[0]?.filename,
                        remarks: body?.message,
                        status: 'pending',
                        latitude: body?.latitude,
                        longitude: body?.longitude,
                        altitude: body?.altitude,
                        // phoneNumber: req.body.jToken.phoneNumber,
                    }).then((complain) => {
                        io.emit("complain", {
                            complain,

                        });
                        return res.status(200).send({
                            message: "Your complain has been placed successfully",
                            complain: complain,
                        });
                    })
                        .catch((err) => {
                            res.status(500).send({
                                message: "an error occured"
                            })
                        })
                } else {
                    res.status(400).send({
                        message: "organization does not exist"
                    })
                }
            })

        }
    })


})


app.get('/complain', (req, res) => {
    userModel.findOne({ email: req.body.jToken.email }, (err, user) => {
        if (user) {
            complainModel.find({ email: req.body.jToken.email }, (err, complain) => {
                if (!err) {
                    return res.status(200).send({
                        complain,
                        message: "complain got succesfully"
                    })
                }
            })
        } else {
            return res.status(403).send({
                message: "no user"
            })
        }
    })
})

app.get('/all-complains', (req, res) => {
    complainModel.find({}, (err, complain) => {
        if (!err) {
            return res.status(200).send({
                message: 'All Complains feteched',
                complain,
            })
        } else {
            return res.status(400).send({
                message: 'Error occoured',
            })
        }
    })
})

app.get('/my-complains', (req, res) => {
    complainModel.find({ email: req.body.jToken.email }, (err, complain) => {
        if (!err) {
            console.log('found')
            return res.status(200).send({
                message: 'All Complains feteched',
                complain,
            })
        } else {
            console.log('not found')
            return res.status(400).send({
                message: 'Error occoured',
            })
        }
    })
})



// Admin

app.post('/update-request', (req, res) => {
    complainModel.findOne({ _id: req.body.id }, (err, complain) => {
        complain.updateOne({ status: req.body.status }, (err, updated) => {
            if (!err) {
                io.emit('complain', 'complainupdated')
                res.status(200).send({
                    message: 'Request updated successfully'
                })
            }
            else {
                res.status(500).send({
                    message: 'server error'
                })
            }
        })
    })
})


app.post('/delete-complain', (req, res, next) => {

    if (!req.body.id) {
        return res.status(403).send(`
            please send email and password in json body
            e.g:
            {
                id: '123465'
            }
         `)
    }
    complainModel.findOne({ _id: req.body.id, email: req.body.jToken.email }, (err, complain) => {
        if (!err) {
            complain.remove()
            io.emit('complain', '')
            return res.status(200).send({
                message: 'complain deleted'
            })
        }
        else {
            res.status(403).send({
                message: 'complain not found'
            })
        }
    })
})


app.post('/logout', (req, res) => {

    res.clearCookie('jToken');
    res.send({
        message: 'logout succesfully'
    })
})



server.listen(PORT, () => {
    console.log('server is listetning on PORT : ' + PORT);
})





