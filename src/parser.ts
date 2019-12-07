import 'colors';

const {Transform, Writable} = require('stream');
const $ = require('cheerio');
import Axios from 'axios';

import fs from 'fs-extra';

const csv = require('csv');
import * as moment from 'moment-timezone';
import { getJikiuProductDetails, ProductDetails } from './jikiu-parser';

const url = (brand) => {
  brand = brand.toLowerCase();
  if (brand === 'jikiu') return 'https://www.jikiu.com/service/get_part_number';

  throw new Error(`Unsupported brand: ${brand}`);
};

const getRawProductPage = async (brand: string, itemName: string) => {
  switch (brand) {
    case 'jikiu':
      const searchResult = await Axios.request({
        method: 'POST',
        url: url('jikiu'),
        data: JSON.stringify({search_part: itemName}),
        headers: {
          'Content-type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      const response = {
        success: Array.isArray(searchResult.data) && !!searchResult.data[0]
      };

      return {
        ...response,
        data: response.success && (await Axios.get(`https://www.jikiu.com/catalogue/${searchResult.data[0].pid}`)).data
      };
    default:
      throw new Error(`Unsupported brand: ${brand}`);
  }
};

const rootPath = process.cwd();
const brandColumn = 'Brand';
const partColumn = 'Part';

const inputFileName = process.argv[2] || 'all.csv';
// const inputFileName = process.argv[2] || 'input.csv';
const imageFolder = process.argv[3] || 'out/%%brand%%/img';
const specificationPathJikiu = 'out/jikiu/specification.csv';
const analogsPathJikiu = 'out/jikiu/crosses.csv';
const usagePathJikiu = 'out/jikiu/usage.csv';
const subassemblyPathJikiu = 'out/jikiu/subassembly.csv';
const couplePathJikiu = 'out/jikiu/couple.csv';

const analogsColumns = ['Brand', 'Part Number', 'OWNER', 'NUMBER'];
const specificationColumns = ['Brand', 'Part Number', 'Parameter', 'Value'];
const usageColumns = ['Brand', 'Part Number', 'Brand', 'Model', 'Year', 'Engine', 'Description'];
const subassemblyColumns = ['Brand', 'Part Number', 'Brand', 'Part', 'Type'];
const coupleColumns = ['Brand', 'Part Number', 'Number'];

const logError = (e) => {
  console.error(`[${moment.tz('Europe/Kiev').format('YYYY-MM-DD HH:mm:ss.SSS')}]: Error occurred: ${e.message}`.red);
};

let counter = 0;
async function run() {

  fs.ensureDirSync('out');

  fs.ensureFileSync(specificationPathJikiu);
  fs.ensureDirSync(imageFolder.replace('%%brand%%', 'jikiu'));
  fs.ensureFileSync(analogsPathJikiu);

  const stream = getList()
    .on('error', logError)
    .pipe(parseTransform)
    .on('error', logError);

  stream    //Jikiu Save analogs to file
    .pipe(transformAnalogsJikiuCsvStream)
    .on('error', logError)
    .pipe(csv.stringify({header: true, columns: analogsColumns}))
    .on('error', logError)
    .pipe(fs.createWriteStream(analogsPathJikiu))
    .on('error', logError);

  stream    //Jikiu Save specs to file
    .pipe(transformJikiuSpecificationCsvStream)
    .on('error', logError)
    .pipe(csv.stringify({header: true, columns: specificationColumns}))
    .on('error', logError)
    .pipe(fs.createWriteStream(specificationPathJikiu))
    .on('error', logError);

  stream    //Jikiu Save subassembly to file
    .pipe(transformJikiuSubassemblyCsvStream)
    .on('error', logError)
    .pipe(csv.stringify({header: true, columns: subassemblyColumns}))
    .on('error', logError)
    .pipe(fs.createWriteStream(subassemblyPathJikiu))
    .on('error', logError);

  stream    //Jikiu Save couples to file
    .pipe(transformJikiuCoupleCsvStream)
    .on('error', logError)
    .pipe(csv.stringify({header: true, columns: coupleColumns}))
    .on('error', logError)
    .pipe(fs.createWriteStream(couplePathJikiu))
    .on('error', logError);

  stream    //Jikiu Save usage to file
    .pipe(transformJikiuUsageCsvStream)
    .on('error', logError)
    .pipe(csv.stringify({header: true, columns: usageColumns}))
    .on('error', logError)
    .pipe(fs.createWriteStream(usagePathJikiu))
    .on('error', logError);


  stream    //Save image
    .pipe(transformFileStream)
    .on('error', logError)
    .pipe(writeFileStream)
    .on('error', logError);

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      resolve('Done');
    });
  });
}

function getList() {
  const rs = fs.createReadStream(inputFileName);
  return rs.pipe(csv.parse({columns: true}));
}

const parseTransform = new Transform({
  objectMode: true,
  async transform(record, encoding, callback) {
    // console.log('parseTransform',record)
    const itemName = record[partColumn];

    const brand = record[brandColumn].toLowerCase();
    process.stdout.write(`[${moment.tz('Europe/Kiev').format('YYYY-MM-DD HH:mm:ss.SSS')}] ${brand.toUpperCase()} ${itemName} ... `);
    const result = await getProductPage(brand, itemName);

    if (!result.success) {
      fs.appendFileSync(rootPath + '/errors.csv', await stringify([[brand, itemName]]));
      return callback(new Error(`Not found: [${brand} ${itemName}]`));
    }
    console.log(result.success ? 'success'.green : 'error'.red, ++counter);

    const $root = $(result.data);

    const {spec, analog, imgUrl, couple, subassembly, usage} = getProductDetails(brand, itemName, $root);

    callback(null, {spec, analog, imgUrl, itemName, brand, couple, subassembly, usage});
  }
});

async function getProductPage(brand, itemName: string): Promise<{ success: boolean, data: any }> {
  try {
    return getRawProductPage(brand, itemName);
  } catch (e) {
    return {success: false, data: null};
  }
}


const writeFileStream = new Writable({
  objectMode: true,
  write(data, encoding, callback) {
    const file = fs.createWriteStream(`out/${data.fileName}`);
    data.stream.pipe(file);
    callback();
  }
});

const transformAnalogsJikiuCsvStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    // console.log('transformAnalogsCsvStream',data)
    data.analog.forEach(([owner, number]) => {
      if (data.brand === 'jikiu')
        this.push([data.brand, data.itemName, owner, number]);
    });
    callback(null);
  }
});


const transformJikiuSpecificationCsvStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    data.spec.forEach(([param, value]) => {
      if (data.brand === 'jikiu')
        this.push([data.brand, data.itemName, param, value]);
    });
    callback();
  }
});

const transformJikiuSubassemblyCsvStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    data.subassembly.forEach(([brand, part, type]) => {
      if (data.brand === 'jikiu')
        this.push([data.brand, data.itemName, brand, part, type]);
    });
    callback();
  }
});

const transformJikiuCoupleCsvStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    data.couple.forEach(([couple]) => {
      if (data.brand === 'jikiu')
        this.push([data.brand, data.itemName, couple]);
    });
    callback();
  }
});

const transformJikiuUsageCsvStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    data.usage.forEach(([brand, model, years, engine, descr]) => {
      if (data.brand === 'jikiu')
        this.push([data.brand, data.itemName, brand, model, years, engine, descr]);
    });
    callback();
  }
});

const transformFileStream = new Transform({
  objectMode: true,
  async transform(data, encoding, callback) {
    try {
      const url = data.imgUrl;
      const ext = url.split('.').pop();
      const fileName = `${data.brand.toLowerCase()}/img/${data.itemName}.${ext}`;
      // const fileName = `${data.brand.toLowerCase()}/img/${data.itemName}.${ext}`;
      const response = await Axios({method: 'get', url, responseType: 'stream'});
      callback(null, {stream: response.data, fileName});
    } catch (e) {
      callback(null);
    }
  }
});


function getProductDetails(brand: 'jikiu', itemName: string, root: Cheerio): ProductDetails {
  switch (brand) {
    case 'jikiu':
      return getJikiuProductDetails(root);
  }
}

function stringify(data: any[][]): Promise<string> {
  return new Promise<string>(resolve => csv.stringify(data, (e, out) => resolve(out)));
}


run().then(console.log).catch(console.error);
