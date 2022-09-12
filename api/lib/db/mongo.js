const { MongoClient } = require("mongodb");
const { generateDefaultBaseTest } = require("../model/defaultBaseTest");


let client = null;
async function mongoConnect() {
  const env = require('dotenv').config().parsed || {};

  const dev = process.argv.find(f => f == 'dev' || f == 'hom');
  const dontReset = process.argv.find(f => f == 'dontReset');
  const local = process.argv.find(f => f == 'local')

  const uri =
    local ? "mongodb://localhost:27017" : dev ?
      "mongodb+srv://evertonjackson:ars111213@clustercatalog.hjfuh.mongodb.net/melhor-post?retryWrites=true&w=majority" :
      env.MONGO_URI ? env.MONGO_URI : "mongodb+srv://evertonjackson:ars111213@clustercatalog.hjfuh.mongodb.net/melhor-post?retryWrites=true&w=majority";

  client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();

  let db = client.db(local ? "melhor-post" : dev == 'dev' ? "melhor-post" : dev == 'hom' ? "melhor-post" : "melhor-post");
  if (dev && !dontReset) await generateDefaultBaseTest(db)

  return db;
}

module.exports = mongoConnect; 