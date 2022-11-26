const { Router } = require('express')
const Home = require('../models/Home.model')
const router = Router()

router.get('/', async (req, res) => {
  try {
    const home = await Home.find()

    res.status(200).json(home)
  } catch (error) {
    res.status(400).json()
  }
})

router.post('/', async (req, res) => {
  try {
    const { phoneNumber, name, category } = req.body

    if (!phoneNumber || !name || !category) {
      res.status(400).json({ message: 'Missing information' })
      return
    }
    const insertId = await Home.insertMany({ phoneNumber, name, category })

    res.status(200).json(insertId)
  } catch (error) {
    res.status(400).json(error.message)
  }
})

router.put('/', async (req, res) => {
  try {
    const { _id, phoneNumber, name, category } = req.body

    if (!phoneNumber || !name || !category) {
      res.status(400).json({ message: 'Missing information' })
      return
    }
    const insertId = await Home.updateOne(
      { _id },
      { phoneNumber, name, category },
      { upsert: false }
    )

    res.status(200).json(insertId)
  } catch (error) {
    res.status(400).json()
  }
})

router.delete('/:_id', async (req, res) => {
  try {
    const { _id } = req.params
    if (!_id) throw 'resident ID is required!'
    const deleteId = await Home.deleteOne({ _id })
    res.status(200).json(deleteId)
  } catch (error) {
    res.status(400).json(error)
  }
})

module.exports = app => app.use('/home', router)
