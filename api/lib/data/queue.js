const { getErrorMessage } = require('../util/error');
const _ = require('lodash');

const upsertQueue = async (db, operation, type, sellerId, platformId, marketPlaceId, userId, filter = {}, data = {}) => {
  let queueCollection = db.collection('queue');
  var expireLock = new Date();
  expireLock.setMinutes(expireLock.getMinutes() - 60);

  let filterCollection = {
    operation, type, sellerId, ...filter,
    $or: [
      { lockId: { $exists: false } },
      { $and: [{ lockDate: { $exists: true } }, { lockDate: { $lt: expireLock } }] }
    ]
  };

  let dataCollection = {
    operation, type, sellerId, ...data, updatedAt: new Date()
  };

  if (platformId) {
    filterCollection.platformId = platformId;
    dataCollection.platformId = platformId;
  }

  if (marketPlaceId) {
    filterCollection.marketPlaceId = marketPlaceId;
    dataCollection.marketPlaceId = marketPlaceId;
  }

  if (userId) {
    filterCollection.userId = userId;
    dataCollection.userId = userId;
  }


  await queueCollection.updateOne({ ...filterCollection }, { $set: { ...dataCollection } }, { upsert: true })

}

const lockAndGetQueue = async (db, config, operation, type, platformId, queueLimit = 0, sellerId = null, lockQueueTimeOutMinutes = null) => {
  let queueCollection = db.collection('queue');

  // lockId random 
  let lockId = Math.random().toString(36).substr(2, 9);
  var expireLock = new Date();
  expireLock.setMinutes(expireLock.getMinutes() - lockQueueTimeOutMinutes ? lockQueueTimeOutMinutes : config.timeOuts.lockQueueTimeOutMinutes);

  let filter = { operation, type, platformId };
  if (sellerId) filter.sellerId = sellerId;
  // Lock and get queue order
  await queueCollection.updateMany(
    {
      ...filter,
      $or: [
        { lockId: { $exists: false } },
        { $and: [{ lockDate: { $exists: true } }, { lockDate: { $lt: expireLock } }] }
      ]
    },
    { $set: { lockId, lockDate: new Date() } }
  );

  let lockedQueue = [];

  if (queueLimit > 0) {
    lockedQueue = await queueCollection.find({ lockId }).limit(queueLimit).toArray();
    await queueCollection.updateMany(
      { lockId, _id: { $nin: lockedQueue.map(m => { return m._id }) } },
      { $unset: { lockId: 1, lockDate: 1 } }
    );
  }
  else
    lockedQueue = await queueCollection.find({ lockId }).toArray();

  return lockedQueue;
}

const deleteQueue = async (db, queue) => {
  let queueCollection = db.collection('queue');
  await queueCollection.deleteOne({ _id: queue._id });
}

const deleteQueueError = async (db, filter) => {
  let queueErrorColl = db.collection('queueError');
  await queueErrorColl.deleteOne(filter);
}

const upsertQueueError = async (db, operation, type, sellerId, platformId, marketPlaceId, userId, error, filter = {}, data = {}) => {
  let errorCollection = db.collection('queueError');

  let errorMsg = getErrorMessage(error);
  let filterCollection = { operation, type, sellerId, ...filter };
  let dataCollection = { operation, type, sellerId, ...data, updatedAt: new Date(), errorMsg };

  if (platformId) {
    filterCollection.platformId = platformId;
    dataCollection.platformId = platformId;
  }

  if (marketPlaceId) {
    filterCollection.marketPlaceId = marketPlaceId;
    dataCollection.marketPlaceId = marketPlaceId;
  }

  if (userId) {
    filterCollection.userId = userId;
    dataCollection.userId = userId;
  }

  await errorCollection.updateOne({ ...filterCollection }, { $set: { ...dataCollection } }, { upsert: true });
}

const upsertQueueSuccess = async (db, operation, type, sellerId, platformId, marketPlaceId, userId, filter = {}, data = {}) => {
  let successColl = db.collection('queueSuccess');

  let filterCollection = { operation, type, sellerId, ...filter };
  let dataCollection = { operation, type, sellerId, ...data, updatedAt: new Date() };

  if (platformId) {
    filterCollection.platformId = platformId;
    dataCollection.platformId = platformId;
  }

  if (marketPlaceId) {
    filterCollection.marketPlaceId = marketPlaceId;
    dataCollection.marketPlaceId = marketPlaceId;
  }

  if (userId) {
    filterCollection.userId = userId;
    dataCollection.userId = userId;
  }

  await successColl.updateOne({ ...filterCollection }, { $set: { ...dataCollection } }, { upsert: true });
}

const upserQueueSku = async (db, userName, skus) => {
  
  if (!Array.isArray(skus)) throw `Body isn't valid array`

  let skuXPublishies = await db.collection('skuXPublish').find({ sku: { $in: skus.map(m => m.sku) } ,sellerId:{$in:skus.map(m => m.sellerId)}, publishId: { $not: new RegExp(".*Digi-.*", "i") } }).toArray();

  let skusMongo = await db.collection('sku').find({ sku: { $in: skus.map(m => m.sku) } }).toArray();

  let kitSKu = [];

  skusMongo.map(m => {
    if (m && m.kit) {
      kitSKu.push(m.sku);
    }
  });

  let publishies = skuXPublishies.filter(f => f.sku == skus.map(m => m.sku));

  if (!publishies.length == 0) {

    if (!kitSKu.find(f => f == skus.map(m => m.sku))) {

      let platforms = _.groupBy(publishies, 'platformId');

      if (!Object.keys(platforms).length == 0 || platforms.length == 0) {
        for (let platform in platforms) {
          let item = platforms[platform][0];
          delete skus[0].imageDeleted;

          for (let sku of skus) {

            await upsertQueue(
              db, 'SKU', 'MKP', item.sellerId, item.platformId, null, userName ,
              { 'content.sku': sku.sku }, { content: sku }
            );
          }

        }
      }
    }
  }
}

module.exports = { upsertQueue, lockAndGetQueue, upserQueueSku, deleteQueue, upsertQueueError, deleteQueueError, upsertQueueSuccess };