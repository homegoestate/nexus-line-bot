const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const stream = require('stream');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MOI_HOME_URL = 'https://plvr.land.moi.gov.tw/DownloadOpenData';
const TARGET_CITIES = { 'a': '台北市', 'f': '新北市', 'h': '桃園市', 'o': '新竹市', 'j': '新竹縣', 'b': '台中市', 'd': '台南市', 'e': '高雄市' };
const TARGET_TYPES = { 'a': '成屋', 'b': '預售屋', 'c': '租賃' };

// 擴大抓取範圍：111年第1季 ~ 113年第1季
const SEASONS = ['111S1', '111S2', '111S3', '111S4', '112S1', '112S2', '112S3', '112S4', '113S1'];

async function fillHistory() {
  console.log(`🚀 [時光機 v3.0] 準備補齊歷史資料...`);

  try {
    const sessionRes = await axios.get(MOI_HOME_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const cookieString = (sessionRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    for (const season of SEASONS) {
      console.log(`\n📅 正在搬運：${season} 的資料...`);
      const url = `https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`;
      
      const res = await axios.get(url, { 
        responseType: 'arraybuffer',
        headers: { 
          'User-Agent': 'Mozilla/5.0',
          'Cookie': cookieString,
          'Referer': MOI_HOME_URL
        },
        timeout: 60000 
      });

      const zip = new AdmZip(res.data);
      const entries = zip.getEntries();

      for (const entry of entries) {
        // 💡 破案關鍵：拿掉 ^ 符號，允許檔案藏在數字資料夾裡面！
        const match = entry.entryName.toLowerCase().match(/([afhojbde])_lvr_land_([abc])\.csv$/);
        
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
                // 分批寫入，避免一次塞太多貨把倉庫門卡住
                for (let i = 0; i < parsedData.length; i += 2000) {
                  const chunk = parsedData.slice(i, i + 2000);
                  const { error } = await supabase.from('real_estate_transactions').insert(chunk);
                  if (error) console.log(`  ❌ [${cityName}] 寫入失敗: ${error.message}`);
                }
                console.log(`  ✅ [${cityName}-${typeName}] 成功匯入 ${parsedData.length} 筆`);
              }
              resolve();
            });
          });
        }
      }
      await new Promise(r => setTimeout(r, 2000)); // 喝口水再抓下一季
    }
    console.log("\n🎉 任務結束！歷史資料已補齊！");
  } catch (err) {
    console.error("💥 執行失敗:", err.message);
  }
}
fillHistory();
