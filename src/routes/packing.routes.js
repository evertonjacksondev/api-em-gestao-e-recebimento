const { Router } = require('express')
const Packing = require('../models/Packing.model')
const router = Router()

router.get('/', async (req, res) => {
  try {
    const packings = await Packing.find()

    res.status(200).json(packings)
  } catch (error) {
    res.status(400).json(error)
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) throw 'Encomenda ID is required!'
    const packings = await Packing.findOne({ _id: id })

    res.status(200).json(packings)
  } catch (error) {
    res.status(400).json(error)
  }
})

router.post('/', async (req, res) => {
  try {
    const {
      name,
      torre,
      numero,
      type,
      status,
      withDrawn,
      cadastradoPor
    } = req.body

    if ((!name || !torre, !type || !cadastradoPor)) {
      res.status(400).json({ message: 'Missing information' })
      return
    }

    const insertId = await Packing.insertMany({
      name,
      torre,
      numero,
      type,
      status,
      withDrawn,
      cadastradoPor
    })
    res.status(200).json(insertId[0])
  } catch (error) {
    res.status(400).json(error.message)
  }
})

router.put('/', async (req, res) => {
  try {
    const {
      _id,
      name,
      torre,
      numero,
      type,
      status,
      withDrawn,
      cadastradoPor,
      phoneNumber
    } = req.body

    if ((!name || !torre, !type || !cadastradoPor)) {
      res.status(400).json({ message: 'Missing information' })
      return
    }

    const insertId = await Packing.updateOne(
      { _id},
      { type, phoneNumber, status, withDrawn, cadastradoPor },
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

    const deleteId = await Packing.deleteOne({ _id })
    res.status(200).json(deleteId)
  } catch (error) {
    res.status(400).json(error)
  }
})

module.exports = app => app.use('/packing', router)
