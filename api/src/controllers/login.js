const express = require('express');
const { login } = require('../../lib/data/user');
const router = express.Router();

router.post('/auth', async (req, res) => {
  try {
    let db = req.mongoConnection;
    let { mail, password, googleToken } = req.body;
    res.status(200).json(await login(db, mail, password, googleToken));
  } catch (err) {
    res.status(err && !err.auth ? 400 : 401).json(err);
  }
});


router.post('/register', async (req, res) => {
  try {

    let db = req.mongoConnection;
    let {
      address,
      cepOrigin,
      city,
      document,
      lastName,
      mail,
      name,
      neightboord,
      number,
      password } = req.body;

    let update = {};

    if (!address) throw 'Address required !'
    if (!cepOrigin) throw 'cepOrigin required !'
    if (!city) throw 'city required !'
    if (!mail) throw 'mail required !'
    if (!lastName) throw 'lastName required !'
    if (!document) throw 'document required !'
    if (!neightboord) throw 'neightboord required !'
    if (!number) throw 'number required !'
    if (!name) throw 'name required !'
    if (!password) throw 'password required !'

    if (address) update['address'] = address;
    if (cepOrigin) update['cepOrigin'] = cepOrigin;
    if (city) update['city'] = city;
    if (mail) update['mail'] = mail;
    if (lastName) update['lastName'] = lastName;
    if (document) update['document'] = document;
    if (neightboord) update['neightboord'] = neightboord;
    if (number) update['number'] = number;
    if (name) update['name'] = name;
    if (password) update['password'] = password;

    let userColl = db.collection('user');

    let user = await userColl.find({ mail, document }).toArray();

    if (user.length > 0) throw 'Usuário já cadastrado'

    await userColl.updateMany({ mail, document }, { $set: update }, { upsert: true })
    res.status(200).json(user);

  } catch (err) {
    res.status(err && !err.auth ? 400 : 401).json(err);
  }
});



module.exports = app => app.use('/v1/user', router);