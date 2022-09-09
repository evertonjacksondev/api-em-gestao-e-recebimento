const { toFixed, escapeSpecialChar, groupBy } = require("../util/javaScript");
const fs = require('fs');
const csv = require('async-csv');
const util = require('util');
const _ = require('lodash');
const { ObjectId } = require("mongodb");
const { upserQueueSku } = require("./queue");
const { uploadFile, downloadURI, deleteFileS3, uploadFileS3 } = require("../util/storage");
const { formatCNPJ } = require("../util/form");
const { getErrorMessage } = require("../util/error");

const calculatePrice = (price, calc) => {
  let retorno = price;

  switch (calc.operation) {
    case '*':
      retorno = price * calc.value;
      break;
    case '/':
      retorno = price / calc.value;
      break;
    case '+':
      retorno = price + calc.value;
      break;
    case '-':
      retorno = price - calc.value;
      break;
  }

  return retorno;
}

const getPriceWithRule = async (db, marketPlace, sellerId, price, publish) => {
  let rulePriceCollection = db.collection('priceRule');
  let now = new Date();

  let priceRules = await rulePriceCollection.find({
    platformId: marketPlace.platformId,
    marketPlaceId: marketPlace._id,
    sellerId: sellerId,
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).toArray();

  let applyRule = false;

  // testa regras com sub
  for (let priceRule of priceRules.filter(f => f.publishFilters && f.publishFilters.length)) {
    // percorere e verifica todas as sub-condições
    // caso qualquer uma falhe da um break no loop e não recalcula o preço
    for (let publishFilter of priceRule.publishFilters) {
      // se qualquer sub-condição falhar não aplica o filtro
      applyRule = publishFilter.values.find(f => f == publish[publishFilter.field]);
      if (!applyRule) break;
    }

    if (applyRule) {
      return toFixed(calculatePrice(price, priceRule.calc), 2);
    }
  }

  // se não corresponder a nenhuma regra com sub testa as regras sem sub
  for (let priceRule of priceRules.filter(f => !f.publishFilters || f.publishFilters.length == 0)) {
    return toFixed(calculatePrice(price, priceRule.calc), 2);
  }

  // caso não encontre nenhuma regra retorna o mesmo valor de entrada
  return toFixed(price, 2);
}

const createCsv = async (array) => {
  let reportPath = `Erros.csv`;

  let columns = Object.keys(array[0])
  let data = Object.values(array)

  let arrayData = []

  data.map(item => {
    arrayData.push(Object.values(item))
  })



  let out = await csv.stringify(data, {
    header: true,
    columns,
    ignoreEmpty: false,
    quoteHeaders: true,
    delimiter: ';'
  });

  let writeFile = util.promisify(fs.writeFile);
  await writeFile(reportPath, out);

  return reportPath

}

const splitAttPath = (attPath) => {
  let ret = [];
  for (let att of attPath.split(',')) {
    let x = att.split(':');
    if (x.length > 1) {
      ret.push({ id: x[0], value: x[1] })
    }
  }

  return ret;
}

const updateSkuXPublish = async (db, sku, price, stock, sellerId) => {

  let skuXPublishCollection = db.collection('skuXPublish');
  let check = await skuXPublishCollection.find({ sku, sellerId }).toArray();
  if (check.length > 0)
    await skuXPublishCollection.updateMany({ sellerId, sku }, { $set: { price: Number(price), quantity: Number(stock) } })
}

const splitAndUpImagePath = async (imagePath, sku) => {
  let urls = imagePath.split(",");
  let images = [];
  for (let url of urls) {
    let file = await downloadURI(url);
    let matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

    let buffer = Buffer.from(matches[2], 'base64');
    let fileName = await uploadFileS3(
      buffer,
      `${sku}_${Math.random()}.${url.split('.')[url.split('.').length - 1]}`
    )
    images.push(fileName);
  }
  return images;
}

const removeImage = async (imagesDeleted) => {
  if (!Array.isArray(imagesDeleted)) imagesDeleted = [];

  for (let imageDeleted of imagesDeleted) {
    await deleteFileS3(imageDeleted.split('/')[3]);
  }
}

const productReport = async (db, user, req) => {

  let ret = await getSkuList(db, req.query, user);
  let sellerRet = ret.list.map(m => new ObjectId(m.sellerId))
  let sellerColl = db.collection('seller')
  let seller = await sellerColl.find({ _id: { $in: sellerRet } }).toArray();
  let productReport = ret.list.map(m => {

    if (!m.sellerId) {
      let test = 'error'
    }
    return {
      ...m,
      'sku': m.sku ? m.sku : '',
      'title': m.title ? m.title : '',
      'isActive': m.isActive ? m.isActive : '',
      'sellerDocument': m.sellerId ? seller.find(f => f._id.equals(m.sellerId))?.document : '',
      'virtual': m.virtual ? m.virtual : false,
      'description': m.description ? m.description : '',
      'attributes': m.attributes ? m.attributes : ''
    }
  }
  )
  retorno = {
    total: ret.total,
    offset: ret.offset,
    limit: ret.limit > ret.total ? ret.total : ret.limit,
    list: productReport,

  }
  return retorno;
}

const upsertProdAndVars = async (db, prod, seller) => {
  let skuColl = db.collection('sku');

  if (!prod.variations || !Array.isArray(prod.variations)) prod.variations = [];

  let productSet = {
    sku: prod.sku,
    sellerId: seller._id
  };

  if (prod.title) productSet['title'] = prod.title;
  if (prod.categoryId) productSet['categoryId'] = prod.categoryId;
  if (prod.weight) productSet['weight'] = Number(prod.weight);
  if (prod.length) productSet['length'] = Number(prod.length);
  if (prod.width) productSet['width'] = Number(prod.width);
  if (prod.height) productSet['height'] = Number(prod.height);
  if (prod.ncm) productSet['ncm'] = Number(prod.ncm);
  if (prod.cest) productSet['cest'] = Number(prod.cest);
  if (prod.description) productSet['description'] = prod.description;
  productSet['isActive'] = ['true', 'sim', 'ativo'].includes(String(prod.isActive).toLocaleLowerCase());

  if (prod.variations.length == 0) {
    if (prod.attributes && Array.isArray(prod.attributes)) productSet['attributes'] = prod.attributes;
    if (prod.attributesPath) productSet['attributes'] = splitAttPath(prod.attributesPath);
    if (prod.price) productSet['price'] = Number(prod.priceValue);
    if (prod.stock >= 0) productSet['stock'] = Number(prod.stock);
    if (prod.image && Array.isArray(prod.image)) productSet['image'] = prod.image
    if (prod.imagePath) productSet['image'] = await splitAndUpImagePath(prod.imagePath, prod.sku);
    if (prod.imageDeleted) await removeImage(prod.imageDeleted);
  }
  else {
    productSet['virtual'] = true;
  }

  let retProd = await skuColl.updateOne(
    { sku: prod.sku, sellerId: seller._id },
    { $set: productSet },
    { upsert: true }
  )
  updateSkuXPublish(db, prod.sku, prod.price, prod.stock, seller._id)

  for (let variation of prod.variations) {
    let variationSet = {
      sku: variation.sku,
      sellerId: seller._id,
      productId: prod.sku,
      isActive: prod.isActive == true
    }

    if (variation.attributes && Array.isArray(variation.attributes)) variationSet['attributes'] = variation.attributes;
    if (variation.attributesPath) productSet['attributes'] = splitAttPath(variation.attributesPath);
    if (variation.price) variationSet['price'] = Number(variation.priceValue);
    if (variation.stock >= 0) variationSet['stock'] = Number(variation.stock);
    if (variation.image) variationSet['image'] = variation.image
    if (variation.imagePath) productSet['image'] = await splitAndUpImagePath(variation.imagePath, variation.sku);
    if (variation.imageDeleted) await removeImage(variation.imageDeleted);

    updateSkuXPublish(db, variation.sku, variation.price, variation.stock, variationSet.sellerId)

    await skuColl.updateOne(
      { sku: variation.sku, sellerId: seller._id },
      { $set: variationSet },
      { upsert: true }
    )
  }

  return retProd.upsertedId;
}

const validateProdAndVars = (prod, skus, seller, user, checkNew) => {
  try {
    let prodExist = skus.find(f => f.sku == prod.sku);

    let productSet = {
      sku: prod.sku,
      sellerId: seller._id
    };
    if (!prod.sku) throw 'Código SKU obrigatório';


    if (prod.length) productSet['length'] = Number(prod.length);
    if (prod.width) productSet['width'] = Number(prod.width);
    if (prod.height) productSet['height'] = Number(prod.height);
    if (prod.weight) productSet['weight'] = Number(prod.weight);

    if (productSet.weight > 30000) throw 'Peso maior que o permitido';
    if (productSet.height > 70) throw 'Altura maior que o permitido';
    if (productSet.width > 70) throw 'Largura maior que o permitido';
    if (productSet.length > 70) throw 'Comprimento maior que o permitido';
    if ((productSet.length + productSet.width + productSet.height) > 200) throw 'Soma das medidas maior que o permitido(200cm)';

    if (!seller || !user.sellerIds.find(f => f.equals(seller._id))) throw 'Empresa não encontrada';

    if (prodExist && checkNew) throw 'Código de produto já cadastrado para esta empresa';

    if (!prodExist) {
      if (!prod.title) throw 'Título obrigatório para produto novo';

      // produto sem variação
      if (!Array.isArray(prod.variations) || prod.variations.length == 0) {
        prod.price = Number(prod.priceValue);
        prod.stock = Number(prod.stock);

        if (!prod.price) throw 'O preço deve ser maior do que 0';
        if (prod.stock < 0) throw 'O estoque deve ser maior ou igual a 0';

        if (!prod.attributes) prod.attributes = [];
        if (!prod.image) prod.image = [];
      }
    }

    if (prod.price != undefined && prod.price == 0) throw 'O preço deve ser maior do que 0';


    let prodsIntoVars = [];
    if (!Array.isArray(prod.variations)) {
      prod.variations = [];
    }

    for (let variation of prod.variations) {
      try {
        let varExist = skus.find(f => f.sku == variation.sku);

        if (!variation.sku) throw 'Código SKU obrigatório';
        if (variation.sku == prod.sku) throw 'Código da Variação deve ser diferente do código do Produto';
        if (prod.variations.filter(f => f.sku == variation.sku).length > 1) throw 'Não é possível cadastrar mais de uma variação com o mesmo código';
        if (varExist && (checkNew || variation.isNew)) throw 'Código de variação já cadastrado para esta empresa';

        if (!varExist) {
          variation.price = Number(variation.priceValue);
          variation.stock = Number(variation.stock);

          if (!variation.priceValue) throw 'O preço deve ser maior do que 0';
          if (variation.stock < 0) throw 'O estoque deve ser maior ou igual a 0';
          if (!Array.isArray(variation.attributes) || variation.attributes.length == 0) 'Deve ter ao menos 1 atributo';

          if (!variation.image) variation.image = [];
        }

        if (variation.price != undefined && variation.price == 0) throw 'O preço deve ser maior do que 0';

      } catch (err) {
        throw `Variação [${variation.sku}] - ${err}`;
      }
    }
  } catch (err) {
    return err
  }
}

const distinctSkus = (prods) => {
  let skuCodes = new Set();
  prods.map(prod => {
    if (prod.sku)
      skuCodes.add(prod.sku);

    if (Array.isArray(prod.variations))
      prod.variations.map(vari => { if (vari.sku) skuCodes.add(vari.sku) })
  })

  return Array.from(skuCodes)
}

const upsertProducts = async (db, products, user, checkNew = false) => {
  if (Array.isArray(!products)) throw 'Corpo não é array';

  let skuColl = db.collection('sku');
  let sellerColl = db.collection('seller');

  let prodSellers = { ...groupBy(products, 'sellerId'), ...groupBy(products, 'sellerDocument') };

  let sellerFilter = {
    $or: [
      { _id: { $in: Object.getOwnPropertyNames(prodSellers).filter(f => f.length == 24).map(m => new ObjectId(m)) } },
      { document: { $in: Object.getOwnPropertyNames(prodSellers).filter(f => f.replace(/\D/g, "").length == 14).map(m => formatCNPJ(m)) } },
    ]
  };

  let sellers = await sellerColl.find(sellerFilter).toArray();


  sellers = sellers.filter(f => user.sellerIds.find(ff => ff.equals(f._id)));

  let prodResult = [];

  for (prodsBySeller in prodSellers) {
    try {
      let seller = sellers.find(f => {

        return (f._id && JSON.stringify(f._id).replace('"', '').replace('"', '') == prodsBySeller) || f.document == formatCNPJ(prodsBySeller)
      }
      )

      if (!seller) throw `Empresa ${prodsBySeller} não encontrada para o usuário ${user.name}`

      let skus = await skuColl.find({
        sellerId: seller._id,
        sku: { $in: distinctSkus(prodSellers[prodsBySeller]) }
      }).toArray();

      for (let prod of prodSellers[prodsBySeller]) {
        try {
          let ret = await validateProdAndVars(prod, skus, seller, user, checkNew);

          if (ret) throw ret;
          let skuId = await upsertProdAndVars(db, prod, seller);

          prodResult.push({ type: 'success', sku: prod.sku, skuId });
        } catch (err) {
          prodResult.push({ type: 'error', sku: prod.sku, error: `Produto [${prod.sku}] - ${err}` });
        }
      }
    } catch (error) {
      prodResult.push({ type: 'error', error: getErrorMessage(error) });
    }
  }

  return prodResult;
}

const filterSkuList = async (db, filter, user) => {
  let skuCollection = db.collection('sku');
  let {
    offset,
    limit,
    status,
    ...filterQuery
  } = filter;



  let prodFilter = {
    sellerId: { $in: user.sellerIds },
  };

  if (filterQuery.code) {
    let skuFind = await skuCollection.find({ sku: new RegExp(".*" + escapeSpecialChar(filterQuery.code) + ".*", "i") }).toArray();
    let prods = skuFind.map(m => { if (m.productId) return m.productId });

    let arrayFilter = [new RegExp(".*" + escapeSpecialChar(filterQuery.code) + ".*", "i")];

    for (let item of prods) if (item) arrayFilter.push(item);

    prodFilter.sku = { $in: arrayFilter };
  }

  if (filterQuery.title) prodFilter.title = new RegExp(".*" + escapeSpecialChar(filterQuery.title) + ".*", "i")
  if (filterQuery.sellerId) prodFilter.sellerId = { $in: filterQuery.sellerId.map(m => { return new ObjectId(m) }) }
  if (filterQuery.categoryId) prodFilter.categoryId = filterQuery.categoryId;



  if (filterQuery.attId || filterQuery.attValue) {
    let filterAttVar = {}

    if (filterQuery.attId) filterAttVar['attributes.id'] = new RegExp(".*" + escapeSpecialChar(filterQuery.attId) + ".*", "i");
    if (filterQuery.attValue) filterAttVar['attributes.value'] = new RegExp(".*" + escapeSpecialChar(filterQuery.attValue) + ".*", "i");

    let varsByAtt = await skuCollection.find({ sellerId: { $in: user.sellerIds }, ...filterAttVar, productId: { $exists: true } }).toArray();

    prodFilter.$or = [
      filterAttVar,
      { sku: { $in: varsByAtt.map(m => m.productId) } }
    ]
  }

  if (filterQuery.onlyVar == 'true') {
    prodFilter.$or = [{ virtual: { $exists: false } }, { virtual: false }];
  } else {
    prodFilter.productId = { $exists: false };
  }

  if (filter.status) prodFilter.isActive = filter.status == 'true';

  return prodFilter
}

const getSkuList = async (db, filter, user) => {
  let skuCollection = db.collection('sku');
  let skuXPublishColl = db.collection('skuXPublish');
  let sellerColl = db.collection('seller');
  let {
    offset,
    limit,
  } = filter;

  offset = parseInt(offset ? offset : 0);
  limit = parseInt(limit ? limit : 25);


  let prodFilter = await filterSkuList(db, filter, user);

  let products = await skuCollection.find(prodFilter).limit(limit).skip(offset).toArray();
  let total = await skuCollection.count(prodFilter);

  let sellers = await sellerColl.find({ _id: { $in: products.map(m => m.sellerId) } }).toArray();
  let variations = await skuCollection.find({ productId: { $exists: true, $in: products.map(m => m.sku) }, sellerId: { $in: products.map(m => m.sellerId) } }).toArray();


  let skuXPublishies = await skuXPublishColl.find(
    {
      sku: { $in: [...products.map(m => m.sku), ...variations.map(m => m.sku)] }
    },
    {
      projection: { publishId: 1, sku: 1, sellerId: 1 }
    }
  ).toArray();

  return {
    total,
    offset,
    limit,
    list: products.map(m => {
      let seller = sellers.find(f => f._id.equals(m.sellerId));
      let variationsByProd = variations.filter(f => f.productId == m.sku)

      if (variationsByProd.length > 0) {
        m.stock = variationsByProd.reduce((n, { stock }) => n + parseInt(stock), 0);
        m.price = Math.max(...variationsByProd.map(m => m.price));
      }

      return {
        ...m,
        publishies: skuXPublishies.filter(f => f.sku == m.sku && f.sellerId.equals(m.sellerId)),
        sellerName: seller ? seller.code : '',
        variations: variationsByProd.map(mm => {
          return {
            ...mm,
            publishies: skuXPublishies.filter(f => f.sku == mm.sku && f.sellerId.equals(mm.sellerId)),
            attributes:
              Array.isArray(mm.attributes) ?
                mm.attributes.sort((a, b) => {
                  if (a.name > b.name) {
                    return 1;
                  }
                  if (a.name < b.name) {
                    return -1;
                  }
                  // a must be equal to b
                  return 0;
                }) : []
          }
        })
      }
    })
  };
}

const uploadCards = async (db, user) => {
  let queueColl = db.collection('queue');
  let queueErrorColl = db.collection('queueError');

  let queueLog = await queueColl.aggregate([
    {
      $match: {
        type: 'HUB',
        operation: 'UPLOAD',
        sellerId: { $in: user.sellerIds }
      }
    },
    {
      $project: { count: { $size: "$content" } }
    }
  ]).toArray();

  let pending = queueLog.reduce((n, { count }) => n + count, 0);
  let error = await queueErrorColl.count({ type: 'HUB', operation: 'UPLOAD', sellerId: { $in: user.sellerIds } });

  return { pending, error };

}

const uploadErrorList = async (db, user, skip = 0, limit = 25) => {
  let queueErrorColl = db.collection('queueError');

  return {
    offset: skip,
    limit,
    total: await queueErrorColl.count({
      type: 'HUB',
      operation: 'UPLOAD',
      sellerId: { $in: user.sellerIds }
    }),
    list: (
      await queueErrorColl.find({
        type: 'HUB',
        operation: 'UPLOAD',
        sellerId: { $in: user.sellerIds }
      }).skip(skip).limit(limit).toArray()
    ).map(m => {
      return {
        error: m.errorMsg,
        sku: m.content.sku
      }
    })
  };
}

const updateSkuStock = async (db, userName, sku, seller, quantity) => {

  if (!quantity) throw 'quantity required !'
  if (!seller) throw 'seller required !'
  if (!userName) throw 'userName required !'
  if (!sku) throw 'sku required !'

  let modifySkuStock = await db.collection('sku').findOneAndUpdate({ sku: sku, sellerId: seller }, { $inc: { stock: quantity } });

  modifySkuStock.value.stock = (Number(modifySkuStock.value.stock) + Number(quantity));

  let updateSku = [{
    stock: modifySkuStock.value.stock,
    sku: modifySkuStock.value.sku,
    sellerId: modifySkuStock.value.sellerId
  }]

  await upserQueueSku(db, userName, updateSku);
}

const createProduct = async (db, user, body) => {
  try {

    let skuColl = db.collection('sku');
    let products = body;
    let log = [];

    if (products.length >= 10) throw `limit Array 10 !`
    for (let product of products) {
      if (!product.productId) throw 'productId required!'
      if (!product.title) throw 'title required!'
      if (!product.sellerId) throw 'sellerId required!'
      if (!product.description) throw 'description required!'
      if (!product.dimensions.height) throw 'height required!'
      if (!product.dimensions.width) throw 'width required!'
      if (!product.dimensions.length) throw 'length required!'

      if (!ObjectId.isValid(product.sellerId)) throw 'sellerId Invalid !'

      // Verificar se o user pode atualizar a empresa do produto.

      if (!user.sellerIds.filter(sellerId => sellerId.equals(new ObjectId(product.sellerId)))) log.push({ product: product.productId, message: `Unauthorized company ${sellerId}` })

      //Criar estrutura de produto para inserir no banco.

      let filterProduct = {
        sku: product.productId,
        sellerId: new ObjectId(product.sellerId),
      }
      let updateProduct = {
        $set: {
          sku: product.productId,
          title: product.title,
          description: product.description,
          sellerId: new ObjectId(product.sellerId),
          stock: product.stock,
          NCM: product.NCM,
          CEST: product.CEST,
          height: product.dimensions.height,
          width: product.dimensions.width,
          weight: product.dimensions.weight,
          length: product.dimensions.length,
          price: product.price,
          isActive: true,
          virtual: true,
          address: product.address,
        }
      }
      await skuColl.updateMany(filterProduct, updateProduct, { upsert: true });

      // Log de sucesso !
      log.push({ product: product.productId, message: `success` });


      // Criar estrutura de Variação para inserir ao banco.
      for (let variation of product.variations) {

        if (!variation.sku) throw 'sku required!'
        if (!variation.price) throw 'price required!'
        if (!variation.stock) throw 'stock required!'
        if (!variation.attributes.length > 0) throw 'attributes required!'

        if (!user.sellerIds.filter(sellerId => sellerId == product.sellerId)) log.push({ sku: variation.sku, message: `Unauthorized company ${sellerId}` })
        let arrayImage = [];

        //Hospedar imagem no storage Azure e inserir  no array de imagens do sku.

        for (let image of variation.image) {
          let file = await downloadURI(image);
          let matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

          let imageBuffer = Buffer.from(matches[2], 'base64');

          let retAws = await uploadFileS3(imageBuffer, `${product.sellerId}-${new Date()}-${variation.sku}`);
          arrayImage.push(retAws);

        }
        let filterVariation = {
          productId: product.productId,
          sku: variation.sku,
          sellerId: new ObjectId(product.sellerId),
        }
        let updateVariation = {
          $set: {
            sku: variation.sku,
            sellerId: new ObjectId(product.sellerId),
            stock: variation.stock,
            price: variation.price,
            attributes: variation.attributes,
            image: arrayImage,
            updatedAt: new Date()
          }
        }

        await skuColl.updateMany(filterVariation, updateVariation, { upsert: true });
        log.push({ sku: variation.sku, message: `success` });
        // Log de sucesso !
      }
    }
    return log;
  } catch (err) {
    return err
  }

}

module.exports = { getPriceWithRule, updateSkuStock, createCsv, upsertProducts, getSkuList, productReport, filterSkuList, uploadCards, uploadErrorList, productReport, createProduct };
