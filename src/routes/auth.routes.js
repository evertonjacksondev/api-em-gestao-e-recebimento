const express = require('express')
const User = require('../models/User.model')
const router = express.Router()

router.get('/login/auth', async (req, res) => {
  try {
 
    const user = await User.insertMany({
     
    })

    res.status(200).json(user)
  } catch (err) {
    res.status(400).json(err.message)
  }
})



module.exports = app => app.use('/', router)
