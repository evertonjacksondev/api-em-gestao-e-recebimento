import * as XLSX from 'xlsx';

const readXLSX = async (fileBuffer) => {
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const products = wb.SheetNames[1];
  const ws = wb.Sheets[products];
  return XLSX.utils.sheet_to_json(ws, {blankRows: true, header: 1, raw: false, defval: null }).splice(2);
};

const writeXLSX = async (fileName, workSheets) => {
  let wb = XLSX.utils.book_new();
  for (let workSheet of workSheets) {
    let { ws, sheetName } = workSheet;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, fileName);
};

const createWorkSheet = async (data, sheetName) => {
  var ws = XLSX.utils.json_to_sheet(data, { cellDates: true });

  return { ws, sheetName }
}; 

module.exports = {readXLSX, writeXLSX, createWorkSheet }