const { postMessageToBuyer, postReponseMeliMessage, getAccesToken, postQuestionsMeli, deleteQuestionsMeli } = require("../http/mercadoLivre");
const { ObjectId } = require('mongodb');

const sendAutomaticMessage = async (db, config, marketPlace, order, orderStatus) => {
  let autoMessageColl = db.collection('autoMessage');

  let autoMessages =
    await autoMessageColl.find({
      marketPlaceId: marketPlace._id,
      sellerId: order.sellerId,
      orderStatus,
      active: true
    }).toArray();

  for (let autoMsg of autoMessages) {
    let orderTags = autoMsg.message.match(/\${.+?\}/g);

    for (let orderTag of orderTags) {
      if (orderTag == '${buyerName}')
        autoMsg.message =
          autoMsg.message.replace(
            orderTag,
            order.buyer.name
          );

      if (orderTag == '${orderId}')
        autoMsg.message =
          autoMsg.message.replace(
            orderTag,
            order.packId ? order.packId : order.externalId
          );

      if (orderTag == '${orderItems}') {
        let itemsMessage = '';
        order.items.forEach(f => {
          itemsMessage +=
            `Produto: ${f.title} | Quantidade: ${f.amount} | Valor Unitário: ${f.unit.toLocaleString('pt-BR')} \n`
        });

        autoMsg.message =
          autoMsg.message.replace(
            orderTag,
            itemsMessage
          );
      }

      if (orderTag == '${orderInvoice}')
        autoMsg.message =
          autoMsg.message.replace(
            orderTag,
            `Número: ${order.invoice.number
            } \n Série: ${order.invoice.serie
            } \n Data de Emissão: ${order.invoice.emissionDate.toLocaleString('pt-BR')
            } \n Chave de Acesso: ${order.invoice.key
            }`
          );

      if (orderTag == '${shippingAddress}')
        autoMsg.message =
          autoMsg.message.replace(
            orderTag,
            `Endereço de entrega: ${order.shipping.street
            }, ${order.shipping.number
            }, ${order.shipping.comment
            }, ${order.shipping.neighborhood
            }, ${order.shipping.city
            }, ${order.shipping.state
            }, CEP: ${order.shipping.zipCode
            }`
          );

      // autoMsg.message = 
      //   autoMsg.message.replace(
      //     orderTag, 
      //     order[orderTag.replace('${', '').replace('}', '')]
      //   );
    }

    // send message
    postMessageToBuyer(db, config, marketPlace, order, autoMsg.message);
  }
}

const meliQuestions = async (db, sellerInfos, message, config) => {

  let marketPlaceColl = db.collection('marketPlace');
  let messageColl = db.collection('messages');

  let marketPlace = await marketPlaceColl.findOne({ _id: new ObjectId(sellerInfos.marketPlaceId) });

  let { questionId } = sellerInfos;

  if (!questionId) throw 'QuestionsId Required'
  if (!message) throw 'text Required'

  let returnMessage = await postQuestionsMeli(db, config, marketPlace, questionId, message);
  if (returnMessage)
    await messageColl.insertOne({
      sellerId: new ObjectId(sellerInfos.sellerId),
      marketPlaceId: new ObjectId(sellerInfos.marketPlaceId),
      platformId: new ObjectId(sellerInfos.platformId),
      externalId: sellerInfos.externalId,
      answser: message,
      from: sellerInfos.from,
      createdAt: new Date(),
      name: sellerInfos.name,
      read: true,
    });

  return returnMessage;
}

const meliQuestionDelete = async (db, sellerInfos) => {

  let marketPlaceColl = db.collection('marketPlace');
  let messageColl = db.collection('messages');
  let configColl = db.collection('config');

  try {

    let config = await configColl.findOne({});

    let marketPlace = await marketPlaceColl.findOne({ _id: new ObjectId(sellerInfos.marketPlaceId) });

    let { questionId, sellerId, platformId, marketPlaceId } = sellerInfos;

    if (!questionId) throw 'QuestionsId Required' 

    await deleteQuestionsMeli(db, config, marketPlace, questionId);

    await messageColl.updateMany(
      {
        questionId: questionId
      },
      {
        $set: {
          ...sellerInfos,
          sellerId: new ObjectId(sellerId),
          platformId: new ObjectId(platformId),
          marketPlaceId: new ObjectId(marketPlaceId)
          ,
          deleted: new Date()
        }
      },
      {
        upsert: true
      }
    )
  } catch (error) {
    if (error.response.data.error == 'not_unanswered_question')
      try {
        await messageColl.updateMany(
          {
            questionId: sellerInfos.questionId
          },
          {
            $set: {
              ...sellerInfos,
              sellerId: new ObjectId(sellerInfos.sellerId),
              platformId: new ObjectId(sellerInfos.platformId),
              marketPlaceId: new ObjectId(sellerInfos.marketPlaceId),
              deleted: new Date()
            }
          },
          {
            upsert: true
          }
        )
      } catch (error) {
        error
      }
  }

}

module.exports = { sendAutomaticMessage, meliQuestions, meliQuestionDelete };