const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const stream = require('stream');

// 連線 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 內政部實價登錄當季完整包 URL
const MOI_URL = 'https://plvr.land.moi.gov.tw/DownloadSeason?season=current&type=zip&fileName=lvr_landcsv.zip';

async function runCrawler() {
  console.log("🚀 [Phase 2] 啟動內政部實價登錄全自動爬蟲 (特務強化版)...");

  try {
    console.log("📥 正在從內政部下載最新數據...");
    
    // 💡 強化偽裝：加上完整的瀏覽器語言、來源網站等證明，假裝我們是真人
    const response = await axios.get(MOI_URL, { 
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://plvr.land.moi.gov.tw/DownloadOpenData'
      },
      timeout: 30000
    });
    
    let zip;
    try {
      zip = new AdmZip(response.data);
    } catch (zipError) {
      // 💡 監視器：如果解壓縮失敗，把內政部擋人的網頁內容印出來！
      const errorHtml = response.data.toString('utf8').substring(0, 800);
      console.error("\n❌ 內政部沒有給我們 ZIP 檔！它回傳了這個擋人網頁：\n", errorHtml);
      throw new Error("內政部防火牆阻擋了下載請求");
    }
    
    const zipEntries = zip.getEntries();
    const tainanEntry = zipEntries.find(entry => entry.entryName.toLowerCase() === 'd_lvr_land_a.csv');

    if (!tainanEntry) {
      throw new Error("❌ 找不到台南市的資料檔 (d_lvr_land_a.csv)");
    }

    console.log("⚙️ 找到台南資料，正在解析並清洗數據...");
    const csvData = tainanEntry.getData().toString('utf8');
    
    const bufferStream = new stream.PassThrough();
    bufferStream.end(csvData);

    let parsedData = [];
    
    bufferStream
      .pipe(csv())
      .on('data', (row) => {
        if (row['鄉鎮市區'] && row['鄉鎮市區'] !== 'The villages and towns urban district') {
          parsedData.push({
            address: row['土地位置建物門牌'],
            unit_price_sqm: row['單價元平方公尺'] ? Number(row['單價元平方公尺']) : 0,
            notes: row['備註'] || ''
          });
        }
      })
      .on('end', async () => {
        console.log(`✅ 解析完成，共獲得 ${parsedData.length} 筆資料！`);
        
        if (parsedData.length > 0) {
          console.log("☁️ 正在將資料上傳至 Supabase...");
          const { error } = await supabase
            .from('real_estate_transactions')
            .insert(parsedData); 

          if (error) {
            console.error("❌ Supabase 寫入失敗:", error);
            process.exit(1);
          } else {
            console.log("🎉 [大功告成] 本月實價登錄資料庫更新完畢！");
          }
        }
      });

  } catch (error) {
    console.error("\n💥 爬蟲執行發生錯誤:", error.message);
    // 💡 強制中斷：告訴 GitHub 我們失敗了，讓外面亮起真實的紅燈！
    process.exit(1); 
  }
}

runCrawler();
