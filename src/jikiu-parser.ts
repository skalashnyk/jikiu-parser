'use strict';

import $ from 'cheerio';

export type ProductDetails = {
  imgUrl: string,
  analog: string[][],
  spec: string[][],
  subassembly: string[][],
  couple: string[][],
  usage: string[][]
}


export function getJikiuProductDetails($root: Cheerio): ProductDetails {

  const $panel = $root.find('.productDetail');

  const imgUrl = $panel.find('[data-lightbox=product-image-set]').attr('href');
  const spec = getJikiuTableData($panel.find('.productspec').find('table').find('tbody')).filter(e => !!e);

  const analog = getJikiuTableData($panel.find('.productapp').find('table').find('tbody')).filter(e => !!e);
  const subassembly = getJikiuTableData($panel.find('.subassembly').find('table').find('tbody'), 3).filter(e => !!e);
  const couple = getJikiuTableData($panel.find('.productapp').find('table').find('tbody'), 1).filter(e => !!e);
  const usage = getUsage($panel.find('div.margintpless'));

  return {imgUrl, spec, analog, subassembly, couple, usage};
}


function getJikiuTableData(table, expectedLength = 2) {
  const $list = $(table).find('tr');
  const result: string[][] = [];
  $list.each((i, elem) => {
    const $td = $(elem).find('td');
    if ($td.length === expectedLength) {
      result.push($td.map((i, td) => $(td).text()).get());
    }
  });
  return result;
}

function getUsage(usage: Cheerio): string[][] {
  const res = [];
  usage.each((i, e) => {
    const subArr: string[] = [
      ...$(e).find('h5.panel-title').find('.tooltips').text().split('»').map(str => str.trim())
    ];
    $(e).find('table').find('span').each((i, e) => {
      subArr.push($(e).text().replace(/\n/g, '').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim());
    });
    subArr.push($(e).find('td').contents().last().text().trim().replace(/\s+/g, ' '));
    res.push(subArr);
  });

  return res;
}
