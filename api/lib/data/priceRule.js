const { getAndCheckParamsType } = require("../util/api");
const { toFixed } = require("../util/javaScript");
const { ObjectId } = require('mongodb');

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

const upsertPriceRule = async (db, values, user, priceRuleId = null) => {
  let priceRuleColl = db.collection('priceRule');
  let data = {};
  let calc = {};

  let {
    sellerId,
    platformId,
    marketPlaceId,
    title,
    startDate,
    endDate,
    operation,
    value,
    publishFilters,
  } = values;

  if (sellerId) data['sellerId'] = ObjectId(sellerId);
  if (platformId) data['platformId'] = ObjectId(platformId);
  if (marketPlaceId) data['marketPlaceId'] = ObjectId(marketPlaceId);
  if (title) data['title'] = title;
  if (operation) calc['operation'] = operation;
  if (value) calc['value'] = parseFloat(value);
  if (calc) data['calc'] = calc;
  if (startDate) data['startDate'] = new Date(startDate);
  if (!startDate) data['startDate'] = new Date();
  if (endDate) data['endDate'] = new Date(endDate);
  if (!endDate) data['endDate'] = new Date();
  if (publishFilters) data['publishFilters'] = publishFilters;

  getAndCheckParamsType(
    data, values, 'boolean',
    [
      'active',
    ]
  );

  let id;
  if (priceRuleId) {
    id = priceRuleId;
    await priceRuleColl.updateOne({ _id: new ObjectId(priceRuleId) }, { $set: { ...data, updatedAt: new Date(), updatedUser: user.document }, });
  }
  else
    id = (await priceRuleColl.insertOne({ ...data, createdAt: new Date(), createdUser: user.document })).insertedId;

  return id;
}

module.exports = { getPriceWithRule, upsertPriceRule };