const { verify } = require("jsonwebtoken");
const { toFixed } = require("../util/javaScript");
const { clientSoap, orderToSigepWebXML } = require("./sigepWeb");
const crypto = require('crypto')


const calcFreight = async (db, body, roleFree = false) => {

  let publishColl = db.collection('publish');
  let publish = await publishColl.findOne({ publishId: body.items[0].id });

  if (!publish) throw `PUblish ${body.items[0].id} not found on hub`;

  let freightColl = db.collection('freight');
  let freights = await freightColl.find({
    sellerId: publish.sellerId,
    zipStart: { $lte: parseInt(body.destination.value) },
    zipEnd: { $gte: parseInt(body.destination.value) }
  }).toArray();

  if (!freights.length) throw 'Produto sem cobertura de envio para o CEP destino.';

  let quotations = freights.map(freight => {
    let value = freight.values.sort(function (x, y) {
      return x.weight - y.weight;
    }).find(f => f.weight >= body.items[0].dimensions.weight / body.items[0].quantity);

    let price = value ? value.price : Math.max.apply(null, freight.values.map(m => m.price));

    if (roleFree && Math.max.apply(null, body.items.map(m => m.price)) >= 79.90) price = 0

    return {
      price: toFixed(price * body.items[0].quantity, 2),
      handling_time: 0,
      shipping_time: Math.round(freight.estimated),
      promise: Math.round(freight.estimated),
      service: 99
    }
  })

  let retorno = {
    destinations: [
      body.destination.value.toString()
    ],
    packages: [
      {
        dimensions: {
          height: Math.round(body.items[0].dimensions.height),
          width: Math.round(body.items[0].dimensions.width),
          length: Math.round(body.items[0].dimensions.length),
          weight: Math.round(body.items[0].dimensions.weight),
        },
        items: [
          {
            id: body.items[0].id,
            variation_id: body.items[0].variation_id,
            quantity: body.items[0].quantity,
            dimensions: {
              height: Math.round(body.items[0].dimensions.height),
              width: Math.round(body.items[0].dimensions.width),
              length: Math.round(body.items[0].dimensions.length),
              weight: Math.round(body.items[0].dimensions.weight),
            }
          }
        ],
        quotations
      }
    ]
  };

  let callbackLogColl = db.collection('callbackLog');
  await callbackLogColl.insertOne({ req: body, res: retorno, createdAt: new Date() });

  return retorno;
}

const closePlp = async (db, body) => {
  try {

    let client = await clientSoap('cep');
    let orderColl = db.collection('order');
    let orders = await orderColl.find({ $or: [{ externalId: { $in: body } }, { packId: { $in: body } }] }).toArray();
    let config = await db.collection('config').findOne({});

    let listingOrderCorreios = [];
    let listingOrderMercadoEnvios = [];
    let shippedDate = new Date();

    const words = orders.map(order => order._id).join('');
    let hashObj = { algorithm: 'sha256', digestFormat: 'hex' };
    // Calling createHash method
    const hash = crypto.createHash(hashObj.algorithm)
      // updating data
      .update(words)
      // Encoding to be used
      .digest(hashObj.digestFormat);


    let reportPlp = [];

    orders.map(m => { if (m.shipping.mode == 'me1') { listingOrderCorreios.push(m) } else { listingOrderMercadoEnvios.push(m) } });

    let xml;

    if (listingOrderCorreios.length > 0) {
      let xmlOrderToSigepWeb = await orderToSigepWebXML(db, listingOrderCorreios);
      xml = xmlOrderToSigepWeb.replace(/\r?\n|\r/g, " ");

      const idPlpCliente = Date.now().toString().substring(0, 10);
      const requestData = {
        xml,
        idPlpCliente,
        cartaoPostagem: config.sigep.cartaoPostagem,
        listaEtiquetas: listingOrderCorreios.map(m => m.shipping.trackingNumber.replace(m.shipping.trackingNumber.slice(m.shipping.trackingNumber.length - 3, m.shipping.trackingNumber.length - 2) + 'BR', 'BR')),
        usuario: config.sigep.credentials.login,
        senha: config.sigep.credentials.password
      }
      let listOrder = listingOrderCorreios.map(m => { return { ...m, order: m.packId ? m.packId : m.externalId } })
      let plpId = (await client.fechaPlpVariosServicosAsync(requestData))[0].return;
      await orderColl.updateMany({ $or: [{ externalId: { $in: listOrder.map(m => m.order) } }, { packId: { $in: listOrder.map(m => m.order) } }] }, { $set: { status: 'shipped', 'shipping.shippedDate': shippedDate, 'shipping.dispatchId': hash } })
      reportPlp.push(...listOrder.map(m => { return { ...m, plpCorreios: plpId } }));
    }

    if (listingOrderMercadoEnvios.length > 0) {
      let listOrder = listingOrderMercadoEnvios.map(m => { return { ...m, order: m.packId ? m.packId : m.externalId } })

      await orderColl.updateMany({ $or: [{ externalId: { $in: listOrder.map(m => m.order) } }, { packId: { $in: listOrder.map(m => m.order) } }] }, { $set: { status: 'shipped', 'shipping.shippedDate': shippedDate, 'shipping.dispatchId': hash } })
      reportPlp.push(...listOrder.map(m => { return { ...m } }));
    }
    return reportPlp;

  } catch (err) {
    throw err
  }
}

module.exports = { calcFreight, closePlp }