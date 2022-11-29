const jwt = require('jsonwebtoken')
require('dotenv').config()

const auth = (req, res, next) => {
  try {
    const token = req.get('Authorization')

    if (req.originalUrl == '/login' || req.originalUrl == '/signup') {
      next()
    } else if (token) {
      const tokenWithoutBearer = token.split(' ')[1]
      const decodedToken = jwt.verify(
        tokenWithoutBearer,
        process.env.JWT_SECRET
      )
      req.user = { ...decodedToken }
      next()
    }
  } catch (error) {
    res.status(401).json({ message: error.message })
  }
}

module.exports = auth
