const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

// 接收 Vercel 環境變數
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const client = new line.Client(config);
const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();

app.post('*', line.middleware(config), (req, res) => {
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
  
  // 💡 修復一：讓「空白鍵」變成可有可無 (查價國安街 / 查價 國安街 皆可)
  const match = userText.match(/^(?:查價|估價|行情)\s*(.+)$/);
  
  if (match) {
    const addressQuery = match[1].trim(); 
    
    try {
      const { data, error } = await supabase
        .from('real_estate_transactions')
        .select(`
          "land sector position building sector house number plate", 
          "the unit price (NTD / square meter)", 
          "total price NTD", 
          "the note"
        `)
        .ilike('"land sector position building sector house number plate"', `%${addressQuery}%`);

      if (error) throw error;

      let validData = [];
      let specialCount = 0;
      let totalSqmPrice = 0;

      if (data && data.length > 0) {
        data.forEach(row => {
          const notes = row['the note'];
          const price = row['the unit price (NTD / square meter)'];
          
          if (notes && (notes.includes('親友') || notes.includes('關係人') || notes.includes('特殊'))) {
            specialCount++;
          } else if (price && price > 0) {
            validData.push(row);
            totalSqmPrice += Number(price);
          }
        });
      }

      if (validData.length === 0) {
        return sendFallbackCard(event.replyToken, addressQuery, data ? data.length : 0, specialCount);
      }

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
              { type: "text", text: "Open Data 鑑價引擎 v3.1", color: "#fACC15", size: "xs", margin: "sm" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: "📍 查詢標的關鍵字", size: "xs", color: "#64748b", weight: "bold" },
              { type: "text", text: addressQuery, weight: "bold", size: "xl", margin: "sm", wrap: true },
              { type: "separator", margin: "lg" },
              
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
                // 💡 修復二：換成絕對合法的純網址，避免 LINE 拒絕發送
                action: { type: "uri", label: "💬 條件符合？洽詢專屬低利專案", uri: "https://line.me/R/" }
              },
              { type: "text", text: "※ 試算結果由專屬資料庫即時演算，實際需依銀行審核為準。", size: "xxs", color: "#94a3b8", wrap: true, margin: "md" }
            ]
          }
        }
      };

      // 💡 修復三：加入終極錯誤捕捉！如果卡片壞了，機器人至少會回傳純文字
      return client.replyMessage(event.replyToken, flexMessage).catch(err => {
        console.error("Flex 卡片格式錯誤:", err);
        return client.replyMessage(event.replyToken, { type: 'text', text: `鑑價完成！\n標的：${addressQuery}\n預估均價：${avgPingPrice} 萬/坪\n\n(註：卡片圖形產生失敗，請聯繫工程師)` });
      });

    } catch (error) {
      console.error("資料庫連線錯誤:", error);
      return client.replyMessage(event.replyToken, { type: 'text', text: '資料庫連線中斷，或該區域無資料。' });
    }
  }

  return Promise.resolve(null);
}

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
  
  return client.replyMessage(replyToken, fallbackMsg).catch(err => {
      return client.replyMessage(replyToken, { type: 'text', text: msg });
  });
}

module.exports = app;