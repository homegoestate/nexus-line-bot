const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// 🔴 環境變數設定 (請在 Vercel 後台設定)
// ==========================================
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '您的_LINE_ACCESS_TOKEN',
  channelSecret: process.env.CHANNEL_SECRET || '您的_LINE_CHANNEL_SECRET'
};

const supabaseUrl = process.env.SUPABASE_URL || '您的_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_KEY || '您的_SUPABASE_KEY';

const client = new line.Client(config);
const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// ==========================================
// 🧠 核心處理邏輯 (Nexus Data Engine)
// ==========================================
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userText = event.message.text.trim();
  const match = userText.match(/^(?:查價|估價|行情)\s+(.+)$/);
  
  if (match) {
    const addressQuery = match[1].trim(); // 客戶輸入的地址 (例：國安街)
    
    try {
      // 1. 🚀 向 Supabase 資料庫請求真實數據 (使用模糊搜尋)
      const { data, error } = await supabase
        .from('real_estate_transactions')
        .select('address, unit_price_sqm, total_price, notes')
        .ilike('address', `%${addressQuery}%`); // 只要地址包含關鍵字就抓出來

      if (error) throw error;

      // 2. 🧹 數據清洗與排雷演算法
      let validData = [];
      let specialCount = 0;
      let totalSqmPrice = 0;

      if (data && data.length > 0) {
        data.forEach(row => {
          // 過濾掉備註中有親友交易、關係人等特殊行情的垃圾數據
          if (row.notes && (row.notes.includes('親友') || row.notes.includes('關係人') || row.notes.includes('特殊'))) {
            specialCount++;
          } else if (row.unit_price_sqm && row.unit_price_sqm > 0) {
            validData.push(row);
            totalSqmPrice += Number(row.unit_price_sqm);
          }
        });
      }

      // 3. 🏦 若找不到資料的防呆處理 (回傳基本外連卡片)
      if (validData.length === 0) {
        return sendFallbackCard(event.replyToken, addressQuery, data.length, specialCount);
      }

      // 4. 🧮 鑑價與貸款公式計算
      // 算平均單價 (平方公尺)
      const avgSqmPrice = totalSqmPrice / validData.length;
      // 換算成 萬/坪 (1 坪 = 3.305785 平方公尺)
      const avgPingPrice = ((avgSqmPrice * 3.305785) / 10000).toFixed(1); 

      // 模擬一套 35 坪標準房的財務試算
      const assumedPing = 35;
      const estimatedTotalPrice = Math.round(avgPingPrice * assumedPing); // 萬
      const ltv = 0.8; // 預設 8 成
      const estimatedLoan = Math.round(estimatedTotalPrice * ltv);
      const downPayment = estimatedTotalPrice - estimatedLoan;
      
      // 計算所需月收 (假設利率 2.2%，30年期，要求收支比 60%)
      const pmtPerMillion = 0.38; // 貸 100 萬約月繳 3800 元 (0.38萬)
      const estimatedMonthlyPayment = (estimatedLoan / 100) * pmtPerMillion;
      const requiredIncome = (estimatedMonthlyPayment / 0.6).toFixed(1);

      // 5. 🎨 產出高階互動卡片給客戶
      const flexMessage = {
        type: 'flex',
        altText: `【智能鑑價報告】${addressQuery}`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#1E293B", paddingAll: "20px",
            contents: [
              { type: "text", text: "宏國地政 | 易丞地政", color: "#ffffff", weight: "bold", size: "sm" },
              { type: "text", text: "Open Data 鑑價引擎 v3.0", color: "#fACC15", size: "xs", margin: "sm" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: "📍 查詢標的關鍵字", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: addressQuery, weight: "bold", size: "xl", margin: "sm", wrap: true },
              { type: "separator", margin: "lg" },
              
              // 內政部數據區塊
              { type: "text", text: "📊 官方大數據演算 (台南庫)", size: "sm", color: "#0F172A", weight: "bold", margin: "lg" },
              {
                type: "box", layout: "horizontal", margin: "md",
                contents: [
                  { type: "text", text: "有效交易樣本", size: "sm", color: "#64748b" },
                  { type: "text", text: `${validData.length} 筆`, size: "sm", color: "#0F172A", weight: "bold", align: "end" }
                ]
              },
              {
                type: "box", layout: "horizontal", margin: "sm",
                contents: [
                  { type: "text", text: "均價 (排除特例)", size: "sm", color: "#64748b" },
                  { type: "text", text: `約 ${avgPingPrice} 萬/坪`, size: "sm", color: "#059669", weight: "bold", align: "end" }
                ]
              },
              {
                type: "box", layout: "horizontal", margin: "sm",
                contents: [
                  { type: "text", text: "排雷演算", size: "sm", color: "#64748b" },
                  { type: "text", text: `已過濾 ${specialCount} 筆親友特殊交易`, size: "xs", color: "#EF4444", weight: "bold", align: "end" }
                ]
              },
              { type: "separator", margin: "lg" },

              // 銀行授信試算區塊
              { type: "text", text: "🏦 專業核貸試算 (以標準35坪計)", size: "sm", color: "#0F172A", weight: "bold", margin: "lg" },
              {
                type: "box", layout: "horizontal", margin: "md",
                contents: [
                  { type: "text", text: "預估標的總價", size: "sm", color: "#64748b" },
                  { type: "text", text: `${estimatedTotalPrice} 萬`, size: "sm", color: "#0F172A", weight: "bold", align: "end" }
                ]
              },
              {
                type: "box", layout: "horizontal", margin: "sm",
                contents: [
                  { type: "text", text: "銀行可貸 (估8成)", size: "sm", color: "#64748b" },
                  { type: "text", text: `${estimatedLoan} 萬`, size: "sm", color: "#2563EB", weight: "bold", align: "end" }
                ]
              },
              {
                type: "box", layout: "horizontal", margin: "sm",
                contents: [
                  { type: "text", text: "需準備自備款", size: "sm", color: "#64748b" },
                  { type: "text", text: `${downPayment} 萬`, size: "sm", color: "#EA580C", weight: "bold", align: "end" }
                ]
              },
              {
                type: "box", layout: "horizontal", margin: "sm", backgroundColor: "#F1F5F9", paddingAll: "8px", cornerRadius: "8px",
                contents: [
                  { type: "text", text: "💡 建議月收入達", size: "xs", color: "#475569", weight: "bold" },
                  { type: "text", text: `${requiredIncome} 萬以上`, size: "xs", color: "#0F172A", weight: "bold", align: "end" }
                ]
              }
            ]
          },
          footer: {
            type: "box", layout: "vertical", spacing: "sm",
            contents: [
              {
                type: "button", style: "primary", color: "#4F46E5",
                action: { type: "uri", label: "💬 條件符合？洽詢專屬低利專案", uri: "https://line.me/ti/p/您的官方帳號ID" }
              },
              { type: "text", text: "※ 試算結果由您的專屬資料庫即時演算，實際核貸需依銀行審核為準。", size: "xxs", color: "#94a3b8", wrap: true, margin: "md" }
            ]
          }
        }
      };

      return client.replyMessage(event.replyToken, flexMessage);

    } catch (error) {
      console.error("資料庫連線錯誤:", error);
      return client.replyMessage(event.replyToken, { type: 'text', text: '資料庫連線中斷，請聯繫系統管理員。' });
    }
  }

  return Promise.resolve(null);
}

// 查無資料時的備用卡片 (呼叫外部深度連結)
function sendFallbackCard(replyToken, address, totalFound, specialCount) {
  const encodedAddr = encodeURIComponent(address);
  const lejuUrl = `https://www.google.com/search?q=site:leju.com.tw+${encodedAddr}`;
  const url591 = `https://market.591.com.tw/list?keywords=${encodedAddr}`;
  
  let msg = `在我們的本地實價庫中找無【${address}】的有效標準交易。`;
  if (specialCount > 0) msg = `【${address}】近期僅有 ${specialCount} 筆交易，且皆被系統判定為「親友特殊交易」，無法作為銀行鑑價參考。`;

  const fallbackMsg = {
    type: 'flex',
    altText: `查無資料：${address}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: "⚠️ 本地庫查無有效鑑價樣本", weight: "bold", color: "#EA580C" },
          { type: "text", text: msg, size: "sm", color: "#64748b", wrap: true, margin: "md" },
          { type: "separator", margin: "lg" },
          { type: "text", text: "您可以嘗試透過以下外部平台查詢擴充數據：", size: "xs", color: "#94a3b8", margin: "md" },
          {
            type: "button", style: "secondary", margin: "md",
            action: { type: "uri", label: "🔍 樂居 (社區大樓庫)", uri: lejuUrl }
          },
          {
            type: "button", style: "secondary", margin: "sm",
            action: { type: "uri", label: "🔍 591 實價登錄", uri: url591 }
          }
        ]
      }
    }
  };
  return client.replyMessage(replyToken, fallbackMsg);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Nexus Valuation Engine running on port ${port}`);
});

module.exports = app;