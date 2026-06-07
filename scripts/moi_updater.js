const axios = require('axios');
const https = require('https');
const path = require('path');
const AdmZip = require('adm-zip');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { Readable } = require('stream');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_KEY，請確認 GitHub Secrets 是否設定完成。');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
});

// ✅ 目前政府資料開放平台指向的本期 CSV ZIP 下載路徑
const MOI_URLS = [
    'https://plvr.land.moi.gov.tw/Download?fileName=lvr_landcsv.zip&type=zip',

    // 備援：保留你原本的舊網址，但會先跑上面新版
    'https://plvr.land.moi.gov.tw/DownloadSeason?season=current&type=zip&fileName=lvr_rupload.zip'
];

const axiosClient = axios.create({
    responseType: 'arraybuffer',
    timeout: 180000,
    maxRedirects: 5,
    httpsAgent: new https.Agent({
        keepAlive: false,
        rejectUnauthorized: true
    }),
    validateStatus: status => status >= 200 && status < 400,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/zip,application/octet-stream,*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Connection': 'close',
        'Referer': 'https://plvr.land.moi.gov.tw/DownloadOpenData'
    }
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
    if (error.response) {
        return `HTTP ${error.response.status} ${error.response.statusText || ''}`;
    }

    if (error.code) {
        return `${error.code}: ${error.message}`;
    }

    return error.message || String(error);
}

function isZipBuffer(buffer) {
    if (!buffer || buffer.length < 4) return false;

    // ZIP 檔通常會以 PK 開頭
    return buffer[0] === 0x50 && buffer[1] === 0x4B;
}

function previewBuffer(buffer) {
    if (!buffer || buffer.length === 0) return '[empty response]';

    const textUtf8 = buffer.toString('utf8', 0, Math.min(buffer.length, 800));
    return textUtf8.replace(/\s+/g, ' ').slice(0, 500);
}

async function downloadMOIDataWithRetry(urls, maxRetries = 5) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        for (const url of urls) {
            try {
                console.log(`📥 正在下載內政部資料，第 ${attempt}/${maxRetries} 次嘗試...`);
                console.log(`🌐 下載網址：${url}`);

                const response = await axiosClient.get(url);
                const buffer = Buffer.from(response.data || []);

                const contentType = response.headers['content-type'] || '';
                const contentLength = buffer.length;

                console.log(`📡 HTTP 狀態：${response.status}`);
                console.log(`📄 Content-Type：${contentType}`);
                console.log(`📦 檔案大小：約 ${(contentLength / 1024 / 1024).toFixed(2)} MB`);

                if (!buffer || buffer.length === 0) {
                    throw new Error('下載成功但資料為空');
                }

                if (!isZipBuffer(buffer)) {
                    console.warn('⚠️ 下載內容不是 ZIP，前段內容如下：');
                    console.warn(previewBuffer(buffer));
                    throw new Error('下載內容不是 ZIP 檔，可能抓到 HTML、錯誤頁或轉址頁');
                }

                console.log('✅ ZIP 格式檢查通過');
                return buffer;

            } catch (error) {
                lastError = error;
                console.warn(`⚠️ 本網址下載失敗：${getErrorMessage(error)}`);
            }
        }

        if (attempt < maxRetries) {
            const delaySeconds = attempt * 20;
            console.log(`⏳ 等待 ${delaySeconds} 秒後重試...`);
            await sleep(delaySeconds * 1000);
        }
    }

    throw new Error(`內政部資料下載失敗，已重試 ${maxRetries} 次。最後錯誤：${getErrorMessage(lastError)}`);
}

function findZipEntry(entries, targetFileName) {
    const target = targetFileName.toLowerCase();

    return entries.find(entry => {
        const baseName = path.basename(entry.entryName).toLowerCase();
        return baseName === target;
    });
}

async function insertInChunks(tableName, data, mode = 'insert', options = {}) {
    const chunkSize = 1000;

    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const batchNo = Math.floor(i / chunkSize) + 1;
        const totalBatch = Math.ceil(data.length / chunkSize);

        console.log(`📦 匯入 ${tableName} 第 ${batchNo}/${totalBatch} 批，共 ${chunk.length} 筆...`);

        let result;

        if (mode === 'upsert') {
            result = await supabase.from(tableName).upsert(chunk, options);
        } else {
            result = await supabase.from(tableName).insert(chunk);
        }

        if (result.error) {
            throw new Error(`${tableName} 匯入失敗：${result.error.message}`);
        }
    }
}

async function runUpdater() {
    console.log('🚀 開始執行內政部實價登錄自動更新排程...');

    try {
        console.log('📥 正在下載資料，已啟用新版下載網址、ZIP 檢查與重試機制...');

        const zipBuffer = await downloadMOIDataWithRetry(MOI_URLS, 5);

        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        console.log(`📦 ZIP 內共有 ${entries.length} 個檔案`);

        console.log('🔍 ZIP 前 20 個檔案名稱：');
        entries.slice(0, 20).forEach(entry => {
            console.log(`- ${entry.entryName}`);
        });

        // D = 台南市
        // A = 買賣
        // B = 預售屋
        // C = 租賃
        const rentFile = findZipEntry(entries, 'D_lvr_land_C.csv');
        const buyFile = findZipEntry(entries, 'D_lvr_land_A.csv');

        if (!rentFile) {
            console.warn('⚠️ 找不到台南租賃資料 D_lvr_land_C.csv');
        }

        if (!buyFile) {
            console.warn('⚠️ 找不到台南買賣資料 D_lvr_land_A.csv');
        }

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

            console.log(`🧹 租賃資料清理完成，共 ${cleanRentData.length} 筆`);

            if (cleanRentData.length > 0) {
                await insertInChunks(
                    'rental_transactions',
                    cleanRentData,
                    'upsert',
                    {
                        onConflict: 'address,total_rent,floor_info',
                        ignoreDuplicates: true
                    }
                );

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
                        const transYear = parseInt(row['交易年月日'].substring(0, 3), 10);
                        const buildYear = parseInt(row['建築完成年月'].substring(0, 3), 10);

                        if (!isNaN(transYear) && !isNaN(buildYear)) {
                            age = transYear - buildYear;
                        }
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

            console.log(`🧹 買賣資料清理完成，共 ${cleanBuyData.length} 筆`);

            if (cleanBuyData.length > 0) {
                await insertInChunks(
                    'real_estate_transactions',
                    cleanBuyData,
                    'insert'
                );

                console.log(`✅ 成功匯入 ${cleanBuyData.length} 筆買賣資料！`);
            }
        }

        console.log('🎉 內政部資料同步任務圓滿完成！');

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
        console.error('🛡️ 本次更新失敗，但不會主動清空或破壞既有資料。');
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
                // 內政部 CSV 第二列常是英文欄位或說明列，這裡沿用你原本邏輯略過第一筆資料列
                if (isFirstRow) {
                    isFirstRow = false;
                    return;
                }

                results.push(data);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

runUpdater();
