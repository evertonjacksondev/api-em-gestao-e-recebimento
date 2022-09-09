const { ObjectId } = require('mongodb');

const generateDefaultBaseTest = async (db) => {
  try {
    if (db.databaseName == 'hubDigigrow_DEV' || db.databaseName == 'hubDigigrow_HOM')
      await db.dropDatabase();

    let appMenuColl = db.collection('appMenu');
    await appMenuColl.insertMany([
      {
        "_id": new ObjectId("6139173b051d15d51e7daba8"),
        "key": "money",
        "name": "Financeiro",
        "icon": "paid",
        "showIcon": true,
        "link": "/money",
        "sequence": 5
      },
      {
        "_id": new ObjectId("6139173b051d15d51e7daba6"),
        "key": "dashboard",
        "name": "Resumo",
        "icon": "dashboard",
        "showIcon": true,
        "link": "/",
        "sequence": 1
      },
      {
        "_id": new ObjectId("6139173b051d15d51e7daba9"),
        "key": "forms",
        "name": "Cadastros",
        "icon": "grading",
        "child": [
          {
            "key": "seller",
            "name": "Empresas",
            "icon": "add_business",
            "isChield": true,
            "link": "/seller"
          },
          {
            "key": "product",
            "name": "Produtos",
            "icon": "sell",
            "isChield": true,
            "link": "/product"
          },
          {
            "key": "publish",
            "name": "Anúncios",
            "icon": "dvr",
            "isChield": true,
            "link": "/publish"
          }
        ],
        "sequence": 2
      },
      {
        "_id": new ObjectId("6139173b051d15d51e7daba7"),
        "key": "sale",
        "name": "Vendas",
        "icon": "insights",
        "showIcon": true,
        "link": "/sale/general",
        "sequence": 4
      },
      {
        "_id": new ObjectId("6139173b051d15d51e7dabac"),
        "key": "settings",
        "name": "Configurações",
        "icon": "settings",
        "showIcon": true,
        "link": "/settings",
        "sequence": 6
      }
    ]);

    let configColl = db.collection('config');
    await configColl.insertOne({
      "_id": ObjectId("6202be70992cd0393c1344f8"),
      "urls": {
        "mercadoLivre": "https://api.mercadolibre.com",
        "mercadoPago": "https://api.mercadopago.com"
      },
      "tokens": {
        "bearerInventoV2": "Bearer SW52ZW50b1Npc3RlbWFzL0h1YkRpZ2lncm93L1BlcnNpc3RlbnRBY2Nlc3MvR2VuZXJhdGVkQnlEaWVnby8wMzA1MjAyMQ=="
      },
      "timeOuts": {
        "lockQueueTimeOutMinutes": 60,
        "lockServicesTimeOutMinutes": 10
      },
      "invoice": {
        "originICMS": [
          {
            "id": 0,
            "title": "Nacional"
          },
          {
            "id": 1,
            "title": "Estrangeira, adquirida no mercado interno"
          },
          {
            "id": 2,
            "title": "Estrangeira - Adquirida no mercado interno, exceto a indicada no código 7"
          },
          {
            "id": 3,
            "title": "Nacional, mercadoria ou bem com Conteúdo de Importação superior a 40% e inferior ou igual a 70%"
          },
          {
            "id": 4,
            "title": "Nacional, cuja produção tenha sido feita em conformidade com os processos produtivos básicos de que tratam as legislações citadas nos Ajustes"
          },
          {
            "id": 5,
            "title": "Nacional, mercadoria ou bem com Conteúdo de Importação inferior ou igual a 40%"
          },
          {
            "id": 6,
            "title": "Estrangeira - Importação direta, sem similar nacional, constante em lista da CAMEX e gás natural"
          },
          {
            "id": 7,
            "title": "Estrangeira - Adquirida no mercado interno, sem similar nacional, constante lista CAMEX e gás natural"
          },
          {
            "id": 8,
            "title": "Nacional, mercadoria ou bem com Conteúdo de Importação superior a 70%"
          }
        ]
      },
      "meli": {
        "appId": "8212466574434278"
      },
      "minPriceFreeShipping": 79.01,
      "publishSequence": 301,
      "registrationResearch" : [
        "Busca da internet",
        "Propaganda em rádio",
        "Propaganda em TV",
        "Anúncios nas redes sociais",
        "Por amigos/familiares",
        "Representante"
      ],
      "configMail": {
        "service": "Outlook365",
        "auth": {
            "user": "noreply@digigrow.com.br",
            "pass": "Daf73432"
        }
    }
    });

    let configServicesColl = db.collection('configServices');
    await configServicesColl.insertMany([
      {
        "_id": ObjectId("60cd0adb6d68ee0822a5b385"),
        "name": "getPaymentStatus",
        "active": false,
        "intervalSeconds": 60,
        "lastExecute": new Date(),
        "lastExecutionTime": 7714.983,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("60e34b94843aa6d64a34e8a2"),
        "name": "getOrderMeli",
        "active": false,
        "intervalSeconds": 600,
        "lastExecute": new Date(),
        "lastExecutionTime": 14.08,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("60d9c452843aa6d64a219d79"),
        "name": "putSkuMeli",
        "active": false,
        "intervalSeconds": 30,
        "lastExecute": new Date(),
        "lastExecutionTime": 3615.83,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 100,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("60fefa6dd7b1062d4eb2d64b"),
        "name": "syncAllPublishies",
        "active": false,
        "intervalSeconds": 9999999,
        "lastExecute": new Date(),
        "lastExecutionTime": 77718.937,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("61b36bc6188421bc10a48d78"),
        "name": "getMessagesMeli",
        "active": false,
        "intervalSeconds": 60,
        "lastExecute": new Date(),
        "lastExecutionTime": 438.082,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("61d85f27a1a6d9802f45b858"),
        "name": "processOrderMeli",
        "active": false,
        "intervalSeconds": 60,
        "lastExecute": new Date(),
        "lastExecutionTime": 0.047,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("61e6ee931f23c3058cd7e7dc"),
        "name": "getQuestionsMeli",
        "active": false,
        "intervalSeconds": 10,
        "lastExecute": new Date(),
        "lastExecutionTime": 0.093,
        "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("6201786030e5471278c82c97"),
        "name": "getLabelPack",
        "active": false,
        "intervalSeconds": 300,
        "lastExecute": new Date(),
        "lastExecutionTime": 0.017,
        "platformId": ObjectId("620177b730e5471278c82c96"),
        "queueLimit": 0,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("6217d2abb1939d3fc0fb55f8"),
        "name": "uploadSku",
        "active": false,
        "intervalSeconds": 10,
        "lastExecute": new Date(),
        "lastExecutionTime": 53.399,
        "platformId": ObjectId("6217d024b1939d3fc0fb55f7"),
        "queueLimit": 10000,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      },
      {
        "_id": ObjectId("62605007ee724bddf4bfe3f1"),
        "name": "updateConcludedMoney",
        "active": false,
        "intervalSeconds": 60000,
        "lastExecute": new Date(),
        "lastExecutionTime": 0.007,
        "platformId": ObjectId("6217d024b1939d3fc0fb55f7"),
        "queueLimit": 200,
        "threadLimit": 1,
        "threadWorking": 0,
        "debug": false
      }
    ])

    let contractColl = db.collection('contract');
    await contractColl.insertOne({
      "_id": ObjectId("622f92129830f4a38cf808b3"),
      "name": "Contrato Padrão",
      "saleFee": 0.1,
      "default": true,
      "freightClientFee": false,
      "freightSellerFee": false,
      "conclusiondate": 5,
      "addDigiFee": 1
    });

    let platformColl = db.collection('platform');
    await platformColl.insertMany([
      {
        "_id": ObjectId("60c75ce16d68ee082276c5ae"),
        "code": "MLB",
        "name": "Mercado Livre Brasil",
        "logo": "https://seeklogo.com/images/M/mercado-livre-logo-D1DC52B13E-seeklogo.com.png",
        "showInList": true
      },
      {
        "_id": ObjectId("620177b730e5471278c82c96"),
        "code": "SIGEP",
        "name": "Gestão de Etiquetas Correio",
        "logo": "",
        "showInList": false
      },
      {
        "_id": ObjectId("6217d024b1939d3fc0fb55f7"),
        "code": "INTERNAL",
        "name": "Serviço para execuções internas do Hub",
        "logo": "",
        "showInList": false
      }
    ]);

    let marketPlaceColl = db.collection('marketPlace');
    await marketPlaceColl.insertOne({
      "_id": ObjectId("60c798b36d68ee0822834006"),
      "name": "Grow Store",
      "sellerId": null,
      "platformId": ObjectId("60c75ce16d68ee082276c5ae"),
      "active": false,
      "auth": {
        "accessToken": "APP_USR-6888687643271993-122112-d4713bdcad7a01de3c7a21bd0702bd43__LD_LC__-128019548",
        "sellerId": 128019548,
        "oficialStoreIds": [
          224,
          2757
        ]
      },
      "getOrder": true,
      "getShippLabel": true,
      "putOthers": true,
      "putPrice": true,
      "putStock": true,
      "putOrderStatus": true,
      "lastDateGetOrder": new Date(),
      "freightCallback": "http://api.digigrow.com.br:2530/shipping",
      "updatedAt": new Date(),
      "updatedUser": "REFRESH_TOKEN"
    });

  }
  catch (err) {
    console.log(err);
  }


}

module.exports = { generateDefaultBaseTest }