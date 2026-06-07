const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/api', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// 💡 胖數字轉換器 (處理全形數字)
function toFullWidth(str) {
  return str.replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
  const rawText = event.message.text.trim();
  if (rawText.length < 2) return Promise.resolve(null);

  // ==========================================
  // 🚀 引擎 A：【詳細試算】 (含查字典修復版)
  // ==========================================
  if (rawText.startsWith('💰試算')) {
    try {
      const parts = rawText.replace('💰試算 ', '').split('_');
      const keyword = parts[0];
      const targetType = parts[1];
      const targetAgeGroup = parts[2];

      let searchKeyword = keyword;

      // 1. 先查字典
      const { data: dictData } = await supabase.from('community_dictionary').select('address_keyword').ilike('community_name', `%${keyword}%`).limit(1);
      if (dictData && dictData.length > 0) searchKeyword = dictData[0].address_keyword;

      const fullWidthKeyword = toFullWidth(searchKeyword);

      // 2. 去實價登錄資料庫撈買賣數據
      const { data, error } = await supabase.from('real_estate_transactions')
        .select('*')
        .or(`address.ilike.%${searchKeyword}%,notes.ilike.%${searchKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`);

      if (error || !data) throw error;

      let count = 0;
      let totalPrice = 0;

      data.forEach(item => {
        let ageGroup = '年份不詳';
        if (item.transaction_type === '預售屋') ageGroup = '🚀 預售屋 (未來指標)';
        else if (item.building_age !== null) {
          if (item.building_age <= 5) ageGroup = '0-5年 (新成屋)';
          else if (item.building_age <= 10) ageGroup = '5-10年 (新古屋)';
          else if (item.building_age <= 20) ageGroup = '10-20年 (中古屋)';
          else ageGroup = '20年以上 (老屋)';
        }
        if (item.building_type === targetType && ageGroup === targetAgeGroup) {
          count++;
          totalPrice += item.unit_price_sqm;
        }
      });

      if (count === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 查無試算資料' });

      const avgPriceSqm = totalPrice / count;
      const avgPricePing = (avgPriceSqm * 3.30579 / 10000).toFixed(1); 
      const totalEstimated = Math.round(avgPricePing * 35); 
      const loan = Math.round(totalEstimated * 0.8); 
      const downPayment = totalEstimated - loan; 
      const monthlyIncome = (loan / 158).toFixed(1); 

      const isPresale = targetAgeGroup.includes('預售屋');
      const accentColor = isPresale ? "#e74c3c" : "#536DFE"; 

      const detailFlex = {
        type: "flex", altText: `${keyword} 詳細核貸試算`,
        contents: {
          type: "bubble",
          header: { type: "box", layout: "vertical", backgroundColor: "#1c2833", contents: [
              { type: "text", text: "宏國地政 | 易丞地政", color: "#ffffff", weight: "bold", size: "md" },
              { type: "text", text: "社區/路段 鑑價引擎", color: "#f1c40f", size: "xs", margin: "sm" }
            ]
          },
          body: { type: "box", layout: "vertical", contents: [
              { type: "text", text: `📍 查詢標的 (${targetType})`, size: "xs", color: "#888888" },
              { type: "text", text: keyword, size: "xxl", weight: "bold", margin: "sm", wrap: true },
              { type: "text", text: targetAgeGroup, size: "sm", color: accentColor, margin: "xs", weight: "bold" },
              { type: "separator", margin: "lg" },
              { type: "text", text: "📊 官方大數據演算法", size: "sm", weight: "bold", margin: "lg" },
              { type: "box", layout: "horizontal", margin: "md", contents: [
                  { type: "text", text: "有效交易樣本", size: "sm", color: "#555555" },
                  { type: "text", text: `${count} 筆`, size: "sm", weight: "bold", align: "end" }
                ]
              },
              { type: "box", layout: "horizontal", margin: "md", contents: [
                  { type: "text", text: "均價 (排除特例)", size: "sm", color: "#555555" },
                  { type: "text", text: `約 ${avgPricePing} 萬/坪`, size: "sm", color: "#00B900", weight: "bold", align: "end" }
                ]
              },
              { type: "separator", margin: "lg" },
              { type: "text", text: isPresale ? "🏦 預售交屋試算 (以標準35坪計)" : "🏦 專業核貸試算 (以標準35坪計)", size: "sm", weight: "bold", margin: "lg" },
              { type: "box", layout: "horizontal", margin: "md", contents: [
                  { type: "text", text: "預估標的總價", size: "sm", color: "#555555" },
                  { type: "text", text: `${totalEstimated} 萬`, size: "sm", weight: "bold", align: "end" }
                ]
              },
              { type: "box", layout: "horizontal", margin: "md", contents: [
                  { type: "text", text: "銀行可貸 (估8成)", size: "sm", color: "#555555" },
                  { type: "text", text: `${loan} 萬`, size: "sm", color: "#3498db", weight: "bold", align: "end" }
                ]
              },
              { type: "box", layout: "horizontal", margin: "md", contents: [
                  { type: "text", text: "需準備工程/自備款", size: "sm", color: "#555555" },
                  { type: "text", text: `${downPayment} 萬`, size: "sm", color: "#e67e22", weight: "bold", align: "end" }
                ]
              },
              { type: "box", layout: "horizontal", margin: "lg", backgroundColor: "#f4f6f7", cornerRadius: "md", paddingAll: "md", contents: [
                  { type: "text", text: "💡 建議月收入達", size: "sm", color: "#555555" },
                  { type: "text", text: `${monthlyIncome} 萬以上`, size: "sm", weight: "bold", align: "end" }
                ]
              }
            ]
          },
          // 💎 這裡先幫您預留了 VIP 健檢的按鈕位子，等我們串接 Gemini 時就可以直接啟用！
          footer: { type: "box", layout: "vertical", contents: [
              { type: "button", style: "primary", color: "#536DFE", action: { type: "message", label: "條件符合？洽詢專屬方案", text: "我想洽詢房貸專案" } }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, detailFlex);
    } catch (error) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '試算發生錯誤，請稍後再試！' });
    }
  }

  // ==========================================
  // 🏢 引擎 B：【查租屋行情】(全新雙引擎)
  // ==========================================
  if (rawText.startsWith('查租') || rawText.startsWith('租屋')) {
    let keyword = rawText.replace(/^(查租|租屋)/, '').trim();
    let searchKeyword = keyword;

    try {
      const { data: dictData } = await supabase.from('community_dictionary').select('address_keyword').ilike('community_name', `%${keyword}%`).limit(1);
      if (dictData && dictData.length > 0) searchKeyword = dictData[0].address_keyword;
      const fullWidthKeyword = toFullWidth(searchKeyword);

      // 去租屋專屬資料表撈數據
      const { data, error } = await supabase.from('rental_transactions')
        .select('*')
        .or(`address.ilike.%${searchKeyword}%,notes
