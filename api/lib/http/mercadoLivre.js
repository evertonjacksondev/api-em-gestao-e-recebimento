const { ObjectId } = require('mongodb');

'use strict';

let axios = require('axios');
let unzipper = require('unzipper');
const { chunkArray } = require('../util/javaScript');


const getAccesToken = async (db, marketPlace, firstAccess) => {

  let accessToken = marketPlace.auth ? marketPlace.auth.accessToken : undefined;

  if (firstAccess) marketPlace.auth['expiresIn'] = new Date();

  if (
    marketPlace.auth &&
    marketPlace.auth.tg &&
    (!marketPlace.auth.expiresIn || marketPlace.auth.expiresIn <= new Date())) {

    let tg = marketPlace.auth.tg;

    let data = {
      client_id: '8212466574434278',
      redirect_uri: 'https://app.digigrow.com.br/marketplace',
      client_secret: 'mQHEHzUBH2BTTgYqfu2Gt5UWQHAXQvLc'
    };

    if (firstAccess) data.code = tg;
    if (firstAccess) data.grant_type = 'authorization_code';
    if (!firstAccess) data.refresh_token = tg;
    if (!firstAccess) data.grant_type = 'refresh_token';

    let result = await axios({
      method: 'post',
      url: 'https://api.mercadolibre.com/oauth/token',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data
    });

    let auth = {};

    let expiresDate = new Date();
    expiresDate.setSeconds(expiresDate.getSeconds() + result.data.expires_in - 600)

    auth.accessToken = result.data.access_token;
    auth.expiresIn = expiresDate;
    auth.sellerId = marketPlace.auth.sellerId;
    auth.tg = result.data.refresh_token

    let marketPlaceColl = db.collection('marketPlace');
    await marketPlaceColl.updateOne(
      { _id: marketPlace._id },
      { $set: { auth, updatedAt: new Date(), updatedUser: 'REFRESH_TOKEN' } },
    )

    accessToken = result.data.access_token;
  }

  return accessToken;
}

const getOrders = async (db, config, params) => {
  let ordersMeli = [];
  params.limit = 50;

  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/orders/search`,
    headers: {
      'Content-Type': 'application/json'
    },
    params
  };

  let returnMeli = (await axios(configAxios)).data;
  let pages = Math.trunc(returnMeli.paging.total / 50);
  ordersMeli.push(...returnMeli.results);

  for (var page = 1; page <= pages; page++) {
    configAxios.params.offset = page * 50;
    returnMeli = (await axios(configAxios)).data;
    ordersMeli.push(...returnMeli.results);
  }

  return ordersMeli;
}

const getOrderById = async (db, config, marketPlace, order) => {
  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/orders/${order}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    }
  };

  return (await axios(configAxios)).data;
}

const getCategoryByTitle = async (config, title) => {

  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/sites/MLB/domain_discovery/search`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      q: `${title}`
    }
  };

  let ret = (await axios(configAxios)).data;

  return ret && ret.length ? ret[0].category_id : undefined;
}

const getBrandsMeli = async (db, config, marketPlace) => {

  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/users/${marketPlace.auth.sellerId}/brands`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
    }
  };

  return (await axios(configAxios)).data;
}

const getSaleTerms = async (db, config, data) => {

  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/categories/${data}/sale_terms`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
    }
  };

  return (await axios(configAxios)).data;
}

const getlisting_types = async (db, config, data) => {

  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/sites/MLB/listing_types`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
    }
  };

  return (await axios(configAxios)).data;
}

const getAttributes = async (db, config, data) => {

  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/categories/${data}/attributes`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
    }
  };

  return (await axios(configAxios)).data;
}

const getShippingItemsById = async (db, config, marketPlace, shippingId) => {
  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipments/${shippingId}/items`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    }
  };

  return (await axios(configAxios)).data;
}

const getShippingById = async (db, config, marketPlace, shipping) => {
  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipments/${shipping}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    }
  };

  return (await axios(configAxios)).data;
}



const getBillingInfoById = async (db, config, marketPlace, order) => {
  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/orders/${order}/billing_info`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    }
  };

  return (await axios(configAxios)).data;
}

const putItemById = async (db, config, marketPlace, item, data) => {
  try {
    let configAxios = {
      method: 'put',
      timeout: 20000,
      url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${item}`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        // seller: marketPlace.auth.sellerId,
        access_token: await getAccesToken(db, marketPlace)
      },
      data
    };

    return (await axios(configAxios)).data;
  } catch (err) {
    return err
  }
}

const splitShipment = async (db, config, marketPlace, shipmentId, packs) => {

  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipments/${shipmentId}/split`,
    headers: {
      'Content-Type': 'application/json',
      'x-split-order': true
    },
    params: {
      // seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    },
    data: {
      reason: "ANOTHER_WAREHOUSE",
      packs
    }
  };

  return (await axios(configAxios)).data;

}

const deleteCampaing = async (db, deals, publishId, marketPlace) => {
  try {

    //    let configAxios = {
    //       method: 'delete',
    //       timeout: 20000,
    //       // url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${item}`,
    //       url: `https://api.mercadolibre.com/seller-promotions/items/${publishId}?promotion_type=$PROMOTION_TYPE&deal_id=${deals[0]}`,
    //       headers: {
    //           'Content-Type': 'application/json'
    //       },
    //       params: {
    //           // seller: marketPlace.auth.sellerId,
    //           access_token = await getAccesToken(db, marketPlace)
    //       },
    // }


    let campaingDelete = [];

    for (let deal in deals) {

      await axios.delete(`https://api.mercadolibre.com/seller-promotions/items/${publishId}?promotion_type=DEAL&deal_id=${deals[deal]}`, {
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          // seller: marketPlace.auth.sellerId,
          access_token: await getAccesToken(db, marketPlace)
        },
      })
        .then(response => campaingDelete.push(response.data))
        .catch(error => campaingDelete.push(error))
    }

    return (campaingDelete);
  } catch (err) {
    alert(err)
  }
}

const postListingTypeItemById = async (db, config, marketPlace, item, data) => {

  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${item}/listing_type`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    },
    data
  };

  return (await axios(configAxios)).data;

}

const putDescriptionItemById = async (db, config, marketPlace, item, data) => {
  try {

    let configAxios = {
      method: 'put',
      timeout: 20000,
      url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${item}/description?api_version=2`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        seller: marketPlace.auth.sellerId,
        access_token: await getAccesToken(db, marketPlace)
      },
      data
    };

    return (await axios(configAxios)).data;

  } catch (error) {
    console.log(error)
  }

}

const getItemById = async (db, config, marketPlace, publishArray) => {
  let chunks = chunkArray(publishArray, 20);
  let params = { include_attributes: 'all' };

  if (marketPlace) {
    params.seller = marketPlace.auth.sellerId;
    params.access_token = await getAccesToken(db, marketPlace);
  }

  let publishies = [];
  for (let chunk of chunks) {
    params.ids = chunk.join(',');

    let configAxios = {
      method: 'get',
      timeout: 20000,
      url: `${config.urls.mercadoLivre.trimEnd('/')}/items`,
      headers: {
        'Content-Type': 'application/json'
      },
      params
    };

    let retorno = (await axios(configAxios)).data.map(m => {
      if (m.code == 200) return m.body;
      else return {};
    });

    publishies.push(...retorno);
  }

  return publishies;
}

const getDescription = async (db, config, marketPlace, publishArray) => {
  let params = {};

  if (marketPlace) {
    params.seller = marketPlace.auth.sellerId;
    params.access_token = await getAccesToken(db, marketPlace);
  }

  let descriptions = [];
  for (let publish of publishArray) {

    let configAxios = {
      method: 'get',
      timeout: 20000,
      url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${publish}/description`,
      params,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    let retorno = (await axios(configAxios)).data

    descriptions.push({ mlb: publish, description: retorno.plain_text })
  }

  return descriptions;
}

const postShippingInvoice = async (db, config, marketPlace, shipping, xmlInvoice) => {
  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipments/${shipping}/invoice_data`,
    headers: {
      'Content-Type': 'application/xml',
      'Accept': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace),
      siteId: 'MLB'
    },
    data: xmlInvoice
  };

  return (await axios(configAxios)).data;
}

const getShippingLabelMeli = async (db, config, marketPlace, shipping, labelType = 'zpl2') => {
  let configAxios = {
    method: 'get',
    responseType: 'stream',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipment_labels`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      access_token: await getAccesToken(db, marketPlace),
      shipment_ids: shipping,
      response_type: labelType
    }
  };

  let data = (await axios(configAxios)).data;

  if (labelType == 'zpl2') {
    let zipStream = data.pipe(unzipper.Parse({ forceStream: true }));

    for await (const entry of zipStream) {
      if (entry.path === 'Etiqueta de envio.txt') {
        return (await entry.buffer()).toString('utf8');
      } else {
        entry.autodrain();
      }
    }

  }

}

const postMessageToBuyer = async (db, config, marketPlace, order, message) => {
  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')
      }/messages/packs/${order.packId ? order.packId : order.externalId
      }/sellers/${marketPlace.auth.sellerId
      }`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      application_id: marketPlace.auth.userId
    },
    data: {
      from: {
        user_id: marketPlace.auth.sellerId,
      },
      to: {
        user_id: order.buyer.buyerId
      },
      text: message
    }
  };

  return (await axios(configAxios)).data;
}

const putShippingTracking = async (db, config, marketPlace, shippingId, trackingNumber) => {
  let configAxios = {
    method: 'put',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipments/${shippingId}`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    },
    data: {
      service_id: 11,
      tracking_number: trackingNumber
    }
  };

  return (await axios(configAxios)).data;
}

const postShippingStatus = async (db, config, marketPlace, shippingId, status, comment, date = new Date()) => {
  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/shipments/${shippingId}/seller_notifications`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    },
    data: {
      payload: {
        comment,
        date
      },
      "tracking_url": "http://www.url.test/40886674732",
      status,
      substatus: null
    }
  };

  return (await axios(configAxios)).data;
}

const getPublishQuality = async (db, config, marketPlace, publishId) => {
  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${publishId}/health`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    }
  };

  return (await axios(configAxios)).data;
}

const getMeliSaleMessage = async (db, config, marketPlace, messageId) => {

  const configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/messages/${messageId}`,
    params: {
      access_token: await getAccesToken(db, marketPlace)
    },
  };

  return (await axios(configAxios)).data;
}

const getMeliQuestionMessage = async (db, config, marketPlace, messageId) => {

  const configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/questions/${messageId}`,
    params: {
      access_token: await getAccesToken(db, marketPlace),
      api_version: 4
    },
  };

  return (await axios(configAxios)).data;
}

const getMeliUserId = async (db, config, marketPlace, messageId) => {

  const configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/users/${messageId}`,
    params: {
      access_token: await getAccesToken(db, marketPlace)
    },
  };

  return (await axios(configAxios)).data;
}

const postCreatedPublish = async (db, config, marketPlace, body) => {
  let accesToken = await getAccesToken(db, marketPlace)
  let token = 'Bearer ' + accesToken

  let configAxios = {

    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/items`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    data: body
  };
  return (await axios(configAxios)).data;
}

const getInvoiceMeli = async (db, config, marketPlace, body) => {
  let accesToken = await getAccesToken(db, marketPlace[0])
  let token = 'Bearer ' + accesToken

  let configAxios = {

    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/users/${marketPlace[0].auth.sellerId}/invoices/orders/${body.externalId}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    }
  };

  return (await axios(configAxios)).data;
}

const getXmlMeli = async (db, config, marketPlace, body) => {
  let accesToken = await getAccesToken(db, marketPlace[0])
  let token = 'Bearer ' + accesToken

  let configAxios = {

    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/users/${marketPlace[0].auth.sellerId}/invoices/documents/xml/${body}/authorized`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    }
  };


  return (await axios(configAxios)).data;
}

const postDescriptionItemById = async (db, config, marketPlace, publish, description) => {
  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${publish}/description`,
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      seller: marketPlace.auth.sellerId,
      access_token: await getAccesToken(db, marketPlace)
    },
    data: { plain_text: description }
  };

  return (await axios(configAxios)).data;
}

const getPaymentMp = async (db, config, marketPlace, paymentId) => {
  let configAxios = {
    method: 'get',
    timeout: 20000,
    url: `${config.urls.mercadoPago.trimEnd('/')}/v1/payments/${paymentId}`,
    params: {
      access_token: await getAccesToken(db, marketPlace)
    },
    headers: {
      'Content-Type': 'application/json',
    },
  };

  return (await axios(configAxios)).data;
}

const postReponseMeliMessage = async (sellerInfos, message, config, order, token) => {
  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')
      }/messages/packs/${order.packId ? order.packId : order.externalId
      }/sellers/${sellerInfos.from
      }`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    data: {
      from: {
        user_id: sellerInfos.from
      },
      to: {
        user_id: order.buyer.buyerId
      },
      text: message
    }
  };
  return await axios(configAxios).data;

}

const getLinkStorage = async (link) => {

  const configAxios = {
    method: 'get',
    timeout: 20000,
    url: link,
  };


  return (await axios(configAxios)).data;
}

const putPublishFiscal = async (body) => {
  let configAxios = {
    method: 'post',
    timeout: 20000,
    url: `http://api.mercadolibre.com/items/fiscal_information`,
    headers: {
      'Authorization': 'Bearer APP_USR-6888687643271993-122112-d4713bdcad7a01de3c7a21bd0702bd43__LD_LC__-128019548',
      'Content-Type': 'application/json'
    },
    data: body

  }
  return (await axios(configAxios)).data;
}

const postQuestionsMeli = async (db, config, marketPlace, questionId, text) => {
  let accesToken = await getAccesToken(db, marketPlace)
  let token = 'Bearer ' + accesToken

  configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/answers`,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json'
    },
    data: {
      question_id: questionId,
      text: text
    }
  }
}

const deleteQuestionsMeli = async (db, config, marketPlace, questionId) => {
  let accesToken = await getAccesToken(db, marketPlace)
  let token = 'Bearer ' + accesToken

  configAxios = {
    method: 'delete',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/questions/${questionId}`,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json'
    },
  }
  return (await axios(configAxios)).data
}

const postCompatibilitieMeli = async (db, config = {}, marketPlace = {}, publishId = '', attributes = []) => {

  configAxios = {
    method: 'post',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${publishId}/compatibilities`,
    data: {
      products_families: [
        {
          domain_id: 'MLB-CARS_AND_VANS',
          attributes
        }
      ]
    },
    headers: {
      Authorization: `Bearer ${await getAccesToken(db, marketPlace)}`
    },
  }

  return (await axios(configAxios)).data;
}

const putOffFreightFree = async (db, config, marketPlace, publishId, body) => {

  let accesToken = await getAccesToken(db, marketPlace)
  let token = 'Bearer ' + accesToken

  configAxios = {
    method: 'put',
    timeout: 20000,
    url: `${config.urls.mercadoLivre.trimEnd('/')}/items/${publishId}`,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json'
    },
    data: body
  }
  
  return (await axios(configAxios)).data
}


module.exports = {
  getOrders,
  putDescriptionItemById,
  getOrderById,
  getShippingById,
  getBillingInfoById,
  getShippingItemsById,
  getItemById,
  putItemById,
  postShippingInvoice,
  getShippingLabelMeli,
  postMessageToBuyer,
  putShippingTracking,
  postShippingStatus,
  getDescription,
  getPublishQuality,
  postListingTypeItemById,
  postDescriptionItemById,
  deleteCampaing,
  getAccesToken,
  getMeliSaleMessage,
  postCreatedPublish,
  getCategoryByTitle,
  getBrandsMeli,
  getSaleTerms,
  getlisting_types,
  getAttributes,
  getMeliQuestionMessage,
  postReponseMeliMessage,
  getInvoiceMeli,
  getXmlMeli,
  getPaymentMp,
  putPublishFiscal,
  getLinkStorage,
  getMeliUserId,
  postQuestionsMeli,
  deleteQuestionsMeli,
  splitShipment,
  postCompatibilitieMeli,
  putOffFreightFree
};