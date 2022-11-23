const mongoose = require('mongoose')
require('dotenv').config()


const mongoConnect = async () => {
  const MONGO_URI =
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/em-recebimento'

  mongoose
    .connect(MONGO_URI)
    .then(x => {
      const databaseName = x.connections[0].name
      console.log(`Connected to Mongo! Database name: "${databaseName}"`)
    })
    .catch(err => {
      console.error('Error connecting to mongo: ', err)
    })
}

module.exports = mongoConnect
