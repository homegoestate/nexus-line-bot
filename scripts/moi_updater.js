const axios = require('axios');
const AdmZip = require('adm-zip');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const WebSocket = require('ws'); // 🌟 強制掛載通訊天線
const { createClient } = require('@supabase/supabase-js');
const { Readable } = require('stream');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// 🌟 告訴 Supabase 強制使用 ws 套件，徹底解決報錯
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
});

const MOI_URL = 'https://plvr.land.moi.gov.tw/DownloadSeason?season=current&type=zip&fileName=lvr_rupload.zip';

async function runUpdater() {
    console.log('🚀 開始執行內政部實價登錄自動更新排程...');

    try {
        console.log('📥 正在下載資料 (已啟用防封鎖)...');
        const response = await axios.get(MOI_URL, { 
            responseType: 'arraybuffer',
            timeout: 180000, 
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Referer': 'https://plvr.land.moi.gov.tw/'
            }
        });

        const zip = new AdmZip(response.data);
        const entries = zip.getEntries();
        const rentFile = entries.find(e => e.entryName === 'D_lvr_land_C.csv');
        const buyFile = entries.find(e => e.entryName === 'D_lvr_land_A.csv');

        // 🏠 處理【租屋市場】
        if (rentFile) {
            console.log('📂 處理台南【租賃】資料...');
            const rentData = await parseMOICSV(rentFile.getData());
            const cleanRentData = rentData
                .filter(row => row['土地區段位置建物門牌'] && row['總額元']) 
                .map(row => {
                    const totalRent = Number(row['總額元']) || 0;
                    const areaSqm = Number(row['建物移轉總面積平方公尺']) || 0;
                    const unitPriceSqm = Number(row['單價元平方公尺']) || (areaSqm > 0 ? Math.round(totalRent / areaSqm) : 0);
                    return {
                        city: '台南市',
                        transaction_type: '租賃',
                        address: row['土地區段位置建物門牌'],
                        building_type: row['建物型態'],
                        transaction_date: row['交易年月日'],
                        total_area_sqm: areaSqm,
                        total_rent: totalRent,
                        unit_rent_sqm: unitPriceSqm,
                        unit_rent_ping: Math.round(unitPriceSqm * 3.30579),
                        floor_info: row['移轉層次'],
                        notes: row['備註']
                    };
                });
            if (cleanRentData.length > 0) {
                await supabase.from('rental_transactions').upsert(cleanRentData, { onConflict: 'address, total_rent, floor_info', ignoreDuplicates: true });
                console.log(`✅ 成功匯入 ${cleanRentData.length} 筆租屋資料！`);
            }
        }

        // 💰 處理【買賣市場】
        if (buyFile) {
            console.log('📂 處理台南【買賣】資料...');
            const buyData = await parseMOICSV(buyFile.getData());
            const cleanBuyData = buyData
                .filter(row => row['土地區段位置建物門牌'] && row['單價元平方公尺']) 
                .map(row => {
                    let age = null;
                    if (row['交易年月日'] && row['建築完成年月']) {
                        const transYear = parseInt(row['交易年月日'].substring(0, 3));
                        const buildYear = parseInt(row['建築完成年月'].substring(0, 3));
                        if (!isNaN(transYear) && !isNaN(buildYear)) age = transYear - buildYear;
                    }
                    return {
                        city: '台南市',
                        transaction_type: '成屋',
                        address: row['土地區段位置建物門牌'],
                        building_type: row['建物型態'],
                        building_age: age,
                        unit_price_sqm: Number(row['單價元平方公尺']) || 0,
                        notes: row['備註']
                    };
                });
            if (cleanBuyData.length > 0) {
                await supabase.from('real_estate_transactions').insert(cleanBuyData);
                console.log(`✅ 成功匯入 ${cleanBuyData.length} 筆買賣資料！`);
            }
        }
        console.log('🎉 內政部資料同步任務圓滿完成！');
    } catch (error) {
        console.error('❌ 錯誤:', error.message);
        process.exit(1);
    }
}

function parseMOICSV(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        let isFirstRow = true;
        Readable.from(buffer)
            .pipe(iconv.decodeStream('big5'))
            .pipe(csv())
            .on('data', (data) => {
                if (isFirstRow) { isFirstRow = false; return; }
                results.push(data);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

runUpdater();
