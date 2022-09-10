const express = require('express');
const router = express.Router();

router.get('/auth', async (req, res,) => {
  try {

    res.status(200).json(true);
  } catch (err) {
    res.status(err && !err.auth ? 400 : 401).json('CEP Inválido');
  }

});


module.exports = app => app.use('/v1/user', router);