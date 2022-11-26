const { Router } = require('express')
const User = require('../models/User.model')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const router = Router()

router.post('/signup', async (req, res, next) => {
  let { email, password, name } = req.body

  if (!email || !password || !name) {
    res.status(400).json({ message: 'Provide email, password and name' })
    return
  }

  const emailRegex = /[^@ \t\r\n]+@[^@ \t\r\n]+\.[^@ \t\r\n]+/

  if (!emailRegex.test(email)) {
    res.status(400).json({ message: 'Provide a valid email' })
    return
  }

  // verifico se o password tem 6 caracteres, 1 letra maiuscula, 1 minuscula e 1 numero pelo menos
  const passwordRegex = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{6,}/

  if (!passwordRegex.test(password)) {
    res.status(400).json({
      message:
        'Password must have at least 6 characters and contain at least one number, one lowercase and one uppercase letter'
    })
    return
  }

  // Verificar se o usuário já não existe

  try {
    const foundedUser = await User.findOne({ email })

    if (foundedUser) {
      res.status(400).json({
        message: 'User already exists'
      })
      return
    }

    // gerar o hash do password
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(password, salt)

    const createdUser = await User.create({ name, email, password:passwordHash })

    const { _id } = createdUser

    res.status(201).json({ email, name, _id })
  } catch (error) {
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body
  try {
    const user = await User.findOne({ email })
    if (!user) {
      res.status(400).json({ message: 'user not found' })
      return
    }
    const compareHash = bcrypt.compareSync(password, user.password)

    if (!compareHash) {
      res.status(400).json({ message: 'invalid password' })
      return
    }

    const payload = {
      id: user._id,
      email: user.email
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' })
    res.status(200).json({ ...payload, token })
  } catch (error) {
    next(error)
  }
})

module.exports = app => app.use('/', router)
