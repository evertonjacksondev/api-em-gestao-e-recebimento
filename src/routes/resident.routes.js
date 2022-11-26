const { Router } = require('express')
const Resident = require('../models/Resident.model')
const router = Router()

router.get('/', async (req, res) => {
  try {
    const residents = await Resident.find()

    res.status(200).json(residents)
  } catch (error) {
    res.status(400).json(error)
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, torre, numero, phoneNumber, document } = req.body

    if ((!name || !torre, !numero || !phoneNumber || !document)) {
      res.status(400).json({ message: 'Missing information' })
      return
    }

    const insertId = await Resident.insertMany({
      name,
      torre,
      numero,
      phoneNumber,
      document
    })
    res.status(200).json(insertId)
  } catch (error) {
    res
      .status(400)
      .json(error.message)
  }
})

router.put('/', async (req, res) => {
  try {
    const { name, torre, numero, phoneNumber, document } = req.body
    if ((!name || !torre, !numero || !phoneNumber || !document)) {
      res.status(400).json({ message: 'Missing information' })
      return
    }

    const insertId = await Resident.updateOne(
      { torre, numero, name },
      { torre, numero, phoneNumber, document },
      { upsert: false }
    )
    res.status(200).json(insertId)
  } catch (error) {
    res.status(400).json(error)
  }
})

router.delete('/:_id', async (req, res) => {
  try {
    const { _id } = req.params
    if (!_id) throw 'resident ID is required!'

    const deleteId = await Resident.deleteOne({ _id })
    res.status(200).json(deleteId)
  } catch (error) {
    res.status(400).json(error)
  }
})

module.exports = app => app.use('/resident', router)
