const express = require('express')
const router = express.Router()

router.get('/teste', async (req, res) => {
  try {
    let db = req.mongoConnection

    res.status(200).json()
  } catch (err) {
    res.status(400).json()
  }
})

module.exports = app => app.use('/v1', router)
