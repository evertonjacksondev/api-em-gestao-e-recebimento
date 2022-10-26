const cors = require('cors')
const express = require('express')
const app = express()
const mongoConnect = require('./db/mongo')
const xmlparser = require('express-xml-bodyparser')
const fileUpload = require('express-fileupload')
const compression = require('compression')

app.use(compression())
app.use(cors())
app.use(fileUpload())
app.use(express.json())
app.use(xmlparser({ trim: false, explicitArray: false }))

let mongoConnection = mongoConnect()

app.use(async (req, res, next) => {
  req.mongoConnection = await mongoConnection
  next()
})

app.use(function (req, res, next) {
  for (var key in req.query) {
    req.query[key.toLowerCase()] = req.query[key]
  }

  for (var key in req.headers) {
    req.headers[key.toLowerCase()] = req.headers[key]
  }
  next()
})

let controller = require('./src/routes')
controller(app)

const port = 2540
app.listen(port)

console.log('Servidor rodando na porta: ', port)
