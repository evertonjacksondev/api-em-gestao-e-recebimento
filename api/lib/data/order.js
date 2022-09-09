const { postShippingInvoice, getShippingLabelMeli, getShippingById, putShippingTracking, postShippingStatus, getInvoiceMeli, getXmlMeli, getLinkStorage } = require("../http/mercadoLivre");
const { ObjectId } = require('mongodb');
const { sleep, toFixed, escapeSpecialChar, getDaysInCurrentMonth, chunkArray } = require("../util/javaScript");
const { sendAutomaticMessage } = require("./message");
const { checkSellerByUserToken } = require("./user");
const { upsertQueue } = require("./queue");
const { uploadFileS3 } = require("../util/storage");
const { parseInt, methodOf } = require("lodash");
const { calcFreight } = require("./freight");
const { getZPLImage } = require("../http/labelLary");

const meliOrderToDigigrowOrder = async (meliOrder, queue, sellerId, platformId, db) => {

  let items = [];

  let freight =
    meliOrder.shippingInfo && meliOrder.shippingInfo.shipping_option ?
      meliOrder.shippingInfo.shipping_option.list_cost : 0;

  let freightClient = toFixed(
    meliOrder.shippingInfo && meliOrder.shippingInfo.shipping_option ?
      meliOrder.shippingInfo.shipping_option.cost : 0, 2);


  let freightSeller = toFixed(
    meliOrder.shippingInfo && meliOrder.shippingInfo.shipping_option ?
      meliOrder.shippingInfo.shipping_option.list_cost - freightClient : 0, 2);

  let payments = meliOrder.payments.map(m => {
    return {
      paymentId: m.id,
      method: m.payment_method_id,
      status: m.status,
      installments: m.installments,
      value: toFixed(parseFloat(m.transaction_amount + m.shipping_cost), 2)
    }
  });

  let freightMode = [];
  let sellerColl = db.collection('seller');
  let { cep } = await sellerColl.findOne({ _id: new ObjectId(sellerId) });

  if (meliOrder.shippingInfo.mode == 'me1' && freightClient == 0) {

    for (let items of meliOrder.shippingInfo.shipping_items) {

      let dimensionsSplit = items.dimensions.replace(',', 'x').split('x');
      let height = dimensionsSplit[0];
      let width = dimensionsSplit[1];
      let length = dimensionsSplit[2];
      let weight = dimensionsSplit[3];

      let consult = {
        seller_id: meliOrder.seller.id,
        items: [
          {
            id: items.id,
            quantity: items.quantity,
            dimensions: {
              height,
              width,
              length,
              weight,
            }
          }
        ],
        destination: {
          type: 'zipcode',
          value: meliOrder.shippingInfo.receiver_address.zip_code
        },
        origin: {
          type: 'zipcode',
          value: cep
        }
      }

      let ret = await calcFreight(db, consult, true);

      freightMode.push(ret);
    }

    if (freightMode.length > 0) {
      freightSeller += freightMode[0].packages[0].quotations[0].price;
    }
  }


  let skuColl = db.collection('sku');
  let skus = await skuColl.find({ sku: { $in: meliOrder.order_items.map(m => m.item.seller_sku ? m.item.seller_sku : m.item.seller_custom_field) } }).toArray();

  let sellerContractId = await db.collection('seller').findOne({ _id: sellerId });
  let contractFee = await db.collection('contract').findOne({ _id: sellerContractId.contractId });

  if (!contractFee) throw `Contrato não encontrado para o seller ${sellerContractId.document}`;

  let ret = [];

  skus.map(m => {
    if (m && m.kit) {
      m.kit.map(mm => ret.push(mm.sku))
    }
  });

  let skusKit = await skuColl.find({ sku: { $in: ret } }).toArray();



  for (let meliItem of meliOrder.order_items) {

    let skuFilter = meliItem.item.seller_sku ? meliItem.item.seller_sku : meliItem.item.seller_custom_field;
    let skuItem = skus.find(f => f.sku == skuFilter);

    if (skuItem && skuItem.kit && Array.isArray(skuItem.kit) && skuItem.kit.length > 0) {

      let totalPriceKit = 0;
      for (let skuKit of skusKit.filter(f => skuItem.kit.map(m => m.sku == f.sku))) {
        totalPriceKit = totalPriceKit + (skuKit.price * skuItem.kit.find(f => f.sku == skuKit.sku).quantity);
      }

      for (let structKit of skuItem.kit) {
        let sku = skusKit.find(f => f.sku == structKit.sku);

        let weightSkuKit = ((sku.price * structKit.quantity) / totalPriceKit);
        let priceItem = meliItem.unit_price * weightSkuKit;

        items.push({
          publishId: meliItem.item ? meliItem.item.id : '',
          sku: structKit.sku,
          title: sku.title,
          amount: meliItem.quantity * structKit.quantity, //calcular multiplicar
          unit: priceItem / meliItem.quantity * structKit.quantity,
          price: priceItem * meliItem.quantity, //calcular peso de acordo com kit/item
          discount: 0,
          gross: priceItem * meliItem.quantity,
          total: priceItem * meliItem.quantity,
          listingType: meliItem.listing_type_id,
          saleFee: meliItem.sale_fee * meliItem.quantity * weightSkuKit,
          skuKit: skuItem.sku,
          titleKit: meliItem.item.variation_attributes && meliItem.item.variation_attributes.length ?
            meliItem.item.title + ' - ' + meliItem.item.variation_attributes[0].value_name : meliItem.item.title,
        })


      }
    }
    else {
      items.push({
        publishId: meliItem.item ? meliItem.item.id : '',
        sku: meliItem.item.seller_sku ? meliItem.item.seller_sku : meliItem.item.seller_custom_field,
        title: meliItem.item.variation_attributes && meliItem.item.variation_attributes.length ?
          meliItem.item.title + ' - ' + meliItem.item.variation_attributes[0].value_name : meliItem.item.title,
        amount: meliItem.quantity,
        unit: meliItem.unit_price,
        price: meliItem.unit_price * meliItem.quantity,
        discount: 0,
        gross: meliItem.unit_price * meliItem.quantity,
        total: meliItem.unit_price * meliItem.quantity,
        listingType: meliItem.listing_type_id,
        saleFee: meliItem.sale_fee * meliItem.quantity
      })
    }
  }

  let shipping = {};

  if (meliOrder.shippingInfo) {
    shipping = {
      shippingId: meliOrder.shippingInfo.id,
      mode: meliOrder.shippingInfo.mode,
      status: meliOrder.shippingInfo.mode == 'me2' ? meliOrder.shippingInfo.status : null,
      estimateDeliveryDate: meliOrder.shippingInfo.shipping_option.estimated_delivery_time ?
        meliOrder.shippingInfo.shipping_option.estimated_delivery_time.date : null,
      city: meliOrder.shippingInfo.receiver_address.city.name,
      state: meliOrder.shippingInfo.receiver_address.state.id.split('-')[1],
      country: meliOrder.shippingInfo.receiver_address.country.id,
      street: meliOrder.shippingInfo.receiver_address.street_name,
      neighborhood: meliOrder.shippingInfo.receiver_address.neighborhood.name,
      number: meliOrder.shippingInfo.receiver_address.street_number,
      comment: meliOrder.shippingInfo.receiver_address.comment,
      address: meliOrder.shippingInfo.receiver_address.address_line,
      zipCode: meliOrder.shippingInfo.receiver_address.zip_code,
      trackingNumber: meliOrder.shippingInfo.tracking_number,
      trackingMethod: `${meliOrder.shippingInfo.mode} - ${meliOrder.shippingInfo.shipping_option.name}`,
      fulfillment: meliOrder.shippingInfo.logistic_type == 'fulfillment'
    };
  };

  let grossMeli = items.reduce((n, { gross }) => n + gross, 0);
  let sale_fee = items.reduce((n, { saleFee }) => n + saleFee, 0);

  let grossDigi = grossMeli;
  if (contractFee.freightClientFee) grossDigi = grossDigi + freightClient;
  if (contractFee.freightSellerFee) grossDigi = grossDigi + freightSeller;
  if (!contractFee.addDigiFee) contractFee.addDigiFee = 0;

  let digiFee = toFixed((grossDigi * contractFee.saleFee) + contractFee.addDigiFee, 2);

  let receivement = toFixed(grossMeli - sale_fee - freightSeller - digiFee, 2);

  return {
    externalId: meliOrder.id,
    packId: meliOrder.pack_id,
    createdAt: new Date(),
    updatedAt: new Date(),
    marketPlaceId: queue.marketPlaceId,
    sellerId,
    platformId,
    userId: queue.userId,
    saleDate: new Date(meliOrder.date_created),
    dateClosed: new Date(meliOrder.date_closed),
    status: meliOrder.status,
    buyer: {
      buyerId: meliOrder.buyer.id,
      name: `${meliOrder.billingInfo && meliOrder.billingInfo.additional_info.find(f => f.type == 'FIRST_NAME') ?
        meliOrder.billingInfo.additional_info.find(f => f.type == 'FIRST_NAME').value :
        meliOrder.buyer.first_name
        } ${meliOrder.billingInfo && meliOrder.billingInfo.additional_info.find(f => f.type == 'LAST_NAME') ?
          meliOrder.billingInfo.additional_info.find(f => f.type == 'LAST_NAME').value :
          meliOrder.buyer.last_name
        }`,
      email: meliOrder.buyer.email,
      document: meliOrder.billingInfo ? meliOrder.billingInfo.doc_number : '00000000000',
      documentType: meliOrder.billingInfo ? meliOrder.billingInfo.doc_type : 'OTHER',
      phone: meliOrder.shippingInfo ? meliOrder.shippingInfo.receiver_address.receiver_phone : null
    },
    discount: 0,
    gross: grossMeli,
    freight: -freight,
    freightClient: -freightClient,
    freightSeller: -freightSeller,
    digiFee: -digiFee,
    saleFee: -sale_fee,
    receivement,
    items: items.map(m => {
      return {
        ...m,
        unit: toFixed(m.unit, 2),
        price: toFixed(m.price, 2),
        gross: toFixed(m.gross, 2),
        total: toFixed(m.total, 2),
        saleFee: toFixed(m.saleFee, 2)
      }
    }),
    payments,
    shipping
  };
}

const getShippingLabel = async (db, config, marketPlace, order) => {

  let sellerColl = db.collection('seller');
  let orderCol = db.collection('order');
  let seller = await sellerColl.findOne({ _id: order.sellerId });

  if (order.shipping.mode == 'me1') {
    let trackingMethod;

    switch (order.shipping?.trackingMethod) {
      case 'me1 - expressso' || 'me1 - Expresso' || 'me1 - Prioritário':
        trackingMethod = 'SEDEX';
        break;
      case 'me1 - Normal' || 'me1 - normal':
        trackingMethod = 'PAC';
        break;
    }

    let orderId = order.packId ? order.packId : order.externalId;
    let filter = { transportServiceCode: trackingMethod };

    if (order.shipping.trackingNumber) filter.code = order.shipping.trackingNumber;

    let labelsColl = db.collection('labels');
    let trackingNumber = await labelsColl.findOneAndUpdate(filter, { $set: { status: 'indisponivel', orderId } }, { upsert: true })

    let zplLabel = config.sigep.layoutLabel;

    let zplOrder = zplLabel.replace('[SIMBOLO_ENCAMINHAMENTO_PACSEDEX_ZPL]')
      .replace('[QRCODE_DATAMATRIZ]', trackingNumber.value.code)
      .replace('[CHANCELA_CORREIOS]', config.sigep.transportServiceCode.find(method => method.serviceName == trackingMethod).logoService)
      .replace('[LOGO_EMPRESA]', config.sigep.logolabeL)
      .replace('Contrato:', `Contrato: ${config.sigep.contrato}`)
      .replace('[NOTAFISCAL_NUMERO]', order.invoice.number)
      .replace('[PEDIDO_NUMERO]', orderId)
      .replace('[ENCOMENDA_NUMERO]', trackingNumber.value.code)
      .replace('[PESO_BRUTO]', 0)
      .replace('[PESO_LIQUIDO]', 0)
      .replace('[VOLUMES_TOTAL]', '1/1')
      .replace('[ENCOMENDA_NUMERO]', trackingNumber.value.code.slice(2, trackingNumber.value.code.length - 2))
      .replace('[CONTRATO_NUMERO]', '')
      .replace('[CONTRATO_TIPO]', '')
      .replace('[DESTINATARIO_NOME]', order.buyer.name)
      .replace('[DESTINATARIO_LOGRADOURO]', order.shipping?.address)
      .replace('[DESTINATARIO_COMPLEMENTO]', order.shipping?.comment)
      .replace('[DESTINATARIO_BAIRRO]', order.shipping?.neighborhood)
      .replace('[DESTINATARIO_CIDADE]', order.shipping?.city)
      .replace('[DESTINATARIO_CEP]', order.shipping?.zipCode)
      .replace('[DESTINATARIO_ESTADO]', order.shipping?.state)
      .replace('[REMETENTE_NOME]', seller.name)
      .replace('[REMETENTE_LOGRADOURO]', seller.address ? seller.address.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '')
      .replace('[REMETENTE_BAIRRO]', seller.neighborhood ? seller.neighborhood.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '')
      .replace('[REMETENTE_CIDADE]', seller.city ? seller.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '')
      .replace('[REMETENTE_CEP]', seller.cep ? seller.cep.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '')
      .replace('[REMETENTE_ESTADO]', seller.state ? seller.state.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '')
      .replace('CNPJ/CPF:[DESTINATARIO_CPFCNPJ]', seller.document ? seller.document : '')

    await orderCol.updateOne({ $or: [{ externalId: order.externalId }, { packId: order.packId }] }, { $set: { labelMode: 'S3', label: zplOrder, 'shipping.trackingNumber': trackingNumber.value.code } })

    return zplOrder;

  } else if (!order.label) {
    // caso o contrario verificar qual a plaformar e chamar api correta para buscar etiqueta.
    return label = await getShippingLabelMeli(db, config, marketPlace, order.shipping.shippingId)
  };

}

const sendOrderInvoice = async (db, user, orderId, key, number, serie, emissionDate, xml) => {

  let orderCollection = db.collection('order');
  let configCollection = db.collection('config');
  let marketPlaceCollection = db.collection('marketPlace');
  let platformCollection = db.collection('platform');

  let filterOrder = {
    sellerId: { $in: user.sellerIds },
    $or: [{ externalId: parseFloat(orderId) }, { packId: parseFloat(orderId) }]
  };
  let order = await orderCollection.findOne(filterOrder);

  if (!order) throw `Order ${orderId} not found to this user`;
  if (!order.shipping) throw `Order doesn't have a shipping`;

  let config = await configCollection.findOne({});
  let marketPlace = await marketPlaceCollection.findOne({ _id: order.marketPlaceId });
  let platform = await platformCollection.findOne({ _id: marketPlace.platformId });

  let label;
  let invoice = { key, number, serie, emissionDate: new Date(emissionDate), xml };
  order.invoice = invoice;

  let error = [];

  switch (platform.code) {
    case "MLB":
      let shipping = await getShippingById(db, config, marketPlace, order.shipping.shippingId);

      if (shipping.substatus == 'invoice_pending') {
        await postShippingInvoice(db, config, marketPlace, order.shipping.shippingId, xml);
        // await sendAutomaticMessage(db, config, marketPlace, order, 'invoiced');
      }

      // tenta imprimir a etiqueta até 5x o meli tem um delay para gerar a etiqueta
      for (let i = 1; i <= 5; i++) {
        try {
          label = await getShippingLabel(db, config, marketPlace, order);
        } catch (e) {
          if (i == 5) error.push(e);
        }

        if (label) break;
        await sleep(5000);
      }

      break;
  }
  let labelUpdate = {};

  if (label) {
    let pathLabel = await uploadFileS3(label, `${order.packId ? order.packId : order.externalId}.txt`);
    labelUpdate.label = pathLabel
    labelUpdate.labelMode = 'S3'
  }

  let pathNf = await uploadFileS3(Buffer.from(xml, "utf-8"), `${key}.xml`)

  labelUpdate.status = 'invoiced';
  labelUpdate.updatedAt = new Date();
  invoice.xml = pathNf;
  invoice.mode = 'pathNf';

  await orderCollection.updateOne({ $or: [{ externalId: parseFloat(orderId) }, { packId: parseFloat(orderId) }], sellerId: { $in: user.sellerIds } }, { $set: { invoice, ...labelUpdate } });

  if (error[0]) throw error[0]

  return label;
}

const getOrderLabel = async (db, user, orderId) => {
  let orderCollection = db.collection('order');
  let configCollection = db.collection('config');
  let marketPlaceCollection = db.collection('marketPlace');
  let platformCollection = db.collection('platform');

  let filterOrder = {
    sellerId: { $in: user.sellerIds },
    $or: [{ externalId: parseFloat(orderId) }, { packId: parseFloat(orderId) }]
  };
  let order = await orderCollection.findOne(filterOrder);

  if (!order) throw `Order ${orderId} not found to this user`;
  if (order.status != 'invoiced') throw `Invalid order status: ${order.status}, needs to be INVOICED`;

  if (order.label) return order.label;

  let config = await configCollection.findOne({});
  let marketPlace = await marketPlaceCollection.findOne({ _id: order.marketPlaceId });
  let platform = await platformCollection.findOne({ _id: marketPlace.platformId });

  let label;
  switch (platform.code) {
    case "MLB":
      label = await getShippingLabelMeli(db, config, marketPlace, order.shipping.shippingId);
      break;
  }

  // grava label na order
  await orderCollection.updateOne({ _id: order._id }, { $set: { label } });

  return label;
}

const putOrderNote = async (db, user, message, orderId) => {
  let orderCollection = db.collection('order');

  let filterOrder = {
    sellerId: { $in: user.sellerIds },
    $or: [{ externalId: parseFloat(orderId) }, { packId: parseFloat(orderId) }]
  };
  await orderCollection.updateOne(filterOrder, { $push: { note: { date: new Date(), message, userId: user._id } } });
}

const putOrderStatus = async (db, user, statusInfo) => {
  let orderCollection = db.collection('order');
  let configCollection = db.collection('config');
  let marketPlaceCollection = db.collection('marketPlace');

  let { status, tracking, orderId } = statusInfo;
  if (status == 3) status = 'shipped'
  if (status == 4) status = 'delivered'
  if (status == 9) status = 'cancelled'

  let filterOrder = {
    sellerId: { $in: user.sellerIds },
    $or: [{ externalId: parseFloat(orderId) }, { packId: parseFloat(orderId) }]
  };

  if (!statusInfo.orderId) throw `body > orderId is required`;
  if (!statusInfo.status) throw `body > status is required`;
  if (statusInfo.tracking == 'shipped' && !statusInfo.tracking) throw `body > tracking is required`;

  let order = await orderCollection.findOne(filterOrder);

  if (status != order.status) {


    await upsertQueue(
      db, 'ORDER', 'API', order.sellerId, order.platformId, order.marketPlaceId,
      user._id, { 'content.orderId': orderId }, { 'content.orderId': orderId }
    );

    if (!['shipped', 'delivered', 'cancelled'].includes(status)) throw `status invalid !`;


    if (!orderId) throw `order ${orderId} not found`

    let updatedOrder;
    if (order.shipping.mode == 'me1') {
      let config = await configCollection.findOne({});
      let marketPlace = await marketPlaceCollection.findOne({ _id: order.marketPlaceId });

      try {

        let deliveredDate = tracking ? tracking.deliveredDate : new Date()

        switch (status) {
          case 'shipped':
            await postShippingStatus(db, config, marketPlace, order.shipping.shippingId, status, 'Produto Enviado', tracking.shippedDate);
            updatedOrder = await orderCollection.updateOne(filterOrder, { $set: { status, tracking } });
            break;



          case 'delivered':
            await postShippingStatus(db, config, marketPlace, order.shipping.shippingId, status, 'Produto Entregue', new Date());
            updatedOrder = await orderCollection.updateOne(filterOrder, { $set: { status, 'tracking.deliveredDate': deliveredDate } });
            break;
        }

      } catch (error) {
        console.log(error)
      }

    } else updatedOrder = await orderCollection.updateOne(filterOrder, { $set: { status } });
    return updatedOrder
  }
}

const getOrderSummary = async (db, user, localDateStart, localDateEnd) => {
  let orderColl = db.collection('order');

  let questionsColl = db.collection('questions');

  let todayStart = new Date(localDateStart);
  let todayEnd = new Date(localDateEnd);

  let filterValues = {
    sellerId: { $in: user.sellerIds },
    dateClosed: {
      $gte: todayStart,
      $lt: todayEnd
    }
  };


  let todayOrdersTotal = await orderColl.aggregate([
    {
      $match: filterValues
    },
    {
      $group: {
        _id: 1,
        total: {
          $sum: "$gross"
        }
      }
    }
  ]).toArray();

  let totalToday = todayOrdersTotal[0] ? todayOrdersTotal[0].total : 0;

  let today = await orderColl.count({
    sellerId: { $in: user.sellerIds },
    dateClosed: {
      $gte: todayStart,
      $lt: todayEnd
    }
  });

  let yesterdayStart = new Date(localDateStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  let yesterdayEnd = new Date(localDateEnd);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  let yesterday = await orderColl.count({
    sellerId: { $in: user.sellerIds },
    dateClosed: {
      $gte: yesterdayStart,
      $lt: yesterdayEnd
    }
  });

  let thisMonthStart = new Date(localDateStart);
  thisMonthStart.setDate(1);

  let thisMonthEnd = new Date(localDateStart);
  thisMonthEnd = new Date(thisMonthEnd.getFullYear(), thisMonthEnd.getMonth() + 1, 1);
  thisMonthEnd.setSeconds(thisMonthEnd.getSeconds() - 1);

  let thisMonth = await orderColl.count({
    sellerId: { $in: user.sellerIds },
    dateClosed: {
      $gte: thisMonthStart,
      $lt: thisMonthEnd
    }
  });

  let filterMonthTotal = {
    sellerId: { $in: user.sellerIds },
    dateClosed: {
      $gte: thisMonthStart,
      $lt: thisMonthEnd
    }
  }

  let monthOrdersTotal = await orderColl.aggregate([
    {
      $match: filterMonthTotal
    },
    {
      $group: {
        _id: 1,
        total: {
          $sum: "$gross"
        }
      }
    }
  ]).toArray();

  let totalMonth = monthOrdersTotal.length ? monthOrdersTotal[0].total : 0

  thisMonthStart.setMonth(thisMonthStart.getMonth() - 1);

  thisMonthEnd = new Date(localDateEnd)
  thisMonthEnd.setMonth(thisMonthEnd.getMonth() - 1);

  let lastMonth = await orderColl.count({
    sellerId: { $in: user.sellerIds },
    dateClosed: {
      $gte: thisMonthStart,
      $lt: thisMonthEnd
    }
  });



  let questions = await questionsColl.count({
    sellerId: { $in: user.sellerIds },
    createdAt: {
      $gte: todayStart,
      $lt: todayEnd
    }
  });

  const result = getDaysInCurrentMonth();

  let ticket = monthOrdersTotal[0] ? monthOrdersTotal[0].total / result : 0;

  return {
    today,
    totalToday,
    yesterday,
    thisMonth,
    totalMonth,
    lastMonth,
    ticket,
    questions
  };
}

const filterOrder = (filter, user) => {
  let {
    dateclosedfrom,
    dateclosedto,
    orderid,
    sku,
    mediation,
    buyername,
    buyerDocument,
    sellerid,
    marketPlaceId,
    platformId,
    status,
    paymentstatusid,
    subStatus,
    medStatus
  } = filter;


  let filterMongo = {};

  if (buyerDocument) filterMongo['buyer.document'] = buyerDocument.replace(/\D/g, '')
  if (buyername) filterMongo['buyer.name'] = new RegExp(".*" + escapeSpecialChar(buyername) + ".*", "i");
  if (marketPlaceId) filterMongo['marketPlaceId'] = { $in: marketPlaceId.map(m => { return new ObjectId(m) }) };
  if (platformId) filterMongo['platformId'] = { $in: platformId.map(m => { return new ObjectId(m) }) };
  if (status) filterMongo['status'] = { $in: status };
  if (orderid) filterMongo['$or'] = [{ externalId: parseInt(orderid) }, { packId: parseInt(orderid) }];
  if (sku) filterMongo['items.sku'] = { $in: sku.split(',').map(m => { return new RegExp(".*" + m + ".*", "i") }) }
  if (paymentstatusid) filterMongo['payments.status'] = { $in: paymentstatusid }
  if (subStatus) filterMongo['subStatus'] = { $in: subStatus }
  if (medStatus) filterMongo['mediation.status'] = medStatus
  if (mediation && !medStatus) filterMongo['mediation.status'] = 'open'
  if (mediation) filterMongo['mediation.createdUser'] = mediation



  if (sellerid) {
    sellerid = sellerid.map(m => { return new ObjectId(m) });
    sellerid.forEach(f => checkSellerByUserToken(user, f));
    filterMongo.sellerId = { $in: sellerid };
  } else {
    filterMongo.sellerId = { $in: user.sellerIds };
  }

  if (dateclosedfrom || dateclosedto) {
    filterMongo.dateClosed = {};
    if (dateclosedfrom) filterMongo.dateClosed.$gte = new Date(dateclosedfrom);
    if (dateclosedto) filterMongo.dateClosed.$lte = new Date(dateclosedto);
  }

  return filterMongo;
}

const getOrderList = async (db, user, filter) => {
  let orderColl = db.collection('order');
  let sellerColl = db.collection('seller');
  let marketPlaceColl = db.collection('marketPlace');
  let platformColl = db.collection('platform');

  let filterMongo = filterOrder(filter, user);

  let {
    offset,
    limit
  } = filter;

  if (limit > 500) throw 'limit exceeded maximum 500!'

  offset = parseInt(offset ? offset : 0);
  limit = parseInt(limit ? limit : 500);

  let column = {
    externalId: 1,
    packId: 1,
    dateClosed: 1,
    'buyer.name': 1,
    marketPlaceId: 1,
    'buyer.document': 1,
    'mediation.status': 1,
    sellerId: 1,
    platformId: 1,
    status: 1,
    freight: 1,
    freightClient: 1,
    freightSeller: 1,
    receivement: 1,
    gross: 1,
    total: 1,
    receivement: 1,
    sale_fee: 1,
    items: 1,
    labelMode: 1,
    label: 1,
    printedLabel: 1,
    note: 1,
    'invoice.xml': 1,
    'mediation.createdUser': 1,


  };



  let orderList = await orderColl.find(filterMongo, { projection: column })
    .sort({ dateClosed: -1 })
    .limit(limit)
    .skip(offset)
    .toArray();

  let sellers = await sellerColl.find({ _id: { $in: orderList.map(m => { return m.sellerId }) } }).toArray();
  let marketPlaces = await marketPlaceColl.find({ _id: { $in: orderList.map(m => { return m.marketPlaceId }) } }).toArray();
  let platforms = await platformColl.find({ _id: { $in: orderList.map(m => { return m.platformId }) } }).toArray();

  let newOrderList = orderList.map(m => {
    let status = m.status;

    switch (m.status) {
      case 'cancelled':
        status = 'Cancelado';
        break;
      case 'invoiced':
        status = 'Faturado';
        break;
      case 'paid':
        status = 'Pago';
        break;
      case 'shipped':
        status = 'Enviado';
        break;
      case 'delivered':
        status = 'Entregue';
        break;
      case 'not_delivered':
        status = 'Devolvido';
        break;

    };

    // switch (m.subStatus) {
    //     case 'waitingSeparation':
    //         subStatus = 'Aguardando Separação';
    //         break;
    //     case 'inSeparation':
    //         subStatus = 'Em Separação';
    //         break;
    //     case 'cancelled':
    //         subStatus = 'Cancelado';
    //         break;


    // };

    let marketPlace = marketPlaces.find(f => f._id.equals(m.marketPlaceId));
    let seller = sellers.find(f => f._id.equals(m.sellerId));
    let platform = platforms.find(f => f._id.equals(m.platformId));

    return {
      _id: m._id,
      gross: m.gross ? m.gross : 0,
      orderId: m.packId ? m.packId : m.externalId,
      dateClosed: m.dateClosed,
      document: m.buyer.document,
      name: m.buyer.name,
      orderid: m.externalId,
      status,
      printedLabel: m.printedLabel,
      id: m._id,
      sellerId: m.sellerId,
      sellerCode: seller.code,
      sellerName: seller.name,
      marketPlaceId: m.marketPlaceId,
      marketPlaceName: marketPlace.name,
      marketPlaceOficial: marketPlace.sellerId == null,
      freight: m.freight,
      freightClient: m.freightClient ? m.freightClient : '',
      freightSeller: m.freightSeller ? m.freightSeller : '',
      receivement: m.receivement ? m.receivement : '',
      sale_fee: m.sale_fee ? m.sale_fee : '',
      total: Number(m.total),
      receivement: m.receivement,
      items: m.items,
      labelMode: m.labelMode ? m.labelMode : '',
      label: m.label ? m.label : '',
      platformCode: platform.code,
      platformName: platform.name,
      'invoice.xml': m.invoice ? m.invoice : '',
      mediation: m.mediation
      // subStatus
    }
  });

  let total = await orderColl.countDocuments(filterMongo);


  let totalStatus = await orderColl.aggregate([
    { $match: filterMongo },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]).toArray();

  let totalFilterMoney = await orderColl.aggregate([
    {
      $match: filterMongo
    },
    {
      $group: {
        _id: 1,
        total: {
          $sum: "$gross"
        }
      }
    }
  ]).toArray();

  let totalFilter = totalFilterMoney.length > 0 ? totalFilterMoney[0].total : 0

  return {
    total,
    totalStatus,
    totalFilter,
    offset,
    limit: limit > total ? total : limit,
    items: newOrderList
  };
}

const mediateOrder = async (db, info, user) => {
  try {


    let orderColl = db.collection('order');

    let external = info.externalId
    let externalId = Number(external)
    let status = info.status
    let replace = info.allowReplace == 'true' ? true : false
    let situation = info.situation

    let checkReopen = await orderColl.findOne({ $or: [{ externalId }, { packId: externalId }] });
    let reopen = checkReopen.mediation == null ? false : true

    let message = {
      date: new Date(),
      message: info.message ? info.message : undefined,
      user: user.document,
      userName: user.name,
      userPic: user.picture
    }

    let mediation = {
      status: status,
      createdAt: new Date(),
      conversation: message ? [message] : '',
      createdUser: user.document,
      allowReplace: replace ? replace : false,
      situation: situation ? situation : null
    }

    await orderColl.update({ $or: [{ externalId }, { packId: externalId }] },
      { $set: status == 'closed' || reopen == true ? { 'mediation.status': status, 'mediation.situation': situation } : { mediation } }, { upsert: true });

    if (situation == 'devolution') {
      await orderColl.update({ $or: [{ externalId }, { packId: externalId }] },
        { $set: { status: 'cancelled' } });
    }

  } catch (error) {
    console.log(err)
  }
}

const mediateMessageOrder = async (db, info, user, image) => {

  let orderColl = db.collection('order');

  if (!info.message && image.length == 0) throw 'A Mensagem deve conter imagem ou texto'

  let message = {
    date: new Date(),
    message: info.message,
    user: user.document,
    picture: image,
    userName: user.name,
    userPic: user.picture
  }

  await orderColl.updateOne({
    _id: new ObjectId(info._id)
  }, {
    $push: {
      'mediation.conversation': message
    }
  });

}

const getOrderDetail = async (db, user, orderId) => {
  let orderColl = db.collection('order');
  let sellerColl = db.collection('seller');
  let marketPlaceColl = db.collection('marketPlace');
  let platformColl = db.collection('platform');
  let skuXPublishColl = db.collection('skuXPublish');
  let skuColl = db.collection('sku');

  let orderDetail = await orderColl.findOne({
    $or: [{ externalId: parseInt(orderId) }, { packId: parseInt(orderId) }]
  });
  if (!orderDetail) throw 'Venda não encontrada'

  let skuXPublishies = await skuXPublishColl.find({ sku: { $in: orderDetail.items.map(m => m.sku) } }).toArray();
  let skus = await skuColl.find({ sku: { $in: orderDetail.items.map(m => m.sku) } }).toArray();


  for (let item of orderDetail.items) {
    let skuXPublish = skuXPublishies.find(f => f.sku == item.sku);
    let sku = skus.find(f => f.sku == item.sku);

    if (sku?.image && sku.image.length > 0) item.skuImage = sku.image[0];
    if (skuXPublish?.images && skuXPublish.images.length > 0) item.skuImage = skuXPublish.images[0];

    item.title = sku?.title ? sku.title : item.title
  }


  let seller = await sellerColl.findOne({ _id: orderDetail.sellerId })
  let marketPlace = await marketPlaceColl.findOne({ _id: orderDetail.marketPlaceId })
  let platform = await platformColl.findOne({ _id: orderDetail.platformId })


  if (orderDetail.invoice ? orderDetail.invoice.mode : '' == 'pathNf') {
    orderDetail.invoice.xml = orderDetail.invoice.xml;
  }

  if (orderDetail ? orderDetail.labelMode : '' == 'labelNf') {
    orderDetail.label = orderDetail.label;
  }

  if (!orderDetail.note) orderDetail.note = [];

  let userColl = db.collection('user');
  let usersByMessage = await userColl.find({ _id: { $in: orderDetail.note.map(m => m.userId) } }).toArray();

  return {
    ...orderDetail,
    sellerCode: seller.code,
    sellerName: seller.name,
    marketPlaceName: marketPlace.name,
    platformName: platform.name,
    conversation: Array.isArray(orderDetail.mediation?.conversation) ? orderDetail.mediation.conversation.map(m => { return { ...m, newDate: m.date.toLocaleString() } }) : [],
    note: orderDetail.note.map(m => {
      return {
        ...m,
        userName: usersByMessage.find(f => f._id.equals(m.userId)).name
      }
    })

  }

}

const getOrderReport = async (db, user, filter) => {
  let orderColl = db.collection('order');
  let sellerColl = db.collection('seller');
  let marketPlaceColl = db.collection('marketPlace');
  let platformColl = db.collection('platform');
  let filterMongo = filterOrder(filter, user);
  let totalOrder = await orderColl.count(filterMongo);

  let data = [];

  for (let i = 0; i <= totalOrder / 1000; i++) {
    let orderList = await orderColl.find(filterMongo, { projection: { 'invoice.xml': 0, label: 0 } })
      .sort({ dateClosed: -1 })
      .limit(1000)
      .skip(i * 1000)
      .toArray();

    let sellers = await sellerColl.find({ _id: { $in: orderList.map(m => { return m.sellerId }) } }).toArray();
    let marketPlaces = await marketPlaceColl.find({ _id: { $in: orderList.map(m => { return m.marketPlaceId }) } }).toArray();
    let platforms = await platformColl.find({ _id: { $in: orderList.map(m => { return m.platformId }) } }).toArray();

    orderList.map(m => {
      let status = m.status;

      switch (m.status) {
        case 'cancelled':
          status = 'Cancelado';
          break;
        case 'invoiced':
          status = 'Faturado';
          break;
        case 'paid':
          status = 'Pago';
          break;
        case 'shipped':
          status = 'Enviado';
          break;
        case 'delivered':
          status = 'Entregue';
          break;
        case 'not_delivered':
          status = 'Devolvido';
          break;
      };

      let seller = sellers.find(f => f._id.equals(m.sellerId));

      for (let item of m.items) {

        let listingType = item.listingType;

        switch (item.listingType) {
          case 'gold_pro':
            listingType = 'Premium';
            break;
          case 'gold_special':
            listingType = 'Clássico';
            break;
        }

        let retorno = {
          Pedido: m.packId ? m.packId.toString() : m.externalId.toString(),
          'Data da Venda': m.dateClosed ? m.dateClosed.toLocaleString('pt-BR') : null,
          'Data do cadastro': m.createdAt ? m.createdAt.toLocaleString('pt-BR') : null,
          'Ultima Atualização': m.updatedAt ? m.updatedAt.toLocaleString('pt-BR') : null,
          Status: status,
          Empresa: seller.name,
          'Nome do comprador': m.buyer.name,
          'Tipo documento': m.buyer.documentType,
          Documento: m.buyer.document,
          SKU: item.sku,
          Shipping: m.shipping?.shippingId,
          'Valor total': m.gross,
          'Frete Empresa': m.freightSeller,
          'Frete Cliente': m.freightClient,
          'Tipo de Anúncio': listingType,
          'Comissão Venda': item.saleFee,
          'Descrição sku': item.title,
          Quantidade: item.amount,
          'Valor unitário': item.unit,
          'Previsão de entrega': m.shipping && m.shipping.estimateDeliveryDate ? m.shipping.estimateDeliveryDate.toLocaleString('pt-BR') : null,
          Logradouro: m.shipping ? m.shipping.address : null,
          Bairro: m.shipping ? m.shipping.neighborhood : null,
          Cidade: m.shipping ? m.shipping.city : null,
          UF: m.shipping ? m.shipping.state : null,
          CEP: m.shipping ? m.shipping.zipCode : null,
          'Forma Envio': m.shipping ? m.shipping.mode : 'À combinar',
          Chave: m.invoice ? m.invoice.key : null,
          Número: m.invoice ? m.invoice.number : null,
          Serie: m.invoice ? m.invoice.serie : null,
          Emissão: m.invoice && m.invoice.emissionDate ? m.invoice.emissionDate.toLocaleString('pt-BR') : null
        };
        data.push(retorno);
      }
    });
  }

  return data;
}

const getOrderLabelSaved = async (db, user, orderId) => {
  let orderColl = db.collection('order');

  let value = await orderColl.findOne({
    sellerId: { $in: user.sellerIds },
    $or: [{ externalId: parseInt(orderId) }, { packId: parseInt(orderId) }]
  }, { projection: { label: 1, labelMode: 1 } });

  if (value.labelMode == 'S3') {
    value
    value.label = await getLinkStorage(value.label);
  }

  return value;
}

const getInvoicedMeliFulfillment = async (db, data, config) => {

  let order = data;
  let marketPlaceColl = db.collection('marketPlace');
  let marketPlace = await marketPlaceColl.find({ _id: data.marketPlaceId }).toArray();

  if (order.shipping.fulfillment == true) {

    let invoice = {};

    let ret = await getInvoiceMeli(db, config, marketPlace, data);
    let xml = await getXmlMeli(db, config, marketPlace, ret.id);
    let pathNf = await uploadFileS3(Buffer.from(xml, "utf-8"), `${ret.attributes.invoice_key}.xml`);

    invoice['serie'] = ret.invoice_series;
    invoice['number'] = ret.invoice_number;
    invoice['key'] = ret.attributes.invoice_key;
    invoice['emissionDate'] = new Date(ret.attributes.authorization_date);
    invoice['xml'] = pathNf;

    return invoice;
  }
}

const getOrderExpeditionList = async (db, user, offset, limit, status, data) => {


  if (limit > 500) throw 'limit exceeded maximum 500!'

  offset = parseInt(offset ? offset : 0);
  limit = parseInt(limit ? limit : 500);

  let column = {
    externalId: 1,
    packId: 1,
    dateClosed: 1,
    marketPlaceId: 1,
    printed: 1,
    'buyer.name': 1,
    sellerId: 1,
    platformId: 1,
    note: 1,
    labelMode: 1,
    label: 1,
    printedLabel: 1,
    'shipping.shippedDate': 1,
    'shipping.dispatchId': 1

  };

  let orderColl = db.collection('order');
  let sellersColl = db.collection('seller');
  let marketPlaceColl = db.collection('marketPlace');
  let platformsColl = db.collection('platform');

  let filterMongo = {};

  if (data.dateclosedfrom || data.dateclosedto) {
    filterMongo.dateClosed = {};
    if (data.dateclosedfrom) filterMongo.dateClosed.$gte = new Date(data.dateclosedfrom);
    if (data.dateclosedto) filterMongo.dateClosed.$lte = new Date(data.dateclosedto);
  }


  if (data.shippedDateFrom && data.shippedDateTo) filterMongo = { 'shipping.shippedDate': { $gte: new Date(data.shippedDateFrom), $lte: new Date(data.shippedDateTo) } };

  if (Array.isArray(data.printed) && data.printed.filter(f => f == 'true').length == 1 && data.printed.length == 1) filterMongo.printed = true

  if (Array.isArray(data.printed) && data.printed.filter(f => f == 'false').length == 1 && data.printed.length == 1) filterMongo.printed = { $ne: true }

  if (Array.isArray(data.printedLabel) && data.printedLabel.filter(f => f == 'true').length == 1 && data.printedLabel.length == 1) filterMongo.printedLabel = true

  if (Array.isArray(data.printedLabel) && data.printedLabel.filter(f => f == 'false').length == 1 && data.printedLabel.length == 1) filterMongo.printedLabel = { $ne: true }

  if (data.platformId) filterMongo.platformId = { $in: data.platformId.map(m => new ObjectId(m)) };
  if (data.orderNumber) filterMongo = { $or: [{ externalId: parseFloat(data.orderNumber) }, { packId: parseFloat(data.orderNumber) }] };
  if (data.name) filterMongo['buyer.name'] = new RegExp(".*" + escapeSpecialChar(data.name) + ".*", "i");
  if (data.sellerId) filterMongo.sellerId = { $in: data.sellerId.map(m => new ObjectId(m)) };
  if (data.dispatchId) filterMongo['shipping.dispatchId'] = data.dispatchId;
  filterMongo.status = status;
  let orderList = await orderColl.find(filterMongo)
    .sort({ dateClosed: 1 })
    .limit(limit)
    .skip(offset)
    .toArray();

  let sellers = await sellersColl.find({}).toArray();
  let platforms = await platformsColl.find({}).toArray();
  let marketPlaces = await marketPlaceColl.find({}).toArray();

  let total = await orderColl.count(filterMongo);
  orderMap = orderList.map(m => {

    let marketPlace = marketPlaces.find(f => f._id.equals(m.marketPlaceId));
    let seller = sellers.find(f => f._id.equals(m.sellerId));
    let platform = platforms.find(f => f._id.equals(m.platformId));

    return {
      ...m,
      orderId: m.packId ? m.packId : m.externalId,
      name: m.buyer.name,
      dateClosed: m.dateClosed,
      printed: m.printed == true || m.printed == 'true' ? true : false,
      sellerName: seller.name,
      label: m.label,
      printedLabel: m.printedLabel,
      labelMode: m.labelMode ? m.labelMode : '',
      platformName: platform.name,
      marketPlaceName: marketPlace.name,
      note: m.note ? m.note : undefined,
      'dispatchId': m.shipping.dispatchId ? m.shipping.dispatchId : '',
      shippedDate: m.shipping.shippedDate ? m.shipping.shippedDate : ''

    }

  });
  return {
    offset,
    limit: limit > total ? total : limit,
    total,
    orderMap
  };
}

const getOrderPickingList = async (db, user, orders, printed) => {

  let orderColl = db.collection('order');
  let platformColl = db.collection('platform');
  let marketPlaceColl = db.collection('marketPlace');
  let sellerColl = db.collection('seller');
  let skuColl = db.collection('sku');

  let platform = await platformColl.find({}).toArray();
  let marketPlace = await marketPlaceColl.find({}).toArray();
  let seller = await sellerColl.find({}).toArray();

  let column = {
    externalId: 1,
    packId: 1,
    dateClosed: 1,
    marketPlaceId: 1,
    subStatus: 1,
    buyer: 1,
    sellerId: 1,
    platformId: 1,
    items: 1,
    label: 1,

  };
  let filterOrder = {
    sellerId: { $in: user.sellerIds },
    $or: [{ externalId: { $in: orders.map(m => parseFloat(m)) } }, { packId: { $in: orders.map(m => parseFloat(m)) } }]
  };

  let orderPickigList = await orderColl.find(filterOrder, { projection: column }).toArray();

  skuPickigList = orderPickigList.map(m => m.items.map(mm => mm.sku));

  let arraySku = skuPickigList.reduce((list, sub) => list.concat(sub), []);

  let sku = await skuColl.find({ sku: { $in: arraySku } }, { projection: { sku: 1, address: 1 } }).toArray();

  let setUpdate = {};

  if (printed.printedLabel) setUpdate['printedLabel'] = true;
  if (printed.printed) setUpdate['printed'] = true;
  await orderColl.updateMany(filterOrder, { $set: setUpdate })

  for (let orderLabel of orderPickigList) {
    if (orderLabel.label) {
      let labelZPL = await getOrderLabelSaved(db, user, orderLabel.packId ? orderLabel.packId : orderLabel.externalId);
      orderLabel.label = labelZPL.label;
      labelBuffer = await getZPLImage(orderLabel.label);
      orderLabel.label = Buffer.from(labelBuffer.data, 'binary').toString('base64');

    }
  }



  return orderPickigList.map(m => {
    return {
      order: m.packId ? m.packId : m.externalId,
      marketPlace: marketPlace.find(f => f._id.equals(m.marketPlaceId)).name,
      seller: seller.find(f => f._id.equals(m.sellerId)).name,
      dateClosed: m.dateClosed,
      name: m.buyer.name,
      label: m.label,
      document: m.buyer.document,
      platform: platform.find(f => f._id.equals(m.platformId)).name,
      items: m.items.map(mm => { return { sku: mm.sku, title: mm.title, quantity: mm.amount, address: '' } })

    }
  });
}

const getMensagemOrder = async (db, orderId, user) => {

  let orderColl = db.collection('order');

  let columns = {

    externalId: 1,
    packId: 1,
    note: 1

  };
  let orderMensagem = await orderColl.find({ $or: [{ externalId: parseFloat(orderId) }, { packId: parseFloat(orderId) }] }, { projection: columns }).toArray();

  return orderMensagem.map(m => {
    return {

      order: m.packId ? m.packId : m.externalId,
      note: m.note
    }
  });
}

module.exports = {
  meliOrderToDigigrowOrder,
  sendOrderInvoice,
  getOrderLabel,
  putOrderStatus,
  getOrderDetail,
  getOrderSummary,
  getOrderList,
  getOrderReport,
  getOrderLabelSaved,
  putOrderNote,
  getInvoicedMeliFulfillment,
  getOrderExpeditionList,
  getOrderPickingList,
  getMensagemOrder,
  mediateOrder,
  mediateMessageOrder
};
