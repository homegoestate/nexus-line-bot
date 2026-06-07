const axios = require('axios');
const AdmZip = require('adm-zip');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
const { Readable } = require('stream');

// 連接您的 Supabase 金庫
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 內政部實價登錄「本期下載」API 網址
const MOI_URL = 'https://plvr.land.moi.gov.tw/DownloadSeason?season=current&type=zip&fileName=lvr_rupload.zip';

async function runUpdater() {
    console.log('🚀 開始執行內政部實價登錄自動更新排程...');

    try {
        // 1. 下載內政部最新壓縮檔
        console.log('📥 正在從內政部下載最新資料 (這可能需要幾十秒)...');
        const response = await axios.get(MOI_URL, { responseType: 'arraybuffer' });
        const zip = new AdmZip(response.data);
        const entries = zip.getEntries();

        // 2. 挑出台南市 (代碼D) 的【買賣 D_lvr_land_A】與【租賃 D_lvr_land_C】
        const rentFile = entries.find(e => e.entryName === 'D_lvr_land_C.csv');
        const buyFile = entries.find(e => e.entryName === 'D_lvr_land_A.csv');

        // ==========================================
        // 🏠 處理【租屋市場】資料
        // ==========================================
        if (rentFile) {
            console.log('📂 找到台南市【租賃】資料，開始清洗與匯入...');
            const rentData = await parseMOICSV(rentFile.getData());
            const cleanRentData = rentData
                .filter(row => row['土地區段位置建物門牌'] && row['總額元']) // 過濾空資料
                .map(row => {
                    const totalRent = Number(row['總額元']) || 0;
                    const areaSqm = Number(row['建物移轉總面積平方公尺']) || 0;
                    const unitPriceSqm = Number(row['單價元平方公尺']) || (areaSqm > 0 ? Math.round(totalRent / areaSqm) : 0);
                    const unitPricePing = Math.round(unitPriceSqm * 3.30579); // 換算成台坪單價

                    return {
                        city: '台南市',
                        transaction_type: '租賃',
                        address: row['土地區段位置建物門牌'],
                        building_type: row['建物型態'],
                        transaction_date: row['交易年月日'],
                        total_area_sqm: areaSqm,
                        total_rent: totalRent,
                        unit_rent_sqm: unitPriceSqm,
                        unit_rent_ping: unitPricePing,
                        floor_info: row['移轉層次'],
                        notes: row['備註']
                    };
                });

            // 批次寫入 Supabase (使用 upsert 避免重複)
            if (cleanRentData.length > 0) {
                const { error } = await supabase.from('rental_transactions').upsert(cleanRentData, { onConflict: 'address, total_rent, floor_info', ignoreDuplicates: true });
                if (error) console.error('⚠️ 租屋資料寫入警告:', error.message);
                else console.log(`✅ 成功匯入 ${cleanRentData.length} 筆最新租屋資料！`);
            }
        }

        // ==========================================
        // 💰 處理【買賣市場】資料
        // ==========================================
        if (buyFile) {
            console.log('📂 找到台南市【買賣】資料，開始清洗與匯入...');
            const buyData = await parseMOICSV(buyFile.getData());
            const cleanBuyData = buyData
                .filter(row => row['土地區段位置建物門牌'] && row['單價元平方公尺']) // 只抓有單價的交易
                .map(row => {
                    // 簡單計算屋齡 (交易年 - 建築完成年)
                    let age = null;
                    if (row['交易年月日'] && row['建築完成年月']) {
                        const transYear = parseInt(row['交易年月日'].substring(0, 3));
                        const buildYear = parseInt(row['建築完成年月'].substring(0, 3));
                        if (!isNaN(transYear) && !isNaN(buildYear)) age = transYear - buildYear;
                    }

                    return {
                        city: '台南市',
                        transaction_type: '成屋', // A表主要為成屋買賣
                        address: row['土地區段位置建物門牌'],
                        building_type: row['建物型態'],
                        building_age: age,
                        unit_price_sqm: Number(row['單價元平方公尺']) || 0,
                        notes: row['備註']
                    };
                });

            // 批次寫入 Supabase
            if (cleanBuyData.length > 0) {
                // 因為買賣表沒有設 UNIQUE，這裡直接用 insert。若有重複，未來可再優化去重邏輯
                const { error } = await supabase.from('real_estate_transactions').insert(cleanBuyData);
                if (error) console.error('⚠️ 買賣資料寫入警告:', error.message);
                else console.log(`✅ 成功匯入 ${cleanBuyData.length} 筆最新買賣資料！`);
            }
        }

        console.log('🎉 內政部資料同步任務圓滿完成！');

    } catch (error) {
        console.error('❌ 更新發生致命錯誤:', error.message);
        process.exit(1);
    }
}

// 解析內政部特有的 BIG5 編碼 CSV 檔案 (並跳過第二行英文標題)
function parseMOICSV(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        let isFirstRow = true;
        const stream = Readable.from(buffer);
        
        stream.pipe(iconv.decodeStream('big5')) // 內政部檔案是 BIG5 編碼
              .pipe(csv())
              .on('data', (data) => {
                  if (isFirstRow) { 
                      isFirstRow = false; 
                      return; // 內政部 CSV 的第二行是英文欄位名稱，必須跳過
                  }
                  results.push(data);
              })
              .on('end', () => resolve(results))
              .on('error', reject);
    });
}

runUpdater();
