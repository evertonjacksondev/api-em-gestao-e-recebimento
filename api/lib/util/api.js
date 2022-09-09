const getAndCheckParamsType = (to, from, type, nomes = []) => {
  for (let nome of nomes) {
    if( from[nome] || from[nome] == 0) {
      if (typeof from[nome] != type) throw `body > ${nome} needs to be ${type}`;
      to[nome] = from[nome];
    } 
  }

}

module.exports = { getAndCheckParamsType }