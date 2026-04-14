const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const stream = require('stream');

// 連線 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const MOI_DOWNLOAD_URL = 'https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip';
const MOI_HOME_URL = 'https://plvr.land.moi.gov.tw/DownloadOpenData';

// 定義我們要抓取的目標範圍 (8大都會區)
const TARGET_CITIES = {
  'a': '台北市', 'f': '新北市', 'h': '桃園市', 'o': '新竹市',
  'j': '新竹縣', 'b': '台中市', 'd': '台南市', 'e': '高雄市'
};
// 定義我們要的3種交易類型
const TARGET_TYPES = {
  'a': '成屋', 'b': '預售屋', 'c': '租賃'
};

async function runCrawler() {
  console.log("🚀 [Phase 3] 啟動全國實價登錄掃描引擎...");

  try {
    console.log("🔐 第一步：前往首頁按電鈴，取得合法通行證...");
    const sessionRes = await axios.get(MOI_HOME_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const cookieString = (sessionRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    console.log("📥 第二步：下載全國 ZIP 資料包 (這包很大，請稍候)...");
    const response = await axios.get(MOI_DOWNLOAD_URL, { 
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': MOI_HOME_URL,
        'Cookie': cookieString
      },
      timeout: 120000 // 給大檔案 2 分鐘下載時間
    });
    
    let zip;
    try {
      zip = new AdmZip(response.data);
    } catch (zipError) {
      throw new Error("解壓縮失敗，疑似被內政部防火牆阻擋");
    }
    
    const zipEntries = zip.getEntries();
    let totalInserted = 0;

    // 迴圈處理每一個壓縮檔內的檔案
    for (const entry of zipEntries) {
      const fileName = entry.entryName.toLowerCase();
      
      // 用密碼比對檔名 (例如: a_lvr_land_b.csv 代表台北市預售屋)
      const match = fileName.match(/^([afhojbde])_lvr_land_([abc])\.csv$/);
      
      if (match) {
        const cityCode = match[1];
        const typeCode = match[2];
        const cityName = TARGET_CITIES[cityCode];
        const typeName = TARGET_TYPES[typeCode];
        
        console.log(`\n⚙️ 正在處理: [${cityName}] 的 [${typeName}] 資料...`);
        
        const csvData = entry.getData().toString('utf8');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(csvData);

        let parsedData = [];
        
        // 確保一個檔案處理完才換下一個
        await new Promise((resolve, reject) => {
          bufferStream
            .pipe(csv())
            .on('data', (row) => {
              // 過濾掉第一行的英文標題
              if (row['鄉鎮市區'] && row['鄉鎮市區'] !== 'The villages and towns urban district') {
                parsedData.push({
                  city: cityName,                 // 💡 寫入您剛建好的縣市欄位
                  transaction_type: typeName,     // 💡 寫入您剛建好的類型欄位
                  address: row['土地位置建物門牌'] || row['建物門牌'] || '', 
                  unit_price_sqm: row['單價元平方公尺'] ? Number(row['單價元平方公尺']) : 0,
                  notes: row['備註'] || ''
                });
              }
            })
            .on('end', async () => {
              if (parsedData.length > 0) {
                // 將這批資料寫入 Supabase
                const { error } = await supabase
                  .from('real_estate_transactions')
                  .insert(parsedData); 

                if (error) {
                  console.error(`❌ ${cityName} ${typeName} 寫入失敗:`, error.message);
                } else {
                  console.log(`✅ 成功寫入 ${parsedData.length} 筆！`);
                  totalInserted += parsedData.length;
                }
              }
              resolve();
            })
            .on('error', reject);
        });
      }
    }

    console.log(`\n🎉 [全國制霸] 所有目標縣市更新完畢！本次總共新增 ${totalInserted} 筆資料！`);

  } catch (error) {
    console.error("\n💥 爬蟲執行發生錯誤:", error.message);
    process.exit(1); 
  }
}

runCrawler();
