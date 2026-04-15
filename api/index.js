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
  
  // 💡 1. 直覺搜尋解析：把使用者可能打的「查價」字眼濾掉，只留關鍵字
  const keyword = rawText.replace(/查價|估價|行情/g, '').trim();

  // 如果字太少 (例如只打一個字)，或者打 ping，就不啟動鑑價
  if (keyword.toLowerCase() === 'ping') return client.replyMessage(event.replyToken, { type: 'text', text: 'pong！大腦運作正常！' });
  if (keyword.length < 2) return Promise.resolve(null); 

  try {
    // 💡 2. 使用 pg_trgm 進行光速模糊搜尋
    const { data, error } = await supabase
      .from('real_estate_transactions')
      .select('*')
      .ilike('address', `%${keyword}%`);

    if (error) throw error;

    if (!data || data.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `⚠️ 查無有效樣本\n在資料庫中找無包含【${keyword}】的標準交易。`
      });
    }

    // 💡 3. 自動分類邏輯 (分裝到不同籃子裡)
    const groupedData = {};

    data.forEach(item => {
      // 判斷屋齡級距
      let ageGroup = '年份不詳';
      if (item.building_age !== null) {
        if (item.building_age <= 5) ageGroup = '0-5年 (新成屋)';
        else if (item.building_age <= 10) ageGroup = '5-10年 (新古屋)';
        else if (item.building_age <= 20) ageGroup = '10-20年 (中古屋)';
        else ageGroup = '20年以上 (老屋)';
      }

      // 組合標籤，例如："住宅大樓 | 0-5年 (新成屋)"
      const tag = `${item.building_type} | ${ageGroup}`;

      if (!groupedData[tag]) {
        groupedData[tag] = { count: 0, totalPrice: 0, items: [] };
      }
      
      groupedData[tag].count += 1;
      // 這裡簡單計算總價用來平均，實務上您可以套用您原本的「排雷演算法」
      groupedData[tag].totalPrice += item.unit_price_sqm; 
      groupedData[tag].items.push(item);
    });

    // 💡 4. 製作 LINE 多頁滑動卡片 (Carousel)
    const bubbles = [];

    // 將分類好的資料，一組做成一張卡片
    for (const [tag, stats] of Object.entries(groupedData)) {
      // 簡單換算：平方公尺單價 -> 萬/坪
      const avgPriceSqm = stats.totalPrice / stats.count;
      const avgPricePing = (avgPriceSqm * 3.30579 / 10000).toFixed(1); 

      bubbles.push({
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: keyword, weight: 'bold', size: 'xl', color: '#111111' },
            { type: 'text', text: tag, size: 'xs', color: '#888888', wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: '有效樣本', size: 'sm', color: '#555555', flex: 2 },
                { type: 'text', text: `${stats.count} 筆`, size: 'sm', color: '#111111', align: 'end', weight: 'bold', flex: 1 }
              ]
            },
            {
              type: 'box', layout: 'horizontal', margin: 'md',
              contents: [
                { type: 'text', text: '平均單價', size: 'sm', color: '#555555', flex: 1 },
                { type: 'text', text: `約 ${avgPricePing} 萬/坪`, size: 'sm', color: '#00B900', align: 'end', weight: 'bold', flex: 2 }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#536DFE',
              action: { type: 'message', label: '詳細試算', text: `試算 ${keyword} ${tag}` }
            }
          ]
        }
      });
    }

    // LINE 限制 Carousel 最多 12 張卡片
    const carouselBubbles = bubbles.slice(0, 12);

    const flexMessage = {
      type: 'flex',
      altText: `【${keyword}】的鑑價分析出爐`,
      contents: {
        type: 'carousel',
        contents: carouselBubbles
      }
    };

    return client.replyMessage(event.replyToken, flexMessage);

  } catch (error) {
    console.error(error);
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統線路繁忙，請稍後再試！' });
  }
}

module.exports = app;
