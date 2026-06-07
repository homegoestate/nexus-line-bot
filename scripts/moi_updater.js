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

// ✅ 只保留目前內政部實價登錄 OpenData 本期下載網址
const MOI_URLS = [
    'https://plvr.land.moi.gov.tw/Download?fileName=lvr_landcsv.zip&type=zip'
];

const axiosClient = axios.create({
    responseType: 'arraybuffer',
    timeout: 45000,
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
    return buffer[0] === 0x50 && buffer[1] === 0x4B;
}

function previewBuffer(buffer) {
    if (!buffer || buffer.length === 0) return '[empty response]';
    const textUtf8 = buffer.toString('utf8', 0, Math.min(buffer.length, 800));
    return textUtf8.replace(/\s+/g, ' ').slice(0, 500);
}

function getValue(row, fieldNames) {
    for (const fieldName of fieldNames) {
        if (row[fieldName] !== undefined && row[fieldName] !== null && String(row[fieldName]).trim() !== '') {
            return String(row[fieldName]).trim();
        }
    }

    return '';
}

function toNumber(value) {
    if (value === undefined || value === null) return 0;

    const cleaned = String(value).replace(/,/g, '').trim();
    const number = Number(cleaned);

    return Number.isFinite(number) ? number : 0;
}

function debugCSVRows(label, rows) {
    console.log(`🔎 ${label} CSV 原始筆數：${rows.length}`);

    if (rows.length > 0) {
        console.log(`🔎 ${label} CSV 欄位名稱：`);
        console.log(Object.keys(rows[0]).join(' | '));

        console.log(`🔎 ${label} CSV 第一筆資料預覽：`);
        console.log(JSON.stringify(rows[0], null, 2).slice(0, 1200));
    }
}

async function downloadMOIDataWithRetry(urls, maxRetries = 3) {
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
            const delaySeconds = attempt * 15;
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

async function insertInChunks(tableName, data, options = {}) {
    const chunkSize = 1000;

    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const batchNo = Math.floor(i / chunkSize) + 1;
        const totalBatch = Math.ceil(data.length / chunkSize);

        console.log(`📦 匯入 ${tableName} 第 ${batchNo}/${totalBatch} 批，共 ${chunk.length} 筆...`);

        let result;

        if (options.mode === 'upsert_ignore') {
            result = await supabase
                .from(tableName)
                .upsert(chunk, {
                    onConflict: options.onConflict,
                    ignoreDuplicates: true
                });
        } else {
            result = await supabase
                .from(tableName)
                .insert(chunk);
        }

        if (result.error) {
            throw new Error(`${tableName} 匯入失敗：${result.error.message}`);
        }
    }
}

function detectCSVEncoding(buffer) {
    const utf8Text = buffer.toString('utf8');
    const big5Text = iconv.decode(buffer, 'big5');

    const keywords = [
        '土地位置建物門牌',
        '土地區段位置建物門牌',
        '鄉鎮市區',
        '交易標的',
        '總額元',
        '單價元平方公尺'
    ];

    const hasKeyword = (text) => keywords.some(keyword => text.includes(keyword));
    const badCharCount = (text) => (text.match(/\uFFFD/g) || []).length;

    if (hasKeyword(utf8Text) && badCharCount(utf8Text) < 20) {
        return 'utf8';
    }

    if (hasKeyword(big5Text)) {
        return 'big5';
    }

    return badCharCount(utf8Text) < 20 ? 'utf8' : 'big5';
}

function parseMOICSV(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];

        const encoding = detectCSVEncoding(buffer);
        console.log(`🧾 CSV 編碼判斷：${encoding}`);

        let decodedText;

        if (encoding === 'big5') {
            decodedText = iconv.decode(buffer, 'big5');
        } else {
            decodedText = buffer.toString('utf8');
        }

        decodedText = decodedText.replace(/^\uFEFF/, '');

        let isFirstRow = true;

        Readable.from([decodedText])
            .pipe(csv({
                mapHeaders: ({ header }) => {
                    return String(header || '')
                        .replace(/^\uFEFF/, '')
                        .trim();
                }
            }))
            .on('data', (data) => {
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

async function runUpdater() {
    console.log('🚀 開始執行內政部實價登錄自動更新排程...');

    try {
        const zipBuffer = await downloadMOIDataWithRetry(MOI_URLS, 3);

        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        console.log(`📦 ZIP 內共有 ${entries.length} 個檔案`);

        console.log('🔍 ZIP 前 20 個檔案名稱：');
        entries.slice(0, 20).forEach(entry => {
            console.log(`- ${entry.entryName}`);
        });

        const rentFile = findZipEntry(entries, 'D_lvr_land_C.csv');
        const buyFile = findZipEntry(entries, 'D_lvr_land_A.csv');

        if (!rentFile) {
            console.warn('⚠️ 找不到台南租賃資料 D_lvr_land_C.csv');
        }

        if (!buyFile) {
            console.warn('⚠️ 找不到台南買賣資料 D_lvr_land_A.csv');
        }

        if (rentFile) {
            console.log('📂 處理台南【租賃】資料...');

            const rentData = await parseMOICSV(rentFile.getData());
            debugCSVRows('台南租賃', rentData);

            const cleanRentData = rentData
                .filter(row => {
                    const address = getValue(row, [
                        '土地區段位置建物門牌',
                        '土地位置建物門牌'
                    ]);

                    const totalRent = toNumber(getValue(row, [
                        '總額元',
                        '租金總額元'
                    ]));

                    return address && totalRent > 0;
                })
                .map(row => {
                    const totalRent = toNumber(getValue(row, [
                        '總額元',
                        '租金總額元'
                    ]));

                    const areaSqm = toNumber(getValue(row, [
                        '建物移轉總面積平方公尺',
                        '建物租賃總面積平方公尺',
                        '租賃總面積平方公尺'
                    ]));

                    const unitPriceSqmFromCSV = toNumber(getValue(row, [
                        '單價元平方公尺',
                        '單價元/平方公尺'
                    ]));

                    const unitPriceSqm = unitPriceSqmFromCSV || (areaSqm > 0 ? Math.round(totalRent / areaSqm) : 0);

                    return {
                        city: '台南市',
                        transaction_type: '租賃',
                        address: getValue(row, [
                            '土地區段位置建物門牌',
                            '土地位置建物門牌'
                        ]),
                        building_type: getValue(row, ['建物型態']),
                        transaction_date: getValue(row, ['交易年月日']),
                        total_area_sqm: areaSqm,
                        total_rent: totalRent,
                        unit_rent_sqm: unitPriceSqm,
                        unit_rent_ping: Math.round(unitPriceSqm * 3.30579),
                        floor_info: getValue(row, ['移轉層次', '租賃層次']),
                        notes: getValue(row, ['備註'])
                    };
                });

            console.log(`🧹 租賃資料清理完成，共 ${cleanRentData.length} 筆`);

            if (rentData.length > 0 && cleanRentData.length === 0) {
                throw new Error('台南租賃 CSV 有原始資料，但清理後為 0 筆，請檢查欄位名稱是否又異動。');
            }

            if (cleanRentData.length > 0) {
                await insertInChunks('rental_transactions', cleanRentData, {
                    mode: 'upsert_ignore',
                    onConflict: 'address,total_rent,floor_info'
                });

                console.log(`✅ 成功匯入或略過重複租屋資料，共處理 ${cleanRentData.length} 筆！`);
            } else {
                console.warn('⚠️ 台南本期租賃資料為 0 筆，未匯入 rental_transactions。');
            }
        }

        if (buyFile) {
            console.log('📂 處理台南【買賣】資料...');

            const buyData = await parseMOICSV(buyFile.getData());
            debugCSVRows('台南買賣', buyData);

            const cleanBuyData = buyData
                .filter(row => {
                    const address = getValue(row, [
                        '土地區段位置建物門牌',
                        '土地位置建物門牌'
                    ]);

                    const unitPriceSqm = toNumber(getValue(row, [
                        '單價元平方公尺',
                        '單價元/平方公尺'
                    ]));

                    return address && unitPriceSqm > 0;
                })
                .map(row => {
                    let age = null;

                    const transactionDate = getValue(row, ['交易年月日']);
                    const buildDate = getValue(row, ['建築完成年月']);

                    if (transactionDate && buildDate) {
                        const transYear = parseInt(transactionDate.substring(0, 3), 10);
                        const buildYear = parseInt(buildDate.substring(0, 3), 10);

                        if (!isNaN(transYear) && !isNaN(buildYear)) {
                            age = transYear - buildYear;
                        }
                    }

                    return {
                        city: '台南市',
                        transaction_type: '成屋',
                        address: getValue(row, [
                            '土地區段位置建物門牌',
                            '土地位置建物門牌'
                        ]),
                        building_type: getValue(row, ['建物型態']),
                        building_age: age,
                        unit_price_sqm: toNumber(getValue(row, [
                            '單價元平方公尺',
                            '單價元/平方公尺'
                        ])),
                        notes: getValue(row, ['備註'])
                    };
                });

            console.log(`🧹 買賣資料清理完成，共 ${cleanBuyData.length} 筆`);

            if (buyData.length > 0 && cleanBuyData.length === 0) {
                throw new Error('台南買賣 CSV 有原始資料，但清理後為 0 筆，請檢查欄位名稱是否又異動。');
            }

            if (cleanBuyData.length > 0) {
                await insertInChunks('real_estate_transactions', cleanBuyData);
                console.log(`✅ 成功匯入 ${cleanBuyData.length} 筆買賣資料！`);
            } else {
                console.warn('⚠️ 台南本期買賣資料為 0 筆，未匯入 real_estate_transactions。');
            }
        }

        console.log('🎉 內政部資料同步任務圓滿完成！');

    } catch (error) {
        console.error('❌ 錯誤:', error.message);
        console.error('🛡️ 本次更新失敗，但不會主動清空或破壞既有資料。');
        process.exit(1);
    }
}

runUpdater();
