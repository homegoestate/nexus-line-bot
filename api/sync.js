const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const unzipper = require('unzipper');
const { parse } = require('csv-parse/sync');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async function handler(req, res) {
  try {
    console.log("開始同步內政部資料...");
    // 內政部官方免憑證 OpenData 網址 (當期 CSV zip)
    const response = await axios({
      method: 'get',
      url: 'https://plvr.land.moi.gov.tw/DownloadOpenData?type=2&format=csv',
      responseType: 'arraybuffer'
    });

    const directory = await unzipper.Open.buffer(response.data);
    const tainanFile = directory.files.find(file => file.path === 'D_lvr_land_A.csv'); // D為台南

    if (!tainanFile) return res.status(404).send("找不到台南市資料");

    const content = await tainanFile.buffer();
    const records = parse(content, { columns: true, skip_empty_lines: true });
    
    const rowsToInsert = [];
    for (let i = 1; i < records.length; i++) {
      const item = records[i];
      if (item['備註'] && (item['備註'].includes('親友') || item['備註'].includes('特殊'))) continue;
      
      let unitPriceSqm = parseFloat(item['單價元平方公尺']) || 0;
      if (unitPriceSqm === 0) continue;

      let age = null;
      if (item['建築完成年月'] && item['交易年月']) {
        const buildYear = parseInt(item['建築完成年月'].substring(0, 3)) + 1911;
        const transYear = parseInt(item['交易年月'].substring(0, 3)) + 1911;
        age = transYear - buildYear;
      }

      rowsToInsert.push({
        address: item['土地區段位置建物門牌'].replace(/\s+/g, ''),
        notes: item['備註'] || '',
        transaction_type: item['建物型態'],
        building_age: age > 0 ? age : 0,
        building_type: item['建物型態'], // 依照您原本的架構
        unit_price_sqm: unitPriceSqm,
        transaction_date: item['交易年月'],
        total_price: Math.round(parseFloat(item['總價元']) / 10000)
      });
    }

    // 寫入 Supabase (請確認您的 table 有設 unique 避免重複)
    const { error } = await supabase.from('real_estate_transactions').upsert(rowsToInsert, { onConflict: 'address,transaction_date,total_price' });
    if (error) throw error;

    return res.status(200).json({ success: true, count: rowsToInsert.length });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
};
