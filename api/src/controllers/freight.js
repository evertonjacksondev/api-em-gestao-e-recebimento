const express = require('express');
const router = express.Router();
const { clientSoap, calcFreight } = require('../../lib/data/sigepWeb');
const { getUserByToken } = require('../../lib/data/user');


router.get('/consulta/:cep', async (req, res,) => {
  try {
    let db = req.mongoConnection;
    // await getUserByToken(req.headers, db);
    let { cep } = req.params;
    let validateCEP = cep.replace('-', '');
    let client = await clientSoap('cep');
    let result = (await client.consultaCEPAsync({ cep: validateCEP }))[0].return;

    res.status(200).json([result]);
  } catch (err) {
    res.status(err && !err.auth ? 400 : 401).json('CEP Inválido');
  }

});

router.get('/prazoEntrega', async (req, res,) => {
  try {
    let db = req.mongoConnection;
    // await getUserByToken(req.headers, db);
    let result = await calcFreight(req.query);

    res.status(200).json(result);
  } catch (err) {
    res.status(err && !err.auth ? 400 : 401).json('CEP Inválido');
  }

});


module.exports = app => app.use('/v1/correio', router);