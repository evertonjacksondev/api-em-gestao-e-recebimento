const soap = require('soap');


const correiosURL = (type) => {

  switch (type) {
    case 'cep':
      return `https://apps.correios.com.br/SigepMasterJPA/AtendeClienteService/AtendeCliente?wsdl`;
    case 'freight':
      return `http://ws.correios.com.br/calculador/CalcPrecoPrazo.asmx?wsdl`

  }
};

const clientSoap = async (env) => {
  const url = correiosURL(env)
  return await soap.createClientAsync(url)
};

const prepareTags = tagsRange => {
  const tags = tagsRange.split(',')
  const inicial = parseInt(tags[0].substring(2, 10))
  const final = parseInt(tags[1].substring(2, 10))
  const prefix = tags[0].substring(0, 2)
  const sufix = tags[0].substring(10).trim()

  const returnTags = []
  for (let i = inicial; i <= final; i++) {
    returnTags.push(genTagDigit(prefix + String(i).padStart(8, '0') + ' ' + sufix))
  }
  return returnTags
}

const genTagDigit = numeroEtiqueta => {
  let prefixo = numeroEtiqueta.substring(0, 2)
  let numero = numeroEtiqueta.substring(2, 10)
  let sufixo = numeroEtiqueta.substring(10).trim()
  let retorno = numero
  let z
  let multiplicadores = [8, 6, 4, 2, 3, 5, 9, 7]
  let soma = 0


  // Preenche número com 0 à esquerda
  if (numeroEtiqueta.length < 12) {
    retorno = "Error...";
  } else if (numero.length < 8 && numeroEtiqueta.length == 12) {
    let zeros = ''
    let diferenca = 8 - numero.length
    for (let i = 0; i < diferenca; i++) {
      zeros += '0'
    }
    retorno = zeros + numero
  } else {
    retorno = numero.substring(0, 8);
  }
  for (let i = 0; i < 8; i++) {
    soma += parseInt(retorno.substring(i, (i + 1))) * multiplicadores[i]
  }

  let resto = soma % 11
  if (resto == 0) {
    dv = '5'
  } else if (resto == 1) {
    dv = '0'
  } else {
    dv = parseInt(11 - resto).toString()
  }
  retorno += dv
  retorno = prefixo + retorno + sufixo
  return retorno
}

const calcFreight = async (filter) => {

  try {
    let client = await clientSoap('freight');

    let filterCalc = {};

    let {
      nCdEmpresa,
      sDsSenha,
      nCdServico,
      sCepOrigem,
      sCepDestino,
      nVlPeso,
      nCdFormato,
      nVlComprimento,
      nVlAltura,
      nVlLargura,
      nVlDiametro,
      sCdMaoPropria,
      nVlValorDeclarado,
      sCdAvisoRecebimento } = filter;


    // if (nCdEmpresa) throw 'nCdEmpresa required !'
    // if (sDsSenha) throw 'sDsSenha required !'
    if (!nCdServico) throw 'nCdServico required !'
    if (!sCepOrigem) throw 'sCepOrigem required !'
    if (!sCepDestino) throw 'sCepDestino required !'
    if (!nVlPeso) throw 'nVlPeso required !'
    if (!nCdFormato) throw 'nCdFormato required !'
    if (!nVlComprimento) throw 'nVlComprimento required !'
    if (!nVlAltura) throw 'nVlAltura required !'
    if (!nVlLargura) throw 'nVlLargura required !'
    if (!nVlDiametro) throw 'nVlDiametro required !'
    if (!sCdMaoPropria) throw 'sCdMaoPropria required !'
    // if (!nVlValorDeclarado == 0) throw 'nVlValorDeclarado required !'
    if (!sCdAvisoRecebimento) throw 'sCdAvisoRecebimento required !'

    if (nCdEmpresa) filterCalc['nCdEmpresa'] = nCdEmpresa;
    if (sDsSenha) filterCalc['sDsSenha'] = sDsSenha;
    if (nCdServico) filterCalc['nCdServico'] = nCdServico;
    if (sCepOrigem) filterCalc['sCepOrigem'] = sCepOrigem;
    if (sCepDestino) filterCalc['sCepDestino'] = sCepDestino;
    if (nVlPeso) filterCalc['nVlPeso'] = nVlPeso;
    if (nCdFormato) filterCalc['nCdFormato'] = Number(nCdFormato);
    if (nVlComprimento) filterCalc['nVlComprimento'] = nVlComprimento;
    if (nVlAltura) filterCalc['nVlAltura'] = nVlAltura;
    if (nVlLargura) filterCalc['nVlLargura'] = nVlLargura;
    if (nVlDiametro) filterCalc['nVlDiametro'] = nVlDiametro;
    if (sCdMaoPropria) filterCalc['sCdMaoPropria'] = sCdMaoPropria;
    if (nVlValorDeclarado) filterCalc['nVlValorDeclarado'] = Number(nVlValorDeclarado);
    if (sCdAvisoRecebimento) filterCalc['sCdAvisoRecebimento'] = sCdAvisoRecebimento;


    let result = (await client.CalcPrecoPrazoAsync(filterCalc))[0].CalcPrecoPrazoResult.Servicos.cServico[0]

    return result;

  } catch (err) {
    err
  }

};

const orderToSigepWebXML = async (db, orderArray) => {

  let sellerColl = db.collection('seller');
  let configColl = db.collection('config');
  let seller = await sellerColl.find({ _id: { $in: orderArray.map(m => m.sellerId) } }).toArray();
  let config = await configColl.findOne({});

  let labelColl = db.collection('labels');
  let label = await labelColl.find({ code: { $in: orderArray.map(m => m.shipping.trackingNumber) } }).toArray();


  let listaObjetosPostais = orderArray.map(m => {
    return {
      codServicoPostagem: label.find(f => f.code == m.shipping.trackingNumber).transportServiceCode == 'SEDEX' ? '03220' : '03298',
      cubagem: '0,00',
      tracking: label.find(f => f.code == m.shipping.trackingNumber).code,
      peso: '2500',
      nome: m.buyer.name,
      document: m.buyer.document,
      telefone: m.buyer.phone,
      celular: m.buyer.phone,
      email: '',
      logradouro: m.shipping.street,
      complemento: m.shipping.comment ? m.shipping.comment.substring(0, 30) : '',
      numero: m.shipping.number,
      bairro: m.shipping.neighborhood,
      cidade: m.shipping.city,
      uf: m.shipping.state,
      cep: m.shipping.zipCode,
      nf: m.invoice.number,
      descricaoObjeto: '',
      valorCobrar: '0,0',
      servicoAdicional: '025',
      valorDeclarado: '0,0',
      tipoObjeto: '002',
      dimensaoAltura: '8',
      dimensaoLargura: '20',
      dimensaoComprimento: '16',
      dimensaoDiametro: '0',
      statusProcessamento: '0'
    }
  })

  const prepareString = item => {
    if (item) return item.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  }

  const cartao_postagem = config.sigep.cartaoPostagem;
  const numeroContrato = config.sigep.contrato;
  const numeroDiretoria = config.sigep.diretoriaRegional;
  const codigoAdministrativo = config.sigep.codAdministrativo;
  const nomeRemetente = seller[0].name;
  const logradouroRemetente = prepareString(seller[0].address);
  const numeroRemetente = seller[0].number;
  const complementoRemetente = seller[0].comp ? seller[0].comp.substring(0, 30) : '';
  const bairroRemetente = prepareString(seller[0].neighborhood);
  const cepRemetente = seller[0].cep;
  const cidadeRemetente = prepareString(seller[0].city);
  const ufRemetente = seller[0].state;
  const telefoneRemetente = seller[0].phone.match(/\d/g).join("");
  const faxRemetente = seller[0].phone.match(/\d/g).join("");
  const emailRemetente = config.sigep.email;
  const document = seller[0].document.match(/\d/g).join("");

  let header =
    `<?xml version="1.0" encoding="ISO-8859-1" ?>
    <correioslog>
      <tipo_arquivo>Postagem</tipo_arquivo>
      <versao_arquivo>2.3</versao_arquivo>
      <plp>
        <id_plp/>
        <valor_global/>
        <mcu_unidade_postagem/>
        <nome_unidade_postagem/>
        <cartao_postagem><![CDATA[${cartao_postagem}]]></cartao_postagem>
      </plp>
      <remetente>
        <numero_contrato><![CDATA[${numeroContrato}]]></numero_contrato>
        <numero_diretoria><![CDATA[${numeroDiretoria}]]></numero_diretoria>
        <codigo_administrativo><![CDATA[${codigoAdministrativo}]]></codigo_administrativo>
        <nome_remetente><![CDATA[${nomeRemetente}]]></nome_remetente>
        <logradouro_remetente><![CDATA[${logradouroRemetente}]]></logradouro_remetente>
        <numero_remetente><![CDATA[${numeroRemetente}]]></numero_remetente>
        <complemento_remetente><![CDATA[${complementoRemetente}]]></complemento_remetente>
        <bairro_remetente><![CDATA[${bairroRemetente}]]></bairro_remetente>
        <cep_remetente><![CDATA[${cepRemetente}]]></cep_remetente>
        <cidade_remetente><![CDATA[${cidadeRemetente}]]></cidade_remetente>
        <uf_remetente><![CDATA[${ufRemetente}]]></uf_remetente>
        <telefone_remetente><![CDATA[${telefoneRemetente}]]></telefone_remetente>
        <fax_remetente><![CDATA[${faxRemetente}]]></fax_remetente>
        <email_remetente><![CDATA[${emailRemetente}]]></email_remetente>
        <celular_remetente></celular_remetente>
        <cpf_cnpj_remetente><![CDATA[${document}]]></cpf_cnpj_remetente>
        <ciencia_conteudo_proibido>S</ciencia_conteudo_proibido>        
      </remetente>
      <forma_pagamento/>`;



  let postalObjects = [];

  listaObjetosPostais.forEach((objetoPostal, index) => {

    const name = prepareString(objetoPostal.nome)
    const complement = prepareString(objetoPostal.complemento)
    const city = prepareString(objetoPostal.cidade)
    const district = prepareString(objetoPostal.bairro).substring(0, 28)
    const street = prepareString(objetoPostal.logradouro).substring(0, 33)

    postalObjects.push(`
      <objeto_postal>
        <numero_etiqueta>${objetoPostal.tracking}</numero_etiqueta>
        <codigo_objeto_cliente/>
        <codigo_servico_postagem>${objetoPostal.codServicoPostagem}</codigo_servico_postagem>
        <cubagem><![CDATA[${objetoPostal.cubagem}]]></cubagem>
        <peso><![CDATA[${objetoPostal.peso}]]></peso>
        <rt1/>
        <rt2/>
        <restricao_anac>S</restricao_anac>
        <destinatario>
          <nome_destinatario><![CDATA[${name}]]></nome_destinatario>
          <telefone_destinatario><![CDATA[${objetoPostal.telefone}]]></telefone_destinatario>
          <celular_destinatario><![CDATA[${objetoPostal.celular}]]></celular_destinatario>
          <email_destinatario><![CDATA[${objetoPostal.email}]]></email_destinatario>
          <logradouro_destinatario><![CDATA[${street}]]></logradouro_destinatario>
          <complemento_destinatario><![CDATA[${complement}]]></complemento_destinatario>
          <numero_end_destinatario><![CDATA[${objetoPostal.numero}]]></numero_end_destinatario>
          <cpf_cnpj_destinatario></cpf_cnpj_destinatario>
        </destinatario>
        <nacional>
          <bairro_destinatario><![CDATA[${district}]]></bairro_destinatario>
          <cidade_destinatario><![CDATA[${city}]]></cidade_destinatario>
          <uf_destinatario><![CDATA[${objetoPostal.uf}]]></uf_destinatario>
          <cep_destinatario><![CDATA[${objetoPostal.cep}]]></cep_destinatario>
          <codigo_usuario_postal/>
          <centro_custo_cliente/>
          <numero_nota_fiscal><![CDATA[${objetoPostal.nf}]]></numero_nota_fiscal>
          <serie_nota_fiscal/>
          <valor_nota_fiscal/>
          <natureza_nota_fiscal/>
          <descricao_objeto><![CDATA[${objetoPostal.descricaoObjeto}]]></descricao_objeto>
          <valor_a_cobrar><![CDATA[${objetoPostal.valorCobrar}]]></valor_a_cobrar>
        </nacional>        
        <servico_adicional>
           <codigo_servico_adicional>025</codigo_servico_adicional>
           <valor_declarado>${objetoPostal.valorDeclarado.toLocaleString()}</valor_declarado>
        </servico_adicional>
        <dimensao_objeto>
          <tipo_objeto>${objetoPostal.tipoObjeto}</tipo_objeto>
          <dimensao_altura>${objetoPostal.dimensaoAltura}</dimensao_altura>
          <dimensao_largura>${objetoPostal.dimensaoLargura}</dimensao_largura>
          <dimensao_comprimento>${objetoPostal.dimensaoComprimento}</dimensao_comprimento>
          <dimensao_diametro>${objetoPostal.dimensaoDiametro}</dimensao_diametro>
        </dimensao_objeto>
        <data_postagem_sara/>
        <status_processamento>${objetoPostal.statusProcessamento}</status_processamento>
        <numero_comprovante_postagem/>
        <valor_cobrado/>
      </objeto_postal>
    `)

  });

  let ret = `${header}${postalObjects.join()}</correioslog>`

  return ret;

}

module.exports = { correiosURL, clientSoap, prepareTags, genTagDigit, calcFreight, orderToSigepWebXML }