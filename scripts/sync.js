const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const csv = require('csv-parser');
const AdmZip = require('adm-zip');
const stream = require('stream');

// 連線 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 內政部實價登錄 URL (改用專屬 OpenData 最新期下載端點)
const MOI_DOWNLOAD_URL = 'https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip';
const MOI_HOME_URL = 'https://plvr.land.moi.gov.tw/DownloadOpenData';

async function runCrawler() {
  console.log("🚀 [Phase 2] 啟動內政部實價登錄全自動爬蟲 (突破 Session 防火牆版)...");

  try {
    console.log("🔐 第一步：前往首頁按電鈴，取得合法通行證 (Session Cookie)...");
    
    // 1. 先去首頁拿 Cookie
    const sessionRes = await axios.get(MOI_HOME_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    // 擷取回傳的 Cookie
    const cookies = sessionRes.headers['set-cookie'] || [];
    const cookieString = cookies.map(c => c.split(';')[0]).join('; ');
    console.log("✅ 成功取得通行證:", cookieString ? "有拿到Cookie" : "無Cookie");

    console.log("📥 第二步：帶著通行證，正式請求下載 ZIP 檔案...");
    // 2. 帶著 Cookie 去下載檔案
    const response = await axios.get(MOI_DOWNLOAD_URL, { 
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': MOI_HOME_URL,
        'Cookie': cookieString
      },
      timeout: 60000 // 延長到 60 秒，給大檔案一點時間
    });
    
    let zip;
    try {
      zip = new AdmZip(response.data);
    } catch (zipError) {
      const errorHtml = response.data.toString('utf8').substring(0, 800);
      console.error("\n❌ 內政部還是沒有給 ZIP！回傳內容：\n", errorHtml);
      throw new Error("解壓縮失敗，疑似被防火牆阻擋");
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
    process.exit(1); 
  }
}

runCrawler();
