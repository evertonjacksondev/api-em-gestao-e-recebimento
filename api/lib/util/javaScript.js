function chunkArray(myArray, chunk_size) {
  var results = [];
  while (myArray.length) {
    results.push(myArray.splice(0, chunk_size));
  }

  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDaysInCurrentMonth() {
  const date = new Date();

  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  ).getDate();
}

let groupBy = (arr, key) => {
  key = `${key}`;
  let ret = {};
  for (let item of arr) {
      if (item[key] != undefined) {
          if (ret[item[key]]) ret[item[key]].push(item); else ret[item[key]] = [item]
      }
  }

  return ret;
}


function toFixed(number, decimals) {

  number = number.toString();
  number = number.substr(0, number.indexOf('.') == -1 ? number.length : number.indexOf('.') + decimals + 2);

  let residual = 0;
  if (number.split('.')[1] && number.split('.')[1][decimals]) {
    residual = Math.round(Number(`0.${number.split('.')[1][decimals]}`)) / Math.pow(10, decimals);
    number = Number(number) + residual;
    number = number.toString().slice(0, number.toString().split('.')[0].length + 1 + decimals);
  }

  return Number(number);
}

function escapeSpecialChar(string = '') {
  return string.toLowerCase()
    .replace(/a|á|à|ã|â/g, '[a,á,à,ã,â]')
    .replace(/e|é|è/g, '[e,é,è]')
    .replace(/i|í|ì/g, '[i,í,ì]')
    .replace(/o|ó|ò|õ|ô/g, '[o,ó,ò,õ,ô]')
    .replace(/u|ú|ù/g, '[u,ú,ù]')
    .replace(/c|ç/g, '[c,ç]')
}

module.exports = {
  chunkArray,
  sleep,
  toFixed,
  escapeSpecialChar,
  getDaysInCurrentMonth,
  groupBy
}