const { truncateSync } = require('fs');
const { ObjectId } = require('mongodb');
const { getItemById, getDescription, getPublishQuality, putItemById, postListingTypeItemById, postDescriptionItemById, deleteCampaing, postCreatedPublish, getCategoryByTitle, putDescriptionItemById, postCompatibilitieMeli } = require("../http/mercadoLivre");
const { getErrorMessage } = require('../util/error');
const { escapeSpecialChar, sleep } = require("../util/javaScript");
const { getPriceWithRule } = require('./priceRule');
const { upserQueueSku } = require('./queue');
const { checkSellerByUserToken } = require('./user');

const upsertSkuCollections = async (
  db,
  marketPlace,
  sellerId,
  publishId,
  custId,
  item,
  deleIfExists = false,
  selersByUser = []
) => {
  const skuColl = db.collection('sku');
  const skuXPublishColl = db.collection('skuXPublish');

  let sku =
    item.attributes.find(f => f.id == 'SELLER_SKU') ?
      item.attributes.find(f => f.id == 'SELLER_SKU').value_name :
      item.seller_custom_field;


  let skuRet = await skuColl.findOne({ sku: sku, sellerId: sellerId });
  // if (!sku)
  //   throw `Publish ${publishId} don't have Attribute SELLER_SKU or SELLER_CUSTOM_FIELD`;


  // Não deletar sku caso exista.
  // if (deleIfExists) await skuColl.deleteMany({ sku, sellerId: { $in: selersByUser } });

  let attributes = item.attributes;
  if (!attributes) attributes = [];

  if (!item.attribute_combinations) item.attribute_combinations = [];
  for (attComb of item.attribute_combinations) {
    attributes.push({
      ...attComb,
      combination: true
    })

  }
  attributes.map(m => m.custom = m.id == null);


  let variationId = item.id != publishId ? item.id : null;

  if (!sku) {
    let skuXPublish;
    if (variationId) skuXPublish = await skuXPublishColl.findOne({ variationId });

    if (!skuXPublish) throw `O anúncio ${publishId} não possui SKU preenchido e não possui vínculo manual.`;
    sku = skuXPublish.sku;
  }

  // sincroniza DEPARA SKUXPUBLISH
  await skuXPublishColl.updateOne(
    {
      publishId,
      sku,
      sellerId: sellerId,
      marketPlaceId: marketPlace._id,
      platformId: marketPlace.platformId,
    },
    {
      $set: {
        publishId,
        sellerId: sellerId,
        marketPlaceId: marketPlace._id,
        platformId: marketPlace.platformId,
        sku: sku,
        variationId,
        price: item.price,
        original_price: item.original_price,
        quantity: item.available_quantity,
        images: item.picture_ids ? item.picture_ids.map(m => { return `http://http2.mlstatic.com/D_${m}-O.jpg` }) : item.pictures.map(m => { return m.url }),
        custId,
        updatedAt: new Date(),
        attributes,
        image_id: item.picture_ids ? item.picture_ids.map(m => m) : item.pictures.map(m => { return m.url }),
      }
    },
    { upsert: true }
  )

  if (!skuRet) throw `Sku ${sku} não cadastrado no hub`;

  await skuColl.updateOne(
    {
      sku,
      sellerId: sellerId,
    },
    {
      $set: {
        updatedAt: new Date()
      }
    },
    { upsert: true }
  )

  // sincroniza SKU
  await upserQueueSku(db, 'syncPublishes', [{ sku, sellerId, stock: skuRet.stock, price: skuRet.price }]);
}

const getPublishList = async (db, user, filter) => {
  let publishColl = db.collection('publish');
  let filtro = {};

  let {
    publishid,
    offset,
    limit,
    marketPlaceId,
    listingType,
    oficialStore,
    custId,
    condition,
    shipMode,
    sellerid,
    title,
    status,
    freezeByDeal,
    sku,
    attId,
    attValue,
  } = filter;

  let publishArray = [];

  if (attId) filtro['attributes.name'] = attId;
  if (attValue) filtro['attributes.value_name'] = attValue;
  if (marketPlaceId) filtro['marketPlaceId'] = { $in: marketPlaceId.map(m => { return new ObjectId(m) }) };
  if (listingType) filtro['listingType'] = { $in: listingType };
  if (title) filtro['$and'] = title.split(' ').map(m => { return { title: new RegExp(".*" + escapeSpecialChar(m) + ".*", "i") } });
  // if (title) filtro['title'] = new RegExp(".*" + escapeSpecialChar(title) + ".*", "i");
  if (oficialStore) filtro['oficialStore'] = { $in: oficialStore.map(m => parseInt(m)) };
  if (custId) filtro['custId'] = custId;
  if (condition) filtro['condition'] = { $in: condition };
  if (shipMode) filtro['shipMode'] = { $in: shipMode };


  if (publishid) publishArray.push(...publishid.split(','));

  if (sku) {
    let publishes = await db.collection('skuXPublish').find({ sku }).toArray();
    publishArray.push(...publishes.map(m => m.publishId))
  }

  if (publishArray.length > 0) filtro['publishId'] = { $in: publishArray };

  if (status) filtro['status'] = { $in: status };
  if (freezeByDeal) filtro['freezeByDeal'] = freezeByDeal;


  if (sellerid) {
    sellerid = sellerid.map(m => { return new ObjectId(m) });
    sellerid.forEach(f => checkSellerByUserToken(user, f));
    filtro.sellerId = { $in: sellerid };
  }
  else {
    filtro.sellerId = { $in: user.sellerIds };
  }

  offset = parseInt(offset ? offset : 0);
  limit = parseInt(limit ? limit : 500);

  let publishList = await publishColl.find(filtro)
    .sort({ publishId: 1 })
    .limit(limit)
    .skip(offset)
    .toArray();

  let total = await publishColl.countDocuments(filtro);

  let sellerColl = db.collection('seller');
  let marketPlaceColl = db.collection('marketPlace');
  let platformColl = db.collection('platform');
  let skuXPublishColl = db.collection('skuXPublish');


  let sellers = await sellerColl.find({ _id: { $in: publishList.map(m => { return m.sellerId }) } }).toArray();
  let marketPlaces = await marketPlaceColl.find({ _id: { $in: publishList.map(m => { return m.marketPlaceId }) } }).toArray();
  let platforms = await platformColl.find({ _id: { $in: publishList.map(m => { return m.platformId }) } }).toArray();
  let skuXPublishies = await skuXPublishColl.find({ publishId: { $in: publishList.map(m => { return m.publishId }) } }).toArray();


  return {
    total,
    offset,
    limit: limit > total ? total : limit,
    items: publishList.map(m => {

      let marketPlace = marketPlaces.find(f => f._id.equals(m.marketPlaceId));
      let seller = sellers.find(f => f._id.equals(m.sellerId));
      let platform = platforms.find(f => f._id.equals(m.platformId));
      let skuXPublish = skuXPublishies.filter(f => f.publishId == m.publishId);

      let level;
      if (m.quality) {
        switch (m.quality.level) {
          case 'basic':
            level = 'Básico'
            break;
          case 'standard':
            level = 'Intermediário'
            break;
          case 'professional':
            level = 'Profissional'
            break;
          default:
            level = 'Incompleto'
            break;
        }

      }

      return {
        ...m,
        marketPlaceName: marketPlace ? marketPlace.name : '',
        growStore: marketPlace && !marketPlace.sellerId,
        sellerName: seller.code ? seller.code : undefined,
        platformName: platform ? platform.name : '',
        skuXPublish: skuXPublish.map(sxp => {
          return {
            ...sxp,
            attributes: Array.isArray(sxp.attributes) ? sxp.attributes.sort((a, b) => {
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
        }),
        quality: m.quality ? { health: m.quality.health, level } : {}
      }

    })
  }
}

const getPublish = async (db, user, req) => {
  let publishColl = db.collection('publish');
  let skuXPublishColl = db.collection('skuXPublish');
  let skuColl = db.collection('sku');

  let value = await publishColl.findOne({
    sellerId: { $in: user.sellerIds },
    publishId: req.publishId
  });

  let skuXPublishies = await skuXPublishColl.find({ publishId: req.publishId }).toArray();

  // let skus = await skuColl.find({ sku: { $in: skuXPublishies.map(m => m.sku) } }).toArray();

  value.variations = skuXPublishies.map(m => {
    // mySku = skus.find(f => f.sku == m.sku);
    return {
      // ...mySku,
      ...m,
      // skuId: mySku._id
    }
  });

  return value;
}

const upsertPublish = async (db, body, user, publishId) => {
  let publishColl = db.collection('publish');
  let skuXPublishColl = db.collection('skuXPublish');

  let variations = [...body.variations];
  delete body.variations;
  delete body._id;
  delete body.imageDeleted;

  await publishColl.updateOne(
    { publishId, sellerId: { $in: user.sellerIds } },
    {
      $set: {
        ...body,
        marketPlaceId: new ObjectId(body.marketPlaceId),
        platformId: new ObjectId(body.platformId),
        sellerId: new ObjectId(body.sellerId)
      }
    },
    {
      upsert: true
    }
  );

  for (let variation of variations) {
    delete variation._id;

    await skuXPublishColl.updateOne(
      { publishId, sku: variation.sku },
      {
        $set: {
          ...variation,
          marketPlaceId: new ObjectId(body.marketPlaceId),
          platformId: new ObjectId(body.platformId),
          sellerId: new ObjectId(body.sellerId)
        }
      },
      {
        upsert: true
      }
    );
    let filteredImgs = variation.images
    if (variation.imageDeleted) await skuXPublishColl.updateOne({ publishId, sku: variation.sku }, { $set: { images: filteredImgs } })

  }


  if (body.status !== 'pending') {

    try {
      let configColl = db.collection('config');
      let config = await configColl.findOne({});
      let publish = await publishColl.findOne({ publishId })
      let skuXPublishes = await skuXPublishColl.find({ publishId }).toArray();
      let { pictures, shipMode, dimensions, description, warranty } = body;
      let variations = skuXPublishes.filter(f => f.publishId = publish.publishId)




      let filter = {};
      let data = {}
      let everyPic = [];


      if (pictures) filter['pictures'] = everyPic;
      if (shipMode) filter['shipping'] = { mode: publish.shipMode };
      if (description) data = { 'plain_text': description }
      if (warranty) filter['warranty'] = warranty;
      let marketPlace = await db.collection('marketPlace').findOne({ _id: new ObjectId(body.marketPlaceId) });

      let meliVars = [];

      for (let variation of variations) {
        if (!variation.attributes) variation.attributes = [];

        let skuColl = db.collection('sku');
        let skus = await skuColl.findOne({ sku: variation.sku })


        if (!variation.attributes.find(f => f.id == 'SELLER_SKU')) {
          variation.attributes.push({ id: 'SELLER_SKU', name: 'SKU', value_name: variation.sku });
        }

        everyPic.push(...variation.images.map(m => m).filter(f => !f.includes(variation.image_id.map(mm => mm))).map(m => {
          return {
            'source': m
          }
        }))
        everyPic.push(...variation.image_id.map(m => {
          return {
            'id': m
          }
        }))

        let picture_id = []
        picture_id.push(...variation.images.map(m => m).filter(f => !f.includes(variation.image_id.map(mm => mm))))
        picture_id.push(...variation.image_id.map(m => m))
        meliVars.push({
          id: variation.variationId,
          price: variation.price,
          available_quantity: variation.quantity,
          picture_ids: picture_id,
          attributes: variation.attributes.filter(f => !f.combination && !f.custom),
          attribute_combinations: variation.attributes.filter(f => f.combination || f.custom),


        })

      }

      for (let meliVar of meliVars) {
        meliVar.attribute_combinations.map(m => {
          if (m.id) m.id = m.id.trim().toUpperCase();
          m.name = m.name.trim().toUpperCase();
          delete m.combination;
          delete m.custom;
        });

        meliVar.attributes.map(m => {
          if (m.id) m.id = m.id.trim().toUpperCase();
          m.name = m.name.trim().toUpperCase();
        });

        meliVar.price = Math.max(...meliVars.map(m => m.price))

      }

      filter.variations = meliVars;


      await putItemById(db, config, marketPlace, publishId, filter);
      await putDescriptionItemById(db, config, marketPlace, publishId, data)

    } catch (error) {
      console.log(error)
    }
  }
}

const dropCampaing = async (body, user, db) => {

  let publishColl = db.collection('publish');
  let marketPlaceColl = db.collection('marketPlace');
  let configColl = db.collection('config');

  let { sellerId, deal_ids, publishId } = body;

  let publish = await publishColl.findOne({ publishId });

  let marketPlace = await marketPlaceColl.findOne({ _id: publish.marketPlaceId });

  let config = await configColl.findOne({});


  const deleteResponse = await deleteCampaing(db, deal_ids, publishId, marketPlace)

  if (deleteResponse)
    await syncPublishies(
      db,
      config,
      null,
      new ObjectId(sellerId),
      body,
      true,
      user.sellerIds
    );



}

const skuToPublish = async (db, skuIds, user) => {

  let config = await db.collection('config').findOne({});
  let skuXPublishColl = db.collection('skuXPublish');
  let publishColl = db.collection('publish');
  let skuColl = db.collection('sku');

  let skuList = await skuColl.find({ _id: { $in: skuIds.skuIds.map(m => new ObjectId(m)) } }).toArray();

  let variations = await skuColl.find({ productId: { $in: skuList.map(m => m.sku) }, sellerId: { $in: skuList.map(m => m.sellerId) } }).toArray();

  for (let sku of skuList) {
    let publishId;

    try {
      publishId = await generateTempPublishId(db);
      let data = {};

      let category = sku.title ? await getCategoryByTitle(config, sku.title) : undefined;

      if (sku.title) data['title'] = sku.title;
      data['condition'] = sku.condition ? sku.condition : 'new';
      if (category) data['category'] = category;
      if (sku.status) data['status'] = sku.status;
      if (sku.description) data['description'] = sku.description;
      if (sku.mode) data['shipMode'] = sku.mode;
      if (sku.dimensions) data['dimensions'] = sku.dimensions;
      if (sku.sellerId) data['sellerId'] = sku.sellerId;


      data['publishId'] = publishId
      data['updatedAt'] = new Date();
      data['deal_ids'] = [];
      data['createdUser'] = user.document;
      data['status'] = 'pending';



      let varsBySku = variations.filter(f => f.productId == sku.sku && f.sellerId.equals(sku.sellerId));

      if (!varsBySku.length) varsBySku.push(sku);

      let publishAttributes = [];
      //variações
      for (let variation of varsBySku) {

        await skuXPublishColl.insertOne({
          publishId: data.publishId,
          sku: variation.sku,
          images: variation.image,
          quantity: variation.stock > 9999 ? 9999 : variation.stock,
          price: variation.price,
          sellerId: sku.sellerId,
          attributes: variation.attributes ? variation.attributes.map(m => {
            return {
              name: m.id,
              value_name: m.value,
              custom: true
            }
          }) : [],

        });
        publishAttributes.push({
          attributes: variation.attributes ? variation.attributes.map(m => {
            return {
              name: m.id,
              value_name: m.value,
              custom: true
            }
          }) : []
        });
      }

      await publishColl.insertOne({ ...data, attributes: publishAttributes[0].attributes });

    } catch (err) {
      if (publishId) {
        await publishColl.deleteMany({ publishId });
        await skuXPublishColl.deleteMany({ publishId });
      }
    }

  }
}

const syncPublishies = async (db, config, marketPlace, sellerId, publishArray, delIfExists = false, selersByUser = []) => {
  let publishColl = db.collection('publish');
  let marketPlaceColl = db.collection('marketPlace');
  const meliItems = await getItemById(db, config, marketPlace, publishArray);

  let marketPlaces = marketPlace ? [marketPlace] : await marketPlaceColl.find({ 'auth.sellerId': { $in: meliItems.map(m => { return m.seller_id }) } }).toArray();
  let publishErrors = [];


  for (let meliItem of meliItems) {
    let marketPlaceSellected;

    try {
      if (meliItem.status == 'under_review') throw `The status of Publish ${meliItem.id} is 'under_review'`;

      if (delIfExists) {
        let skuXPublishColl = db.collection('skuXPublish');
        await skuXPublishColl.deleteMany({ publishId: meliItem.id, sellerId: { $in: selersByUser } });
        await publishColl.deleteMany({ publishId: meliItem.id, sellerId: { $in: selersByUser } });
      }

      marketPlaceSellected = marketPlaces.find(f => f.auth.sellerId == meliItem.seller_id);
      if (!marketPlaceSellected) throw `MarketPlace not found by Meli Seller Id ${meliItem.seller_id} to the publish ${meliItem.id} to your TOKEN`;

      const meliDescriptions = await getDescription(db, config, marketPlaceSellected, [meliItem.id]);

      let description = meliDescriptions.find(f => f.mlb == meliItem.id)

      let publishQuality;
      if (!meliItem.catalog_listing) {
        publishQuality = await getPublishQuality(db, config, marketPlaceSellected, meliItem.id)
      };

      if (meliItem.variations && meliItem.variations.length) {
        for (let meliItemVariation of meliItem.variations) {
          await upsertSkuCollections(db, marketPlaceSellected, sellerId, meliItem.id, meliItem.seller_id, meliItemVariation, delIfExists, selersByUser)

        }
      }
      else await upsertSkuCollections(db, marketPlaceSellected, sellerId, meliItem.id, meliItem.seller_id, meliItem, delIfExists, selersByUser);

      // sincroniza anúncios
      await publishColl.updateOne(
        {
          marketPlaceId: marketPlaceSellected._id,
          publishId: meliItem.id
        },
        {
          $set: {
            publishId: meliItem.id,
            title: meliItem.title,
            description: description ? description.description : '',
            custId: meliItem.seller_id,
            sellerId: sellerId,
            marketPlaceId: marketPlaceSellected._id,
            shipMode: meliItem.shipping.mode,
            dimensions: meliItem.shipping.dimensions ? meliItem.shipping.dimensions : '0x0x0,0',
            freeShipping: Boolean([meliItem.shipping.free_shipping]),
            local_pick_up: Boolean([meliItem.shipping.local_pick_up]),
            platformId: marketPlaceSellected.platformId,
            condition: meliItem.condition,
            oficialStore: parseInt(meliItem.official_store_id),
            listingType: meliItem.listing_type_id,
            category: meliItem.category_id,
            attributes: meliItem.attributes.map(m => {
              return {
                id: m.id,
                name: m.name,
                value_name: m.value_name,
              }
            }),
            deal_ids: meliItem.deal_ids,
            // images: meliItem.pictures.map(m => m.url),
            link: meliItem.permalink,
            status: meliItem.status,
            catalog_listing: meliItem.catalog_listing,
            warrantyType: meliItem.warranty ? meliItem.warranty.split(':')[0] : null,
            warrantyTime: meliItem.warranty && meliItem.warranty.split(':').length > 1 ? meliItem.warranty.split(':')[1].trim().split(' ')[0] : '0',
            warrantyTimeUnit: meliItem.warranty && meliItem.warranty.split(':').length > 1 ? meliItem.warranty.split(':')[1].trim().split(' ')[1].trim() : '0',
            updatedAt: new Date(),
            lastSync: new Date(),
            quality: {
              health: publishQuality ? publishQuality.health : 1,
              level: publishQuality ? publishQuality.level : 'professional'
            },
            sub_status: meliItem.sub_status[0],
            pictures: meliItem.pictures.map(r => {
              return r.url;
            }),
            sold: meliItem.sold_quantity,

          }
        },
        { upsert: true }
      )
    }

    catch (error) {
      publishErrors.push({ publishId: meliItem.id, errorMessage: getErrorMessage(error), marketPlaceId: marketPlaceSellected?._id });
    }
  }

  if (publishErrors.length) throw publishErrors.map(m => m.errorMessage).join(', ');

  return meliItems;
}

const sendPublish = async (db, user, publishIds) => {

  if (!Array.isArray(publishIds)) throw `Body isn't valid array of publishiIds`;

  let marketPlaceColl = db.collection('marketPlace');
  let configColl = db.collection('config');
  let publishColl = db.collection('publish');
  let skuXPublishColl = db.collection('skuXPublish');

  let config = await configColl.findOne({});
  let publishies = await publishColl.find({ publishId: { $in: publishIds }, status: 'pending' }).toArray();
  let skuXPublishes = await skuXPublishColl.find({ publishId: { $in: publishIds } }).toArray();
  let marketPlaces = await marketPlaceColl.find({ _id: { $in: publishies.map(m => m.marketPlaceId) } }).toArray();

  let retPublishies = [];

  // variations
  for (let publish of publishies) {

    let variations = skuXPublishes.filter(f => f.publishId = publish.publishId)

    let meliVars = [];

    for (let variation of variations) {
      if (!variation.attributes) variation.attributes = [];


      if (!variation.attributes.find(f => f.id == 'SELLER_SKU')) {
        variation.attributes.push({ id: 'SELLER_SKU', name: 'SKU', value_name: variation.sku });
      }

      meliVars.push({
        price: await getPriceWithRule(db, marketPlaces.find(f => f._id.equals(publish.marketPlaceId)), publish.sellerId, variation.price, publish),
        available_quantity: variation.quantity,
        picture_ids: variation.images.map(m => m.replace('https', 'http')),
        attributes: variation.attributes.filter(f => !f.combination && !f.custom),
        attribute_combinations: variation.attributes.filter(f => f.combination || f.custom),

      })

    }

    for (let meliVar of meliVars) {

      meliVar.attribute_combinations.map(m => {
        if (m.id) m.id = m.id.trim().toUpperCase();
        m.name = m.name.trim().toUpperCase();
        delete m.combination;
        delete m.custom;
      });

      meliVar.attributes.map(m => {
        if (m.id) m.id = m.id.trim().toUpperCase();
        m.name = m.name.trim().toUpperCase();
      });

      meliVar.price = Math.max(...meliVars.map(m => m.price))

    }

    publish.variations = meliVars;
  };

  let publishiesGrowStore = publishies.filter(f => {

    let result = false;
    marketPlaces.filter(mf => !mf.sellerId).map(m => result = m._id.equals(f.marketPlaceId))
    return result

  });

  let publishiesHUb = publishies.filter(f => {

    let result = false;
    marketPlaces.filter(mf => mf.sellerId).map(m => result = m._id.equals(f.marketPlaceId))
    return result

  });


  for (let pubGrow of publishiesGrowStore) {

    let marketPlace = marketPlaces.find(f => f._id.equals(pubGrow.marketPlaceId));

    for (let oficialStore of marketPlace.auth.oficialStoreIds) {

      for (let listingType of ['gold_pro', 'gold_special'])

        publishiesHUb.push({ ...pubGrow, oficialStore, listingType })
    }

  }

  for (let publish of publishiesHUb) {
    try {

      if (!publish.sellerId) throw `Empresa não selecionado para o anúncio ${publish.publishId} operação recusada! `;

      if (!publish.marketPlaceId) throw `Marketplace não selecionado para o anúncio ${publish.publishId} operação recusada! `;

      if (!publish.platformId) throw `platformId não selecionado para o anúncio ${publish.publishId} operação recusada! `;

      let data = {};

      if (publish.variations.find(f => f.attribute_combinations))
        data['variations'] = publish.variations;
      else
        data = { ...data, price: variations[0].price, attributes: variations[0].attributes, attribute_combinations: variations[0].attribute_combinations }

      data['site_id'] = 'MLB';

      if (publish.title) data['title'] = publish.title;
      if (!publish.title) throw `Título é Obrigatório ${publish.publishId}!`

      if (publish.category) data['category_id'] = publish.category;
      if (!publish.category) throw `Categoria é Obrigatório ${publish.publishId}!`

      if (publish.oficialStore) data['official_store_id'] = publish.oficialStore;

      data['currency_id'] = 'BRL';

      if (publish.warrantyType) data['sale_terms'] = [
        {
          id: "WARRANTY_TYPE",
          value_name: publish.warrantyType,
        },
        {
          id: "WARRANTY_TIME",
          value_name: `${publish.warrantyTime} ${publish.warrantyTimeUnit}`,
        }
      ];
      if (!publish.warrantyType) throw `Garantia é Obrigatório ${publish.warranty}!`

      if (publish.listingType) data['listing_type_id'] = publish.listingType;
      if (!publish.listingType) throw `Destaque do anúncio é Obrigatório ${publish.publishId}!`

      if (publish.condition) data['condition'] = publish.condition;
      if (!publish.condition) throw 'Condição é Obrigatório!'

      if (publish.attributes) data['attributes'] = publish.attributes;


      if (publish.video_id) data['video_id'] = publish.video_id;

      // if (publish.description) data['description'] = publish.description;
      if (!publish.description) throw 'Descrição é Obrigatório!'

      if (publish.shipMode && publish.shipMode) data['shipping'] = { mode: publish.shipMode };
      if (!publish.shipMode) throw 'Forma de Envio é Obrigatório!'

      if (publish.channels) data['channels'] = publish.channels;

      let newPublish = await postCreatedPublish(db, config, marketPlaces.find(f => f._id.equals(publish.marketPlaceId)), data);

      await publishColl.updateOne(
        {
          publishId: publish.publishId
        },
        {
          $set: {
            publishId: newPublish.id
          }
        }
      );

      if (publish.description)
        await postDescriptionItemById(
          db,
          config,
          marketPlaces.find(f => f._id.equals(publish.marketPlaceId)),
          newPublish.id,
          publish.description
        );

      await skuXPublishColl.updateMany(
        {
          publishId: publish.publishId
        },
        {
          $set: {
            publishId: newPublish.id,
            marketPlaceId: publish.marketPlaceId,
            platformId: publish.platformId,
            sellerId: publish.sellerId
          }
        }
      );

      await syncPublishies(
        db,
        config,
        null,
        new ObjectId(publish.sellerId),
        [newPublish.id],
        false,
        user.sellerIds
      );

      retPublishies.push({ publishIdNew: newPublish.id, publishIdOld: publish.publishId, type: 'success' });

    }
    catch (error) {
      retPublishies.push({
        publishIdOld: publish.publishId,
        type: 'error',
        error:
          error.response &&
            error.response.data &&
            Array.isArray(error.response.data.cause) ?
            error.response.data.cause.map(m => m.message).join(', ') :
            JSON.stringify(error)
      });
    }

  }

  return retPublishies;
}

const generateTempPublishId = async (db) => {

  let configColl = db.collection('config');

  let configReturn = await configColl.findOneAndUpdate(
    {},
    { $inc: { publishSequence: 1 } },
    { new: true }
  );

  return `Digi-${configReturn.value.publishSequence}`;
}

const getPublishReport = async (db, user, filter) => {
  let publishies = await getPublishList(db, user, filter);

  let ret = {
    total: publishies.total,
    offset: publishies.offset,
    limit: publishies.limit,
    items: []
  };

  publishies.items.map(pub => {
    pub.skuXPublish.map(variation => {
      ret.items.push({
        ...pub,
        ...variation
      })
    })
  })

  ret.columns = [
    { header: 'ID', key: '_id' },

    { header: 'Código Anúncio', key: 'publishId' },
    { header: 'Código SKU', key: 'sku' },

    { header: 'Título', key: 'title' },

    { header: 'Link Permanente', key: 'link' },


    { header: 'Preço Original', key: 'original_price' },
    { header: 'Preço Atual', key: 'price' },

    { header: 'Estoque', key: 'quantity' },

    { header: 'Status', key: 'status' },
    { header: 'Data Atualização', key: 'updatedAt' },

    { header: 'ID Seller', key: 'sellerId' },
    { header: 'Empresa', key: 'sellerName' },

    { header: 'ID Plataforma', key: 'platformId' },
    { header: 'Plataforma', key: 'platformName' },

    { header: 'ID Conta', key: 'marketPlaceId' },
    { header: 'Conta', key: 'marketPlaceName' },

    { header: 'Grow Store', key: 'growStore' },
    { header: 'Imagens', key: 'images' },

    { header: 'Código Categoria', key: 'category' },
    { header: 'ID Variação', key: 'variationId' },
    { header: 'Condição', key: 'condition' },
    { header: 'ID Seller Meli', key: 'custId' },
    { header: 'Destaque', key: 'listingType' },
    { header: 'Loja Oficial', key: 'oficialStore' },
    { header: 'Modo Frete', key: 'shipMode' },
    { header: 'Oferta', key: 'freezedByDeal' },
    { header: 'Atributos', key: 'attributes' },
    { header: 'Promoção', key: 'deal_ids' },
    { header: 'Descrição', key: 'description' },
    { header: 'Dimensões', key: 'categdimensionsory' },
    { header: 'Frete Grátis', key: 'freeShipping' },
    { header: 'Local de Coleta', key: 'local_pick_up' },
    { header: 'Garantia', key: 'warranty' },
    { header: 'Qualidade', key: 'quality' },
  ];

  ret.items = ret.items.map(m => {
    delete m.skuXPublish;

    let data = {
      ...m,
      attributes: JSON.stringify(m.attributes),
      deal_ids: JSON.stringify(m.deal_ids),
      images: JSON.stringify(m.images),
      quality: JSON.stringify(m.quality),
    };

    return ret.columns.map(m => data[m.key] ? data[m.key] : '')
  });

  return ret;
}

const postPublishCompatibilities = async (db, user, data = []) => {
  let publishColl = db.collection('publish');
  let marketPlaceColl = db.collection('marketPlace');
  let config = await db.collection('config').findOne({});


  let publishies = await publishColl.find({ sellerId: { $in: user.sellerIds }, publishId: { $in: data.map(m => m[0]) } }).toArray();

  let ret = []


  if (publishies.length) {
    let retBody = [];

    let marketPlaces = await marketPlaceColl.find({ _id: { $in: publishies.map(m => m.marketPlaceId) } }).toArray();

    for (let publish of publishies) {
      let marketPlace = marketPlaces.find(f => f._id.equals(publish.marketPlaceId));

      let detail = data.find(f => f.includes(publish.publishId))


      for (let brand of String(detail[1]).split(',')) {
        for (let model of String(detail[2]).split(',')) {
          for (let year of String(detail[3]).split(',')) {
            let body = [
              { id: 'BRAND', value_id: brand.trim() },
              { id: 'MODEL', value_id: model.trim() },
              { id: 'VEHICLE_YEAR', value_id: year.trim() },
            ]

            try {
              await sleep(100);
              await postCompatibilitieMeli(
                db,
                config,
                marketPlace,
                publish.publishId,
                body
              )

            } catch (error) {
              retBody.push({
                body,
                error: getErrorMessage(error)
              })
            }
          }
        }
      }

      ret.push({
        publishId: publish.publishId,
        rets: retBody
      })

    }

  }

  return ret;

}



module.exports = {
  getPublishReport,
  syncPublishies,
  getPublish,
  upsertPublish,
  dropCampaing,
  skuToPublish,
  sendPublish,
  generateTempPublishId,
  getPublishList,
  upsertSkuCollections,
  postPublishCompatibilities
}
