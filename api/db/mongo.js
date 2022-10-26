const { MongoClient } = require('mongodb')

let client = null
const mongoConnect = async () => {
  const uri =
    'mongodb+srv://evertonjackson:ars111213@clustercatalog.hjfuh.mongodb.net/melhor-post?retryWrites=true&w=majority'

  client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  await client.connect()

  let db = client.db('teste')

  return db
}

module.exports = mongoConnect
