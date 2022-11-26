const jwt = require('jsonwebtoken')
require('dotenv').config()

const auth = (req, res, next) => {
  try {
    const token = req.get('Authorization')
    if (!token) {
      res.status(401).json({ message: 'Request without token' })
      return
    } else if (token) {
        const tokenWithoutBearer = token.split(' ')[1]
        const decodedToken = jwt.verify(
        tokenWithoutBearer,
        process.env.JWT_SECRET
      )
      req.user = { ...decodedToken }
      next()
    } else if (req.originalUrl == '/login') {
      next()
    }
  } catch (error) {
    res.status(401).json({ message: error.message })
  }
}

module.exports = auth
