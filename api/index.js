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

// 💡 【台南指標社區精華大補帖】
// 專門對付「政府沒寫案名」的知名中古屋，以及客戶愛打的簡稱
const communityDictionary = {
  // === 🚀 預售/新建案簡稱還原 (剝除建商) ===
  "清景麟研森": "研森",
  "興富發愛琴海": "愛琴海",
  "潤隆真愛": "真愛",
  "達麗世界巨星": "世界巨星",
  "浩瀚無極": "無極",
  "遠雄藏萃": "藏萃",
  "遠雄北府苑": "北府苑",
  "遠雄新源邸": "新源邸",
  "春福采采": "采采",
  "和通沐東風": "沐東風",
  "三發滙世界": "滙世界",
  "聯上蘋果莊園": "蘋果莊園",
  "聯上康橋": "康橋",

  // === 👑 東區 (豪宅與指標中古屋) ===
  "耘非凡": "林森路一段",
  "席悅": "凱旋路",
  "府都All in One": "長榮路一段",
  "知音悅": "林森路一段",
  "成大林森": "林森路三段",
  "世界帝心": "中華東路三段",
  "世界帝標": "東門路二段",
  "鄉城大鎮": "中華東路二段",
  "文化傳家": "崇明路",
  "巴克禮": "崇明路",

  // === 👑 永康區 (東橋與大橋商圈) ===
  "綠海都心": "東橋",
  "仁發總圖": "東橋",
  "三發橋": "東橋",
  "永康太子廟": "太子路",
  "大橋京城": "大橋二街",
  "世紀之門": "中華路", 
  "真愛": "東橋",
  "良勳夢公園": "東橋",

  // === 👑 北區 (鄭子寮與開元) ===
  "桂田擎天樹": "文成三路",
  "國家新境": "開元路",
  "成大城": "開元路",
  "文海硯": "海安路三段",
  "綠海": "海安路三段",
  "太子文元": "文元路",
  "皇龍帝堡": "和緯路",

  // === 👑 安平/中西區 (五期與星鑽) ===
  "白鷺灣": "安北路",
  "耘翠": "健康路三段",
  "凌波揚": "健康路三段",
  "第五大道": "永華路二段",
  "博悦": "永華路二段",
  "府都Double1": "永華路二段",
  "大樓市政交響曲": "建平八街",
  "星鑽": "府前路二段",

  // === 👑 南科生活圈 (善化/新市) ===
  "桂田磐古": "善化區",
  "植村NY": "新市區",
  "太子WIN": "善化區",
  "LM特區": "善化區蓮潭",
  "陽光大道": "善化區陽光"
};

// 💡 胖數字轉換器
function toFullWidth(str) {
  return str.replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
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

      const fullWidthKeyword = toFullWidth(keyword);

      const { data, error } = await supabase
        .from('real_estate_transactions')
        .select('*')
        .or(`address.ilike.%${keyword}%,notes.ilike.%${keyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`);

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

      if (count === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 查無資料' });

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
                  { type: "text", text: isPresale ? "預估工程/頭期款" : "需準備自備款", size: "sm", color: "#555555" },
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
  // 🌟 功能 B：建案字典轉換 與 胖胖數字引擎
  // ==========================================
  if (!rawText.startsWith('查價') && !rawText.startsWith('估價')) return Promise.resolve(null);
  let keyword = rawText.replace(/^(查價|估價)/, '').trim();
  if (keyword.length < 2) return client.replyMessage(event.replyToken, { type: 'text', text: '請輸入完整的社區或路段名稱！' });

  // 💡 查字典：把過長的名字縮短，或是轉成路段
  let searchKeyword = keyword;
  for (const [key, val] of Object.entries(communityDictionary)) {
    if (keyword.includes(key)) {
      searchKeyword = val;
      break;
    }
  }

  // 💡 胖數字轉換：把 810 變成 ８１０
  const fullWidthKeyword = toFullWidth(searchKeyword);

  try {
    const { data, error } = await supabase
      .from('real_estate_transactions')
      .select('*')
      .or(`address.ilike.%${searchKeyword}%,notes.ilike.%${searchKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`);

    if (error) throw error;
    if (!data || data.length === 0) {
      return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ 查無有效樣本\n在資料庫中找無包含【${keyword}】的標準交易。` });
    }

    const groupedData = {};
    data.forEach(item => {
      let ageGroup = '年份不詳';
      if (item.transaction_type === '預售屋') ageGroup = '🚀 預售屋 (未來指標)';
      else if (item.building_age !== null) {
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
    const sortedEntries = Object.entries(groupedData).sort((a, b) => {
      if (a[0].includes('預售屋')) return -1;
      if (b[0].includes('預售屋')) return 1;
      return 0;
    });

    for (const [tag, stats] of sortedEntries) {
      const avgPriceSqm = stats.totalPrice / stats.count;
      const avgPricePing = (avgPriceSqm * 3.30579 / 10000).toFixed(1); 
      const isPresale = stats.bAge.includes('預售屋');

      bubbles.push({
        type: 'bubble', size: 'micro',
        header: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: keyword, weight: 'bold', size: 'xl', color: '#111111', wrap: true },
            { type: 'text', text: stats.display, size: 'xs', color: isPresale ? '#e74c3c' : '#888888', weight: isPresale ? 'bold' : 'regular', wrap: true }
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
            { type: 'button', style: 'primary', color: isPresale ? '#e74c3c' : '#536DFE', action: { type: 'message', label: '詳細試算', text: `💰試算 ${keyword}_${stats.bType}_${stats.bAge}` } }
          ]
        }
      });
    }

    const carouselBubbles = bubbles.slice(0, 12); 
    return client.replyMessage(event.replyToken, { type: 'flex', altText: `【${keyword}】的鑑價出爐`, contents: { type: 'carousel', contents: carouselBubbles } });

  } catch (error) {
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統線路繁忙，請稍後再試！' });
  }
}

module.exports = app;
