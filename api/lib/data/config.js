async function getConfig(db) {
  let configCollection = db.collection('config');
  let configServicesCollection = db.collection('configServices');

  let configReturn = await configCollection.findOne();
  configReturn.services = await configServicesCollection.find().toArray();

  return configReturn;
}

module.exports = getConfig; 