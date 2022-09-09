const getErrorMessage = (error) => {
  let ret = error.response ? error.response.data : error.message ? error.message : Array.isArray(error) || typeof error == 'string' ? error : JSON.stringify(error);
  return ret
}

module.exports = {getErrorMessage};