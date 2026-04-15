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

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const rawText = event.message.text.trim();
  if (rawText.length < 2) return Promise.resolve(null); 

  // ==========================================
  // 🌟 功能 A：攔截「詳細試算」按鈕
  // ==========================================
  if (rawText.startsWith('💰試算')) {
    try {
      const parts = rawText.replace('💰試算 ', '').split('_');
      const keyword = parts[0];
      const targetType = parts[1];
      const targetAgeGroup = parts[2];

      const { data, error } = await supabase.from('real_estate_transactions').select('*').ilike('address', `%${keyword}%`);
      if (error || !data) throw error;

      let count = 0;
      let totalPrice = 0;

      data.forEach(item => {
        let ageGroup = '年份不詳';
        if (item.building_age !== null) {
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

      if (count === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 查無資料' });

      const avgPriceSqm = totalPrice / count;
      const avgPricePing = (avgPriceSqm * 3.30579 / 10000).toFixed(1); 
      const totalEstimated = Math.round(avgPricePing * 35); 
      const loan = Math.round(totalEstimated * 0.8); 
      const downPayment = totalEstimated - loan; 
      const monthlyIncome = (loan / 158).toFixed(1); 

      const detailFlex = {
        type: "flex",
        altText: `${keyword} 詳細核貸試算`,
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#1c2833",
            contents: [
              { type: "text", text: "宏國地政 | 易丞地政", color: "#ffffff", weight: "bold", size: "md" },
              { type: "text", text: "Open Data 鑑價引擎 v6.0", color: "#f1c40f", size: "xs", margin: "sm" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `📍 查詢標的 (${targetType})`, size: "xs", color: "#888888" },
              { type: "text", text: keyword, size: "xxl", weight: "bold", margin: "sm" },
              { type: "text", text: targetAgeGroup, size: "sm", color: "#536DFE", margin: "xs", weight: "bold" },
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
              { type: "text", text: "🏦 專業核貸試算 (以標準35坪計)", size: "sm", weight: "bold", margin: "lg" },
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
                  { type: "text", text: "需準備自備款", size: "sm", color: "#555555" },
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
          footer: {
            type: "box", layout: "vertical", contents: [
              { type: "button", style: "primary", color: "#536DFE", action: { type: "message", label: "條件符合？洽詢專屬低利專案", text: "我想洽詢房貸專案" } }
            ]
          }
        }
      };

      return client.replyMessage(event.replyToken, detailFlex);
    } catch (error) {
      console.error(error);
      return client.replyMessage(event.replyToken, { type: 'text', text: '試算發生錯誤，請稍後再試！' });
    }
  }

  // ==========================================
  // 🌟 功能 B：攔截「專人服務」按鈕
  // ==========================================
  if (rawText === '我想洽詢房貸專案') {
    const replyMsg = "您好！感謝您使用宏國地政的智能鑑價系統 🏦\n\n為了提供您最精準的專屬房貸方案，請您留下：\n1. 您的稱呼\n2. 聯絡電話\n3. 欲諮詢的詳細路段或社區名稱\n\n我們的專業貸款顧問將會在上班時間盡快與您聯繫！";
    return client.replyMessage(event.replyToken, { type: 'text', text: replyMsg });
  }

  // ==========================================
  // 🌟 功能 C：加上「查價安全鎖」的一般搜尋
  // ==========================================
  
  // 如果使用者輸入的不是以「查價」或「估價」開頭，機器人直接裝死，讓 LINE 後台接手！
  if (!rawText.startsWith('查價') && !rawText.startsWith('估價')) {
    return Promise.resolve(null);
  }

  // 把「查價」或「估價」這幾個字拔掉，只留下真正的路名 (例如：查價 海安路 -> 變成 海安路)
  const keyword = rawText.replace(/^(查價|估價)/, '').trim();

  if (keyword.length < 2) {
    return client.replyMessage(event.replyToken, { type: 'text', text: '請輸入完整的路段名稱，例如：查價 海安路' });
  }

  try {
    const { data, error } = await supabase.from('real_estate_transactions').select('*').ilike('address', `%${keyword}%`);
    if (error) throw error;
    if (!data || data.length === 0) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ 查無有效樣本\n在資料庫中找無包含【${keyword}】的標準交易。` });
    }

    const groupedData = {};

    data.forEach(item => {
      let ageGroup = '年份不詳';
      if (item.building_age !== null) {
        if (item.building_age <= 5) ageGroup = '0-5年 (新成屋)';
        else if (item.building_age <= 10) ageGroup = '5-10年 (新古屋)';
        else if (item.building_age <= 20) ageGroup = '10-20年 (中古屋)';
        else ageGroup = '20年以上 (老屋)';
      }

      const tag = `${item.building_type}_${ageGroup}`;
      const displayTag = `${item.building_type} | ${ageGroup}`;

      if (!groupedData[tag]) groupedData[tag] = { count: 0, totalPrice: 0, display: displayTag, bType: item.building_type, bAge: ageGroup };
      
      groupedData[tag].count += 1;
      groupedData[tag].totalPrice += item.unit_price_sqm; 
    });

    const bubbles = [];

    for (const [tag, stats] of Object.entries(groupedData)) {
      const avgPriceSqm = stats.totalPrice / stats.count;
      const avgPricePing = (avgPriceSqm * 3.30579 / 10000).toFixed(1); 

      bubbles.push({
        type: 'bubble', size: 'micro',
        header: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: keyword, weight: 'bold', size: 'xl', color: '#111111' },
            { type: 'text', text: stats.display, size: 'xs', color: '#888888', wrap: true }
          ]
        },
        body: { type: 'box', layout: 'vertical', contents: [
            { type: 'box', layout: 'horizontal', contents: [
                { type: 'text', text: '有效樣本', size: 'sm', color: '#555555', flex: 2 },
                { type: 'text', text: `${stats.count} 筆`, size: 'sm', color: '#111111', align: 'end', weight: 'bold', flex: 1 }
              ]
            },
            { type: 'box', layout: 'horizontal', margin: 'md', contents: [
                { type: 'text', text: '平均單價', size: 'sm', color: '#555555', flex: 1 },
                { type: 'text', text: `約 ${avgPricePing} 萬`, size: 'sm', color: '#00B900', align: 'end', weight: 'bold', flex: 2 }
              ]
            }
          ]
        },
        footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'button', style: 'primary', color: '#536DFE', action: { type: 'message', label: '詳細試算', text: `💰試算 ${keyword}_${stats.bType}_${stats.bAge}` } }
          ]
        }
      });
    }

    const carouselBubbles = bubbles.slice(0, 12); 
    return client.replyMessage(event.replyToken, { type: 'flex', altText: `【${keyword}】的鑑價分析出爐`, contents: { type: 'carousel', contents: carouselBubbles } });

  } catch (error) {
    console.error(error);
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統線路繁忙，請稍後再試！' });
  }
}

module.exports = app;
