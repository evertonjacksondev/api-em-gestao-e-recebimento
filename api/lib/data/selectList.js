
const getSelectList = async (db, sellerIds, collection, idField, titleField, customRule, customFilter = {}) => {
  let coll = db.collection(collection);

  if (sellerIds) sellerIds.push(null);

  let filterDistinct = {};
  if (sellerIds) filterDistinct[collection == 'seller' ? '_id' : 'sellerId'] = { $in: sellerIds };
  let distinct = await coll.distinct(idField, filterDistinct);

  let data;

  if (titleField) {
    let filter = {};
    filter[idField] = { $in: distinct };

    if (sellerIds) filter[collection == 'seller' ? '_id' : 'sellerId'] = { $in: sellerIds };

    let projection = {};
    projection[idField] = 1;
    projection[titleField] = 1;



    data = await coll.find({ ...filter, showInList: { $ne: false }, deletedAt: { $exists: false }, ...customFilter }, { projection: projection }).toArray();
  }

  let retorno;
  if (data) {
    retorno = data.map(m => {
      return {
        id: m[idField],
        title: m[titleField]
      }
    });
  }
  else {
    retorno = customRule(distinct);
  }

  return retorno.sort(function (x, y) {
    if (x.title < y.title) { return -1; }
    if (x.title > y.title) { return 1; }
    return 0;
  });
}

module.exports = { getSelectList };