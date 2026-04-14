const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const stream = require('stream');

// 連線 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 內政部實價登錄當季完整包 URL (範例)
const MOI_URL = 'https://plvr.land.moi.gov.tw/DownloadSeason?season=current&type=zip&fileName=lvr_landcsv.zip';

async function runCrawler() {
  console.log("🚀 [Phase 2] 啟動內政部實價登錄全自動爬蟲...");

  try {
    // 1. 下載 ZIP 壓縮檔
    console.log("📥 正在從內政部下載最新數據...");
    const response = await axios.get(MOI_URL, { responseType: 'arraybuffer' });
    const zip = new AdmZip(response.data);
    
    // 2. 尋找台南市的買賣資料 (d_lvr_land_a.csv)
    // 註：A=台北, B=台中, D=台南, E=高雄 (依照內政部代碼)
    const zipEntries = zip.getEntries();
    const tainanEntry = zipEntries.find(entry => entry.entryName.toLowerCase() === 'd_lvr_land_a.csv');

    if (!tainanEntry) {
      throw new Error("❌ 找不到台南市的資料檔 (d_lvr_land_a.csv)");
    }

    // 3. 解壓縮並解析 CSV
    console.log("⚙️ 找到台南資料，正在解析並清洗數據...");
    const csvData = tainanEntry.getData().toString('utf8');
    
    // 這裡需要將純文字轉成 Stream 給 csv-parser 讀取
    const bufferStream = new stream.PassThrough();
    bufferStream.end(csvData);

    let parsedData = [];
    
    bufferStream
      .pipe(csv())
      .on('data', (row) => {
        // 第一列通常是英文標題，若是資料則過濾出有效買賣
        if (row['鄉鎮市區'] && row['鄉鎮市區'] !== 'The villages and towns urban district') {
          // 將中文標題映射為您的資料庫英文欄位
          parsedData.push({
            address: row['土地位置建物門牌'],
            unit_price_sqm: row['單價元平方公尺'] ? Number(row['單價元平方公尺']) : 0,
            notes: row['備註'] || ''
          });
        }
      })
      .on('end', async () => {
        console.log(`✅ 解析完成，共獲得 ${parsedData.length} 筆資料！`);
        
        // 4. 批次匯入 Supabase
        if (parsedData.length > 0) {
          console.log("☁️ 正在將資料上傳至 Supabase...");
          const { error } = await supabase
            .from('real_estate_transactions')
            .insert(parsedData); // 批次寫入

          if (error) {
            console.error("❌ Supabase 寫入失敗:", error);
          } else {
            console.log("🎉 [大功告成] 本月實價登錄資料庫更新完畢！");
          }
        }
      });

  } catch (error) {
    console.error("💥 爬蟲執行發生嚴重錯誤:", error);
  }
}

runCrawler();
