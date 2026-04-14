const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const stream = require('stream');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const TARGET_CITIES = { 'a': '台北市', 'f': '新北市', 'h': '桃園市', 'o': '新竹市', 'j': '新竹縣', 'b': '台中市', 'd': '台南市', 'e': '高雄市' };
const TARGET_TYPES = { 'a': '成屋', 'b': '預售屋', 'c': '租賃' };

// 💡 設定您想回溯的時間範圍 (例如：108年第1季 到 113年第1季)
const SEASONS = [
  '108S1', '108S2', '108S3', '108S4',
  '109S1', '109S2', '109S3', '109S4',
  '110S1', '110S2', '110S3', '110S4',
  '111S1', '111S2', '111S3', '111S4',
  '112S1', '112S2', '112S3', '112S4',
  '113S1'
];

async function fillHistory() {
  console.log(`🚀 啟動「時光機」模式，準備補齊 ${SEASONS.length} 個季度的歷史資料...`);

  for (const season of SEASONS) {
    console.log(`\n📅 正在處理：${season} ...`);
    
    const url = `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;
    
    try {
      const res = await axios.get(url, { 
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 60000 
      });

      const zip = new AdmZip(res.data);
      const entries = zip.getEntries();

      for (const entry of entries) {
        const match = entry.entryName.toLowerCase().match(/^([afhojbde])_lvr_land_([abc])\.csv$/);
        if (match) {
          const cityName = TARGET_CITIES[match[1]];
          const typeName = TARGET_TYPES[match[2]];
          const csvData = entry.getData().toString('utf8');
          
          let parsedData = [];
          const bufferStream = new stream.PassThrough();
          bufferStream.end(csvData);

          await new Promise((resolve) => {
            bufferStream.pipe(csv()).on('data', (row) => {
              if (row['鄉鎮市區'] && row['鄉鎮市區'] !== 'The villages and towns urban district') {
                parsedData.push({
                  city: cityName,
                  transaction_type: typeName,
                  address: row['土地位置建物門牌'] || row['建物門牌'] || '',
                  unit_price_sqm: row['單價元平方公尺'] ? Number(row['單價元平方公尺']) : 0,
                  notes: row['備註'] || ''
                });
              }
            }).on('end', async () => {
              if (parsedData.length > 0) {
                // 分批寫入，避免一次太多塞車
                for (let i = 0; i < parsedData.length; i += 1000) {
                  const chunk = parsedData.slice(i, i + 1000);
                  await supabase.from('real_estate_transactions').insert(chunk);
                }
                console.log(`  ✅ [${cityName}-${typeName}] 匯入完成`);
              }
              resolve();
            });
          });
        }
      }
    } catch (err) {
      console.error(`  ❌ ${season} 下載或匯入失敗: ${err.message}`);
    }
    // 💡 休息一下，避免被內政部當成攻擊
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log("\n🎉 時光機任務結束！歷史資料已全部補齊！");
}

fillHistory();
