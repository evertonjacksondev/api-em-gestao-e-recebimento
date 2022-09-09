const {
  isValidCPF,
  validateEmail
} = require('../util/form');
const {
  sendMail
} = require('../util/mail');
const {
  decode,
  encode
} = require('./../util/base64');
const jwt = require('jsonwebtoken');
const azure = require('azure-storage');
const {
  ObjectId
} = require('mongodb');
const {
  uploadFile, uploadFileS3
} = require('../util/storage');
const {
  googleAuth
} = require('../util/GoogleAuth');




const getUserData = async (document, sellerId, db, checkSellerId = false, checkAdmin = false) => {
  let userCollection = db.collection('user');
  let user = await userCollection.findOne({
    document,
    active: true
  });


  user.sellerIds = [];
  if (user.su) {

    let sellerCollection = db.collection('seller');
    let seller = await sellerCollection.find({}).toArray();
    user.sellerIds = seller.map(m => {
      return m._id
    });

  } else {

    let userXSellerCollection = db.collection('userXSeller');
    let userXSellers = await userXSellerCollection.find({
      'userId': user._id
    }).toArray();
    user.sellerIds = (userXSellers).map(m => {
      return m.sellerId
    });

    if (checkAdmin && !userXSellers.find(f => f.sellerId.equals(sellerId) && f.admin)) throw 'O usuário não é administrador desta empresa'
    if (checkSellerId && !user.sellerIds.find(f => f.equals(sellerId))) throw `Your userToken dont have access to show sellerId ${headers.sellerid}`;
  }

  if (user.sellerIds.length > 1 && (!sellerId && checkSellerId)) throw 'User has more than 1 seller, put sellerId on Header';
  
  return user;
}

const getUserByToken = async (headers, db, checkSellerId = false, checkAdmin = false, sellerId = undefined) => {

  if (!headers.usertoken) throw 'Header > userToken Needed!';

  headers.usertoken = headers.usertoken.replace('Bearer ', '').replace('bearer ', '').replace('BEARER ', '');
  let document;

  try {
    document = JSON.parse(decode(headers.usertoken)).document;
    let user = await getUserData(document, sellerId ? sellerId : headers.sellerid, db, checkSellerId, checkAdmin);
    if (!user) throw `User by userToken ${headers.usertoken} not found!`;
    return user;
  } catch (err) {
    let secretKey = 'TokenDeValidação';
    try {
      let decoded = await jwt.verify(headers.usertoken, secretKey);
      document = decoded.document;
    } catch (error) {
      throw {
        message: "Sessão encerrada, favor recarregar a página e fazer login novamente",
        auth: true,
      }
    }

  }

  return (await getUserData(document, sellerId ? sellerId : headers.sellerid, db, checkSellerId, checkAdmin))
};

const checkSellerByUserToken = (user, sellerId) => {
  if (!user.sellerIds.find(f => f.equals(sellerId)))
    throw `Your userToken dont have access to show sellerId ${sellerId}`;
};

const checkConfirmationToken = async (db, mail, token, type = 'normal') => {
  let userCollection = db.collection('user');

  let user = await userCollection.findOne({
    mail,
    token
  });

  if (type == 'normal' && !process.argv.find(f => f == 'hom')) {
    if (!user) throw 'Código de Autenticação inválido!';

    let validToken = ((new Date().getTime() - user.tokenDate.getTime()) / 1000) < 600;

    if (!validToken) throw 'Token expirado!';
    if (!user) throw 'Código de Verificação inválido';
  }


}

const generateConfirmationToken = async (db, data,type) => {
  let userCollection = db.collection('user');

  if (!data.mail) throw 'Email Obrigatório.';
  if (!validateEmail(data.mail)) throw 'Invalid Mail.';
  let configColl = db.collection('config');
  let config = await configColl.findOne({})
  let token = Math.floor(1000 + Math.random() * 9000).toString();

  let setActive = data.mail ? true : false || data.newMail ? true : false;

  let setData = {
    mail: data.mail,
    tokenDate: new Date(),
    token,
    active: setActive
  };
  
  if (data.newMail) setData.newMail = data.newMail;

  await userCollection.updateOne({
    mail: data.mail
  }, {
    $set: setData
  }, {
    upsert: true
  });

  if(type == 'resetMail')
  await sendMail(data.mail,
    'Codigo de Autorização Digigrow Hub',
    ` <table align='center' style="font-family:Trebuchet ms,Arial,sans-serif;max-width:600px;width:100%;">
        <tbody>
          <tr style="background-color: #F3F4F9; display:flex">    
            <td width="50%" valign="middle" style="padding:15px;">  
             <img style='width:250px; margin-right:10px' src='https://i.im.ge/2022/08/18/Osif2W.digigrow-hub-removebg-preview.png' alt='digigrow hub'>
            </td>
            <td width="50%" valign="middle" align="right" style="color:#fff;font-size:12px;line-height:16px;padding:15px;text-align:right"> </td></tr>
            <tr>
               <td colspan='2' style='padding:20px'>
                  <b style='font-size: 18px '>Olá!</b><br>
                  <p style='font-size: 14px'>Recebemos seu pedido de alteração de senha/email, e enviamos esse e-mail que contém um código de autenticação.</p>
                  <p style='font-size: 14px'>Código: <b>${token}</b></p>
                  <p style='font-size: 14px'>Caso não tenha solicitado, desconsidere este email.</p>
                  <p style='font-size: 14px'>Atenciosamente, equipe Digigrow.</p>
            </td>
            </tr>
               
          </tbody>
        </table>
      
      </html> `,
    config,
  );

  if(type == 'confirmMail')
  await sendMail(data.mail, 
  'Seja bem-vindo(a) ao nosso HUB!',
  ` <table align='center' style="font-family:Trebuchet ms,Arial,sans-serif;max-width:600px;width:100%;">
    <tbody>
      <tr style="background-color: #F3F4F9; display:flex">    
        <td width="50%" valign="middle" style="padding:15px;">  
         <img style='width:250px; margin-right:10px' src='https://i.im.ge/2022/08/18/Osif2W.digigrow-hub-removebg-preview.png' alt='digigrow hub'>
        </td>
        <td width="50%" valign="middle" align="right" style="color:#fff;font-size:12px;line-height:16px;padding:15px;text-align:right"> </td></tr>
        <tr>
           <td colspan='2' style='padding:20px'>
              <b style='font-size: 18px '>Olá, ficamos felizes que está efetuando o cadastro no nosso HUB!</b><br>
              <p style='font-size: 14px'>Nesse e-mail, contém um código de autenticação para finalizar o seu cadastro.</p>
              <p style='font-size: 14px'>Código: <b>${token}</b></p>
              <p style='font-size: 14px'>Caso não tenha solicitado, desconsidere este email.</p>
              <p style='font-size: 14px'>Obrigado, equipe Digigrow.</p>
        </td>
        </tr>
           
      </tbody>
    </table>
  `,
  config,
)

} 



const register = async (db, userBody) => {

  let userColl = db.collection('user');
  let userXSellerColl = db.collection('userXSeller');
  let selectUser = await userColl.findOne({
    $or: [{
      mail: userBody.mail
    }, {
      document: userBody.document
    }],
    active: false
  });

  let documents = await userColl.find({ document: { $in: Object.values(userBody) } }).toArray();

  if (userBody.type == 'outMail') {
    let invitedMail = await userXSellerColl.find({ userMail: userBody.mail }).toArray();
    if (invitedMail.length < 1) throw 'Email do convidado não encontrado'
  }

  if (selectUser && active == false) throw 'E-mail ou CPF já cadastrado.'
  if (documents.find(document => document.document == userBody.document)) throw 'CPF já cadastrado!'
  if (!userBody.phone) throw 'Telefone Obrigatório.';
  if (!userBody.document) throw 'CPF obrigatório.';
  if (!userBody.mail) {
    userBody.mail = userBody.userEmail
  } else if (!userBody.mail) {
    throw 'Invalid mail!'
  }
  if (!userBody.name) throw 'Nome obrigatório.';
  if (!isValidCPF(userBody.document)) throw 'CPF inválido.';
  try {
    if (userBody.phone.match(/\d/g).join('').length < 10) throw "Telefone Inválido."
  } catch (err) {
    throw "Telefone Inválido."
  }
  if (!userBody.password) throw 'Senha obrigatória.';
  if ((!userBody.code) && (!userBody.type === 'normal')) throw 'Código de Verificação obrigatório';
  if (!validateEmail(userBody.mail)) throw 'Invalid Mail.';

  if (!userBody.google) {
    await checkConfirmationToken(db, userBody.mail, userBody.code, userBody.type);
  }

  let {
    password
  } = userBody;

  delete userBody.password;
  delete userBody.passwordConfirm;
  delete userBody.code;

  let su = userBody.su == true;


  userBody.userToken = encode(JSON.stringify(userBody));

  let user = await userColl.findOneAndUpdate({
    mail: userBody.mail
  }, {
    $set: {
      ...userBody,
      password,
      active: true,
      su,
      createdAt: new Date(),
      picture: userBody.picture
    }
  }, {
    upsert: true
  });



  await userXSellerColl.updateOne({
    userMail: userBody.mail
  }, {
    $set: {
      userId: user.lastErrorObject.upserted
    }
  });


  userBody._id = user.lastErrorObject.upserted;




  return userBody;
};

const resetPassword = async (db, userBody) => {
  await checkConfirmationToken(db, userBody.mail, userBody.code);
  try {
    let userColl = db.collection('user');

    let token = await userColl.findOne({ mail: userBody.mail });

    let checkUser = await userColl.find({ mail: userBody.mail, active: true }).toArray();

    if (checkUser.length < 1) throw 'E-mail não encontrado'

    await userColl.updateOne({
      mail: userBody.mail,
      active: true
    }, {
      $set: {
        password: userBody.password
      }
    });

  } catch (error) {
    console.log(error)
  }
}

const changePassword = async (db, userBody, userId) => {
  
  let userColl = db.collection('user');

  let user = await userColl.findOne({
    _id: new ObjectId(userId),
    password: userBody.passwordOld,
    active: true
  });

  if (!user) throw 'Senha inválida!';

  await userColl.updateOne({
    _id: new ObjectId(userId),
    active: true
  }, {
    $set: {
      password: userBody.password
    }
  });
}

const resetMail = async (db, userBody) => {
  await checkConfirmationToken(db, userBody.mail, userBody.code);

  let userColl = db.collection('user');
  await userColl.updateOne({
    mail: userBody.mail,
    active: true
  }, {
    $set: {
      mail: userBody.newMail
    },
    $unset: {
      newMail: 1
    }
  }

  );
}


const setAccess = async (db, userIds, active = false, userLogged) => {

  if (!Array.isArray(userIds)) userIds = [userIds];
  if (!userLogged.su) throw `Usuário ${userLogged.document} não é um SU!`

  userColl = db.collection('user');

  let ret = await userColl.updateMany(
    {
      _id: { $in: userIds.map(m => new ObjectId(m)) }
    },
    {
      $set: { active }
    }
  );

  return ret;
}

const login = async (db, mail, password, googleToken) => {
  let userFilter = {};

  if (googleToken) {
    let checkedGoogleUser = await googleAuth(googleToken)
    if (checkedGoogleUser && checkedGoogleUser.payload.email_verified) {
      userFilter.mail = checkedGoogleUser.payload.email;
    }
  } else {
    if (!mail) throw 'Mail required.';
    if (!password) throw 'Password required.';

    userFilter.mail = mail;
    userFilter.password = password;
  }

  if (!validateEmail(userFilter.mail)) throw 'Invalid Mail.';

  let userCollection = db.collection('user');
  let user = await userCollection.findOne(userFilter);
  
  
  if (!user && !googleToken) throw `Usuário ou senha inválidos.`;
  if (!user && googleToken) throw `Este email ainda não foi cadastrado, por favor crie uma nova conta.`;

  delete user.password;
  delete user.userToken;

  let secretKey = 'TokenDeValidação';

  user.userToken = jwt.sign({
    document: user.document
  }, secretKey, {
    expiresIn: '24h' 
  });


  let userXSellerColl = db.collection('userXSeller');
  let appMenuXUserColl = db.collection('appMenuXUser');
  let appMenuColl = db.collection('appMenu');

  let userAdmin = await userXSellerColl.findOne({
    userId: user._id,
    admin: true
  });

  let appMenu;
  if (userAdmin) {
    appMenu = await appMenuColl.find({}).toArray();
  } else {
    let appMenuXUser = await appMenuXUserColl.findOne({
      userId: user._id
    });
    if (appMenuXUser)
      appMenu = await appMenuColl.find({
        key: {
          $in: appMenuXUser.appMenu
        }
      }).toArray();
  }


  let links = [];

  appMenu && appMenu.map(m => {
    if (m.link)
      links.push(m.link);

    if (m.child)
      links.push(...m.child.map(m2 => {
        if (m2.link) return m2.link
      }))
  });

  user.links = links.length == 0 ? ['/', '/seller', '/settings'] : links;

  let hasSellers = (await userXSellerColl.count({
    userId: user._id
  })) > 0;

  user['hasSellers'] = hasSellers;

  return user;
}

const updateUserPic = async (db, userId, image, type) => {
  let fileName = `userPic-${userId}.jpg`;

  let picPath = await uploadFileS3(image, fileName);

  userColl = db.collection('user');
  await userColl.updateOne({
    _id: new ObjectId(userId)
  }, {
    $set: {
      picture: picPath
    }
  });

  return picPath;
}

const updateSellerPic = async (db, sellerId, image, type) => {
  let fileName = `sellerCpf-${sellerId}-{cpf}.jpg`;

  let picPath = await uploadFileS3(image, fileName);

  sellerColl = db.collection('seller');
  await sellerColl.updateOne({
    _id: new ObjectId(sellerId)
  }, {
    $set: {
      picture: picPath
    }
  });

  return picPath;
}

const updateSellerPicCNPJ = async (db, sellerId, image, type) => {
  let fileName = `sellerCpf-${sellerId}-{cnpj}.jpg`;

  let picPath = await uploadFileS3(image, fileName);

  sellerColl = db.collection('seller');
  await sellerColl.updateOne({
    _id: new ObjectId(sellerId)
  }, {
    $set: {
      pictureCNPJ: picPath
    }
  });

  return picPath;
}


const changeSuperUser = async (db, _id, isActive = false, user) => {
  userColl = db.collection('user')

  let su = isActive;
  let idList = _id.map(m => new ObjectId(m))

  await userColl.updateMany({ _id: { $in: idList } }, { $set: { su } })
}


module.exports = {
  getUserByToken,
  checkSellerByUserToken,
  register,
  generateConfirmationToken,
  resetPassword,
  login,
  updateUserPic,
  resetMail,
  changePassword,
  updateSellerPic,
  updateSellerPicCNPJ,
  setAccess,
  changeSuperUser,
};
