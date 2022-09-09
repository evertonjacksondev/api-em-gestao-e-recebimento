let axios = require('axios');

const getZPLImage = async (zpl) => {


  const configAxios = {
    method: 'post',
    timeout: 20000,
    url: 'https://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/',
    headers: {
      Accept: 'image/png',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    responseType: 'arraybuffer',
    data: zpl
  };

  let data = await axios(configAxios)


  return data
}

module.exports = { getZPLImage }