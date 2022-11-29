const cors = require('cors')
const express = require('express')
const app = express()
const mongoConnect = require('./db/mongo')
const compression = require('compression')

app.use(compression())
app.use(cors())
app.use(express.json())

mongoConnect()

app.use(function (req, res, next) {
  for (let key in req.query) {
    req.query[key.toLowerCase()] = req.query[key]
  }

  for (let key in req.headers) {
    req.headers[key.toLowerCase()] = req.headers[key]
  }
  next()
})

app.use(require('./src/middlewares/auth.middlewares'))

const controller = require('./src/routes')
controller(app)

const port = 2560
app.listen(port)

console.log('Servidor rodando na porta: ', port)
