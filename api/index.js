const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const client = new line.Client(config);
const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();

app.post('/api/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Webhook Error:", err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userText = event.message.text.trim();
  
  // 💡 升級版語意分析：聽得懂「縣市」和「類型」了！
  const match = userText.match(/^(?:查價|估價|行情)\s*(?:(台北市|新北市|桃園市|新竹市|新竹縣|台中市|台南市|高雄市)\s*)?(?:(成屋|預售屋|租賃)\s*)?(.+)$/);
  
  if (match) {
    const queryCity = match[1]; // 可能沒有輸入
    const queryType = match[2]; // 可能沒有輸入
    const addressQuery = match[3].trim(); 
    
    try {
      // 動態組合資料庫查詢
      let dbQuery = supabase.from('real_estate_transactions').select('*');
      if (queryCity) dbQuery = dbQuery.eq('city', queryCity);
      if (queryType) dbQuery = dbQuery.eq('transaction_type', queryType);
      
      // 💡 解決「台」與「臺」的文字差異問題
      const safeAddress = addressQuery.replace(/台/g, '臺');
      const safeAddress2 = addressQuery.replace(/臺/g, '台');
      dbQuery = dbQuery.or(`address.ilike.%${safeAddress}%,address.ilike.%${safeAddress2}%`);

      const { data, error } = await dbQuery;
      if (error) throw error;

      let validData = [];
      let specialCount = 0;
      let zeroPriceCount = 0;
      let totalSqmPrice = 0;

      if (data && data.length > 0) {
        data.forEach(row => {
          const notes = row['notes'] || '';
          const price = row['unit_price_sqm'];
          
          if (notes.includes('親友') || notes.includes('關係人') || notes.includes('特殊')) {
            specialCount++;
          } else if (!price || price === 0) {
            zeroPriceCount++; // 紀錄這些 0 元廢資料
          } else {
            validData.push(row);
            totalSqmPrice += Number(price);
          }
        });
      }

      if (validData.length === 0) {
        return sendFallbackCard(event.replyToken, addressQuery, data ? data.length : 0, specialCount, zeroPriceCount, queryCity, queryType);
      }

      // 演算法計算
      const avgSqmPrice = totalSqmPrice / validData.length;
      const avgPingPrice = ((avgSqmPrice * 3.305785) / 10000).toFixed(1); 
      const assumedPing = 35;
      const estimatedTotalPrice = Math.round(avgPingPrice * assumedPing); 
      const ltv = 0.8; 
      const estimatedLoan = Math.round(estimatedTotalPrice * ltv);
      const downPayment = estimatedTotalPrice - estimatedLoan;
      const pmtPerMillion = 0.38; 
      const estimatedMonthlyPayment = (estimatedLoan / 100) * pmtPerMillion;
      const requiredIncome = (estimatedMonthlyPayment / 0.6).toFixed(1);

      const cardTitle = `${queryCity || '全國'}${queryType || '成屋'}行情`;

      const flexMessage = {
        type: 'flex',
        altText: `【鑑價報告】${cardTitle} - ${addressQuery}`,
        contents: {
          type: "bubble",
          size: "mega",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#1E293B", paddingAll: "20px",
            contents: [
              { type: "text", text: "宏國地政 | 易丞地政", color: "#ffffff", weight: "bold", size: "sm" },
              { type: "text", text: "Open Data 鑑價引擎 v4.0", color: "#fACC15", size: "xs", margin: "sm" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `📍 查詢標的 (${cardTitle})`, size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: addressQuery, weight: "bold", size: "xl", margin: "sm", wrap: true },
              { type: "separator", margin: "lg" },
              
              { type: "text", text: "📊 官方大數據演算", size: "sm", color: "#0F172A", weight: "bold", margin: "lg" },
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
                  { type: "text", text: `已過濾 ${specialCount+zeroPriceCount} 筆無效/特殊交易`, size: "xs", color: "#EF4444", weight: "bold", align: "end" }
                ]
              },
              { type: "separator", margin: "lg" },

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
                action: { type: "uri", label: "💬 條件符合？洽詢專屬低利專案", uri: "https://line.me/R/" }
              }
            ]
          }
        }
      };

      return client.replyMessage(event.replyToken, flexMessage);

    } catch (error) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '系統大腦升級中，請稍後再試。' });
    }
  }

  return Promise.resolve(null);
}

function sendFallbackCard(replyToken, address, totalFound, specialCount, zeroCount, city, type) {
  const scope = `${city || '全國'}${type || ''}`;
  let msg = `在【${scope}】實價庫中找無【${address}】的標準交易。`;
  
  if (totalFound > 0) {
    msg = `【${address}】有 ${totalFound} 筆紀錄，但其中 ${specialCount} 筆為親友特殊交易，${zeroCount} 筆無單價資料(純土地/車位)，無法鑑價。`;
  }

  const fallbackMsg = {
    type: 'flex',
    altText: `查無資料：${address}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "text", text: "⚠️ 查無有效鑑價樣本", weight: "bold", color: "#EA580C" },
          { type: "text", text: msg, size: "sm", color: "#64748b", wrap: true, margin: "md" }
        ]
      }
    }
  };
  
  return client.replyMessage(replyToken, fallbackMsg);
}

module.exports = app;
