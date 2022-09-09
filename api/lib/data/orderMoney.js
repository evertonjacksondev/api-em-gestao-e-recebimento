const { date } = require('azure-storage');
const { ObjectId } = require('mongodb');


const putMoneyOrderMoviment = async (db, digiOrder, user, payBack = false) => {
  let orderId = digiOrder.packId ? digiOrder.packId : digiOrder.externalId;

  let orderMoney = await db.collection('moneyOrder').find({ orderId }).toArray();

  if (!payBack || (payBack && orderMoney.length > 0 && !orderMoney.find(f => f.payBack))) {
    let moneyOrderColl = db.collection('moneyOrder');

    let data = {
      sellerId: digiOrder.sellerId,
      gross: payBack ? (digiOrder.gross || 0) * -1 : (digiOrder.gross || 0),
      freight: payBack ? (digiOrder.freightSeller || 0) * -1 : (digiOrder.freightSeller || 0),
      digiFee: payBack ? (digiOrder.digiFee || 0) * -1 : (digiOrder.digiFee || 0),
      saleFee: payBack ? (digiOrder.saleFee || 0) * -1 : (digiOrder.saleFee || 0),
      receivement: payBack ? (digiOrder.receivement || 0) * -1 : (digiOrder.receivement || 0),
      paymentStatus: payBack ? 'received' : 'pending',
      orderId,
      payBack,
      transactionDate: digiOrder.dateClosed,
      createdAt: digiOrder.dataClosed
    }

    await moneyOrderColl.insertOne(
      {
        ...data,
        createdAt: new Date,
        user
      }

    );

    if (data.payBack) {
      await moneyOrderColl.updateMany({ orderId, paymentStatus: 'pending' }, { $set: { paymentStatus: 'received' } })
    }
  }
}

const putMoneyOrderStatus = async (db, orderId, paymentStatus) => {
  let moneyOrderColl = await db.collection('moneyOrder');

  money = await moneyOrderColl.updateMany({ orderId }, { $set: { paymentStatus } })
}

const getOrderMoneyList = async (db, filter, user) => {
  let moneyOrderColl = db.collection('moneyOrder');
  let orderColl = db.collection('order');

  let filtro = {};

  let {
    limit,
    offset,
    paymentStatus,
    orderId,
    sellerId,
    dateFrom,
    dateTo,
    payBack,

  } = filter;

  if (payBack) filtro['payBack'] = payBack == 'true';
  if (orderId) filtro['orderId'] = Number(orderId);
  if (paymentStatus) filtro['paymentStatus'] = { $in: paymentStatus };
  if (sellerId) {


    sellerId = sellerId.map(m => { return new ObjectId(m) });
    filtro.sellerId = { $in: sellerId };


  } else {
    filtro.sellerId = { $in: user.sellerIds };
  }

  if (dateTo || dateFrom) {
    filtro.transactionDate = {};
    if (dateFrom) filtro.transactionDate.$gte = new Date(dateFrom);
    if (dateTo) filtro.transactionDate.$lt = new Date(dateTo);
  }

  if (filter.closedDate && filter.closedDate.closedDateTo) {
    filtro.dateClosed = {};
    if (filter.closedDate.closedDateFrom) filtro.dateClosed.$gte = filter.closedDate.closedDateFrom;
    if (filter.closedDate.closedDateTo) filtro.dateClosed.$lt = filter.closedDate.closedDateTo;
  }


  offset = Number(offset);
  limit = Number(limit);

  if (orderId) filtro['orderId'] = Number(orderId);
  if (paymentStatus) filtro['paymentStatus'] = { $in: paymentStatus };
  if (sellerId) {
    sellerId = sellerId.map(m => { return new ObjectId(m) });
    filtro.sellerId = { $in: sellerId };


  } else {
    filtro.sellerId = { $in: user.sellerIds };
  }

  if (dateTo || dateFrom) {
    filtro.transactionDate = {};
    if (dateFrom) filtro.transactionDate.$gte = new Date(dateFrom);
    if (dateTo) filtro.transactionDate.$lt = new Date(dateTo);
  }

  offset = Number(offset);
  limit = Number(limit);

  let total = await moneyOrderColl.count(filtro);

  let moneyOrders = await moneyOrderColl.find(filtro).skip(offset).limit(limit).toArray();

  let orders = await orderColl.find(
    {
      $or: [
        { externalId: { $in: moneyOrders.map(m => m.orderId) } },
        { packId: { $in: moneyOrders.map(m => m.orderId) } }
      ]
    },
    { projection: { packId: 1, externalId: 1, dateClosed: 1, total: 1, 'buyer.name': 1, 'shipping.shippingId': 1, freightClient: 1, freightSeller: 1, gross: 1 } }
  ).sort({ dateClosed: 1 }).toArray();

  let filteredOrders = []

  for (newOrder of moneyOrders) {
    let sellerColl = db.collection('seller')
    filteredOrders.push({ ...newOrder, sellerInfo: await sellerColl.findOne({ _id: newOrder.sellerId }) })
  }

  return {
    total,
    list: filteredOrders.map(m => {
      let title;
      switch (m.paymentStatus) {
        case 'pending':
          title = 'Pendente';
          break;
        case 'received':
          title = 'Recebido';
          break;
        case 'concluded':
          title = 'Concluído';
          break;
      }

      let order = orders.find(f => f.externalId == m.orderId || f.packId == m.orderId);


      return {

        ...m,
        shipping: Object.keys(order.shipping).length > 0 && order.shipping.shippingId ? order.shipping.shippingId.toString() : null,
        buyerName: order.buyer.name,
        paymentStatus: title,
        freightClient: order.freightClient,
        freightSeller: order.freightSeller,
        productSum: order.gross,
        dateClosed: m.dateClosed ? m.dateClosed.toLocaleDateString() : 'Não conluído',
        newTansactionDate: m.transactionDate.toLocaleDateString(),
        newCreatedAt: m.createdAt.toLocaleDateString(),
        createdAt: m.createdAt.toLocaleTimeString(),
        sellerName: m.sellerInfo.code

      }
    })

  }
}



const getOrderMoneyReport = async (db, headers, day, year, month, paymentStatus) => {
  let sellerId = new ObjectId(headers.sellerid)
  let closedDate = {}
  if (year && month && day) {
    closedDate.closedDateFrom = new Date(`${year}-${month}-${day}`);
    let untreatedClosedDateto = new Date(`${year}-${month}-${day}`).setHours(23, 59, 59, 999);
    closedDate.closedDateTo = new Date(untreatedClosedDateto)
  }

  let status = paymentStatus
  let moneyReport = {};
  let filterMongo = {
    paymentStatus: {
      $in: status ? status : ['concluded'],
    },
    sellerId: sellerId,
  }

  if (closedDate && closedDate.closedDateTo) {
    filterMongo.dateClosed = {};
    if (closedDate.closedDateFrom) filterMongo.dateClosed.$gte = closedDate.closedDateFrom;
    if (closedDate.closedDateTo) filterMongo.dateClosed.$lt = closedDate.closedDateTo;
  }

  let moneyOrderColl = db.collection('moneyOrder');
  let orderColl = db.collection('order');
  let totalOrder = await moneyOrderColl.count(filterMongo);


  for (let i = 0; i <= totalOrder / 1000; i++) {
    let orderList = await moneyOrderColl.find(filterMongo)
      .sort({ dateClosed: -1 })
      .limit(1000)
      .skip(i * 1000)
      .toArray();

    let statusList = [...new Set(orderList.map(item => item.paymentStatus))]

    for (let status of statusList) {
      if (!moneyReport[status]) moneyReport[status] = [];
      moneyReport[status].push(...orderList.filter(f => f.paymentStatus == status));
    }

  }

  for (let status in moneyReport) {
    let orders = await orderColl.find(
      {
        $or: [
          { externalId: { $in: moneyReport[status].map(m => m.orderId) } },
          { packId: { $in: moneyReport[status].map(m => m.orderId) } }
        ]
      },
      { projection: { packId: 1, externalId: 1, dateClosed: 1, total: 1, 'buyer.name': 1, 'shipping.shippingId': 1, freightClient: 1, freightSeller: 1, gross: 1 } }
    ).sort({ dateClosed: 1 }).toArray();

    Array.isArray(moneyReport[status]) && moneyReport[status].map((m, i, arr) => {
      let order = orders.find(f => f.externalId == m.orderId || f.packId == m.orderId);
      arr[i] = {
        transaçãoData: m.transactionDate.toLocaleDateString(),
        pedido: m.orderId.toString(),
        shipping: order.shipping.shippingId,
        Cliente: order.buyer.name,
        SomaProdutos: m.payBack ? order.gross * -1 : order.gross,
        taxaMeli: m.saleFee,
        taxaDigigrow: m.digiFee,
        freteCliente: m.payBack ? order.freightClient * -1 : order.freightClient,
        freteLoja: m.payBack ? order.freightSeller * -1 : order.freightSeller,
        ValorLiquido: m.receivement,
        Cancelado: m.payBack ? 'sim' : 'Não'
      }
    }
    )
  }

  return moneyReport;
}

const getOrderMoneyConcludedMonths = async (db, user) => {
  let moneyOrderColl = db.collection('moneyOrder');

  let ret = await moneyOrderColl.aggregate([
    {
      $match: {
        sellerId: {
          $in: user.sellerIds
        },
        paymentStatus: 'concluded'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$dateClosed" },
          month: { $month: "$dateClosed" },
          day: { $dayOfMonth: "$dateClosed" },
        },
        concludedValue: { $sum: "$receivement" },
      }
    }
  ]).toArray();
  return ret;
}

const getOrderMoneySummary = async (db, user, day, year, month, paymentStatusArray, sellerId) => {
  if (sellerId === '') sellerId = undefined

  let sel = new ObjectId(sellerId)

  let filter = {
    sellerId: sellerId ? sel : { $in: user.sellerIds }
  };

  if (year && month && day) {
    filter.day = Number(day);
    filter.year = Number(year);
    filter.month = Number(month);
  }

  if (paymentStatusArray)
    filter.paymentStatus = { $in: paymentStatusArray };

  let moneyOrderColl = db.collection('moneyOrder');

  let groupedMoney = await moneyOrderColl.aggregate([
    {
      $project: {
        paymentStatus: 1,
        receivement: 1,
        freight: 1,
        digiFee: 1,
        saleFee: 1,
        gross: 1,
        orderId: 1,
        payBack: 1,
        sellerId: 1,
        day: { $dayOfMonth: '$dateClosed' },
        month: { $month: '$dateClosed' },
        year: { $year: '$dateClosed' }
      }
    },
    {
      $match: filter
    },
    {
      $group: {
        _id: {
          id: {
            paymentStatus: "$paymentStatus",
            sellerId: "$sellerId",
            payBack: "$payBack"
          }
        },
        digiFee: {
          $sum: "$digiFee"
        },
        saleFee: {
          $sum: "$saleFee"
        },
        gross: {
          $sum: "$gross"
        },
        receivement: {
          $sum: "$receivement"
        },
        freight: {
          $sum: "$freight"
        }
      }
    }
  ]).toArray();

  let sellerColl = db.collection('seller');
  let sellers = await sellerColl.find({ _id: { $in: groupedMoney.map(m => m._id.id.sellerId) } }).toArray();

  return sellers.map(m => {
    let moneyBySeller = groupedMoney.filter(f => f._id.id.sellerId.equals(m._id));

    let ret = { sellerName: m.code, pic: m.picture };

    for (let money of moneyBySeller) {
      ret[`${money._id.id.payBack ? 'pb_' : ''}${money._id.id.paymentStatus}`] = money;
    }

    return ret;
  })

}

module.exports = {
  putMoneyOrderMoviment,
  putMoneyOrderStatus,
  getOrderMoneyList,
  getOrderMoneyReport,
  getOrderMoneyConcludedMonths,
  getOrderMoneySummary
}
