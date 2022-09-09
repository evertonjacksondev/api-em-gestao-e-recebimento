
const axios = require('axios');
const azure = require('azure-storage');
const aws = require('aws-sdk');

const downloadURI = async (url) => {

  try {
    let image = await axios.get(url, { responseType: 'arraybuffer' });
    if (!image) throw 'Arquivo não encontrado'
    let raw = Buffer.from(image.data).toString('base64');

    return "data:" + image.headers["content-type"] + ";base64," + raw;

  } catch (erro) {
   if (erro.response.statusText == 'Not Found') throw 'Imagem não encontrada'
  }

}

const uploadFile = (stream, type, fileName) => {
  const blobSvc =
    azure.createBlobService(
      "DefaultEndpointsProtocol=https;AccountName=aigroupbackup;AccountKey=MdF9XbPzRIVeOyHnYmtuqUfCuBeMU3zyet+co5X3bxEcAfhuVC7f51fsmBTsaINa6EN9JDmj26RjwbKS2yOKFA==;EndpointSuffix=core.windows.net"
    );

  blobSvc.createAppendBlobFromText(
    'digigrow-files',
    fileName,
    stream,
    { contentType: type },
    () => { }
  );

  let filePath = `https://aigroupbackup.blob.core.windows.net/digigrow-files/${fileName}`;
  return filePath;
}


const deleteFile = (fileName) => {
  const blobSvc =
    azure.createBlobService(
      "DefaultEndpointsProtocol=https;AccountName=aigroupbackup;AccountKey=MdF9XbPzRIVeOyHnYmtuqUfCuBeMU3zyet+co5X3bxEcAfhuVC7f51fsmBTsaINa6EN9JDmj26RjwbKS2yOKFA==;EndpointSuffix=core.windows.net"
    );

  blobSvc.deleteBlob(
    'digigrow-files',
    fileName,
    () => { }
  );

  let filePath = `https://aigroupbackup.blob.core.windows.net/digigrow-files/${fileName}`;
  return filePath;
}

const uploadFileS3 = async (file, fileName) => {
  const s3 = new aws.S3({
    accessKeyId: "AKIAVPDNT7NDTZE6H5JB",
    secretAccessKey: "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"
  });

  const params = {
    Bucket: 'growhubstorage',
    Body: file,
    Key: fileName,
    ACL: 'public-read-write'
  };
  let uploaded = await s3.upload(params).promise()
  return uploaded.Location;
};

const deleteFileS3 = async (fileName) => {
  const s3 = new aws.S3({
    accessKeyId: "AKIAVPDNT7NDTZE6H5JB",
    secretAccessKey: "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"
  });

  const params = {
    Bucket: 'growhubstorage',
    Key: fileName

  }

  return await s3.deleteObject(params).promise();
};


module.exports = { uploadFile, deleteFile, downloadURI, uploadFileS3, deleteFileS3 }