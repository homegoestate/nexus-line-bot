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

function toFullWidth(str) {
  if (!str) return '';
  return str.replace(/\s+/g, '').replace(/台/g, '臺').replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
  const rawText = event.message.text.trim();
  if (rawText.length < 2) return Promise.resolve(null); 

  // ==========================================
  // 🌟 功能 A：詳細試算 (加入髒資料動態濾水器)
  // ==========================================
  if (rawText.startsWith('💰試算')) {
    try {
      const parts = rawText.replace('💰試算 ', '').split('_');
      const keyword = parts[0];
      const targetType = parts[1];
      const targetAgeGroup = parts[2];

      let searchKeyword = keyword;
      
      const { data: dictData } = await supabase
        .from('community_dictionary')
        .select('*')
        .or(`community_name.ilike.%${keyword}%,alias_names.ilike.%${keyword}%`)
        .limit(1);

      if (dictData && dictData.length > 0) {
        searchKeyword = dictData[0].address_keyword; 
      }

      const fullWidthKeyword = toFullWidth(searchKeyword);
      const { data, error } = await supabase
        .from('real_estate_transactions')
        .select('*')
        .or(`address.ilike.%${searchKeyword}%,notes.ilike.%${searchKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`);

      if (error || !data) throw error;

      let count = 0;
      let totalPrice = 0;

      data.forEach(item => {
        let bType = item.building_type;
        // 🚨 濾水器：將「其他」或空白強制歸類為「土地」
        if (!bType || bType === '其他' || bType.trim() === '') bType = '土地';

        let ageGroup = '年份不詳';
        if (bType === '土地') ageGroup = '🌲 素地/開發價值';
        else if (item.transaction_type === '預售屋' || bType === '預售屋') ageGroup = '🚀 預售屋 (未來指標)';
        else if (item.building_age !== null) {
          if (item.building_age <= 5) ageGroup = '0-5年 (新成屋)';
          else if (item.building_age <= 10) ageGroup = '5-10年 (新古屋)';
          else if (item.building_age <= 20) ageGroup = '10-20年 (中古屋)';
          else ageGroup = '20年以上 (老屋)';
        }
        
        if (bType === targetType && ageGroup === targetAgeGroup) {
          count++;
          totalPrice += item.unit_price_sqm;
        }
      });

      if (count === 0) return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 查無足夠資料進行試算' });

      const avgPriceSqm = totalPrice / count;
      const avgPricePing = (avgPriceSqm * 3.30579 / 10000).toFixed(1); 
      
      let confidenceLevel = "C級 (趨勢參考)";
      let confidenceColor = "#e67e22"; 
      let consultantNote = "⚠️ 樣本數低於5筆，產品屬性可能混雜。建議提供謄本由易丞地政人工精估，避免核貸落差。";
      
      if (count >= 10) {
        confidenceLevel = "A級 (高度可信)";
        confidenceColor = "#27ae60"; 
        consultantNote = "✅ 樣本充足，此數據可作為出價與銀行核貸之重要參考依據。";
      } else if (count >= 5) {
        confidenceLevel = "B級 (初步行情)";
        confidenceColor = "#3498db"; 
        consultantNote = "💡 具備初步參考價值，實際貸款額度仍需視個人財力與屋況而定。";
      }

      if (targetType === '土地') {
        const detailFlex = {
          type: "flex", altText: `${keyword} 土地開發評估`,
          contents: {
            type: "bubble",
            header: { type: "box", layout: "vertical", backgroundColor: "#1c2833", contents: [
                { type: "text", text: "宏國地政 | 易丞地政", color: "#ffffff", weight: "bold", size: "md" },
                { type: "text", text: "不動產成交前評估系統", color: "#f1c40f", size: "xs", margin: "sm" }
              ]
            },
            body: { type: "box", layout: "vertical", contents: [
                { type: "text", text: `📍 查詢區域/路段 (土地)`, size: "xs", color: "#888888" },
                { type: "text", text: keyword, size: "xl", weight: "bold", margin: "sm", wrap: true },
                { type: "separator", margin: "lg" },
                { type: "box", layout: "horizontal", margin: "md", contents: [
                    { type: "text", text: "有效交易樣本", size: "sm", color: "#555555" },
                    { type: "text", text: `${count} 筆`, size: "sm", weight: "bold", align: "end" }
                  ]
                },
                { type: "box", layout: "horizontal", margin: "md", contents: [
                    { type: "text", text: "土地均價", size: "sm", color: "#555555" },
                    { type: "text", text: `約 ${avgPricePing} 萬/坪`, size: "sm", color: "#00B900", weight: "bold", align: "end" }
                  ]
                },
                { type: "box", layout: "horizontal", margin: "md", contents: [
                    { type: "text", text: "數據可信度", size: "sm", color: "#555555" },
                    { type: "text", text: confidenceLevel, size: "sm", color: confidenceColor, weight: "bold", align: "end" }
                  ]
                },
                { type: "box", layout: "vertical", margin: "lg", backgroundColor: "#f4f6f7", cornerRadius: "md", paddingAll: "md", contents: [
                    { type: "text", text: "💡 顧問提醒：", size: "sm", weight: "bold", color: "#333333" },
                    { type: "text", text: "土地價格受臨路寬度、使用分區、地形與產權完整性影響極大。系統均價僅供初步參考，嚴禁直接套用於開發決策。", size: "xs", color: "#666666", wrap: true, margin: "xs" }
                  ]
                }
              ]
            },
            footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
                { type: "button", style: "primary", color: "#27ae60", action: { type: "message", label: "🗺️ 洽詢土地開發/整合評估", text: "我想洽詢土地開發評估與分區查詢" } },
                { type: "button", style: "secondary", action: { type: "message", label: "📄 委託調閱謄本與地籍圖", text: "我想委託調閱地籍資料" } }
              ]
            }
          }
        };
        return client.replyMessage(event.replyToken, detailFlex);
      }

      const totalEstimated = Math.round(avgPricePing * 35); 
      const loan = Math.round(totalEstimated * 0.8); 
      const downPayment = totalEstimated - loan; 
      const monthlyIncome = (loan / 158).toFixed(1); 
      const isPresale = targetAgeGroup.includes('預售屋');
      const accentColor = isPresale ? "#e74c3c" : "#536DFE"; 

      const detailFlex = {
        type: "flex", altText: `${keyword} 專業核貸試算`,
        contents: {
          type: "bubble",
          header: { type: "box", layout: "vertical", backgroundColor: "#1c2833", contents: [
              { type: "text", text: "宏國地政 | 易丞地政", color: "#ffffff", weight: "bold", size: "md" },
              { type: "text", text: "不動產成交前評估系統", color: "#f1c40f", size: "xs", margin: "sm" }
            ]
          },
          body: { type: "box", layout: "vertical", contents: [
              { type: "text", text: `📍 查詢標的 (${targetType})`, size: "xs", color: "#888888" },
              { type: "text", text: keyword, size: "xl", weight: "bold", margin: "sm", wrap: true },
              { type: "text", text: targetAgeGroup, size: "sm", color: accentColor, margin: "xs", weight: "bold" },
              { type: "box", layout: "horizontal", margin: "lg", contents: [
                  { type: "text", text: "數據可信度", size: "sm", color: "#555555" },
                  { type: "text", text: confidenceLevel, size: "sm", color: confidenceColor, weight: "bold", align: "end" }
                ]
              },
              { type: "box", layout: "horizontal", margin: "md", contents: [
                  { type: "text", text: "均價 (排除特例)", size: "sm", color: "#555555" },
                  { type: "text", text: `約 ${avgPricePing} 萬/坪`, size: "sm", color: "#00B900", weight: "bold", align: "end" }
                ]
              },
              { type: "separator", margin: "lg" },
              { type: "text", text: isPresale ? "🏦 預售交屋試算 (以標準35坪計)" : "🏦 銀行核貸試算 (以標準35坪計)", size: "sm", weight: "bold", margin: "lg" },
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
              { type: "box", layout: "vertical", margin: "lg", backgroundColor: "#f4f6f7", cornerRadius: "md", paddingAll: "md", contents: [
                  { type: "text", text: consultantNote, size: "xs", color: "#555555", wrap: true, margin: "xs" },
                  { type: "separator", margin: "sm" },
                  { type: "box", layout: "horizontal", margin: "sm", contents: [
                      { type: "text", text: "💡 建議月收入達", size: "sm", color: "#333333", weight: "bold" },
                      { type: "text", text: `${monthlyIncome} 萬以上`, size: "sm", color: "#e74c3c", weight: "bold", align: "end" }
                  ]}
                ]
              }
            ]
          },
          footer: { type: "box", layout: "vertical", contents: [
              { type: "button", style: "primary", color: "#536DFE", action: { type: "message", label: "🏦 條件符合？洽詢專屬房貸方案", text: "我想洽詢銀行核貸與產權過戶" } }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, detailFlex);
    } catch (error) {
      return client.replyMessage(event.replyToken, { type: 'text', text: '系統發生錯誤，請稍後再試！' });
    }
  }

  // ==========================================
  // 🌟 功能 B：前台總覽查詢
  // ==========================================
  if (!rawText.startsWith('查價') && !rawText.startsWith('估價') && !rawText.startsWith('查地價')) return Promise.resolve(null);
  let keyword = rawText.replace(/^(查價|估價|查地價)/, '').replace(/\s+/g, '').trim();
  if (keyword.length < 2) return client.replyMessage(event.replyToken, { type: 'text', text: '請輸入完整的社區或路段名稱！' });

  let searchKeyword = keyword;

  try {
    const { data: dictData } = await supabase
      .from('community_dictionary')
      .select('address_keyword')
      .or(`community_name.ilike.%${keyword}%,alias_names.ilike.%${keyword}%`)
      .limit(1);

    if (dictData && dictData.length > 0) {
      searchKeyword = dictData[0].address_keyword; 
    }

    const fullWidthKeyword = toFullWidth(searchKeyword);

    const { data, error } = await supabase
      .from('real_estate_transactions')
      .select('*')
      .or(`address.ilike.%${searchKeyword}%,notes.ilike.%${searchKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`);

    if (error) throw error;
    
    // 捕蚊燈
    if (!data || data.length === 0) {
      await supabase.from('failed_queries').insert([{ keyword: keyword }]);
      return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ 系統提示：本次查詢樣本不足\n在公開資料庫中未匹配到足夠的標準交易。\n\n💡【顧問提醒】若強行計算平均單價，極易產生精準假象與核貸落差。\n\n若您需判斷可售價格、銀行估價或土地開發價值，建議直接提供「謄本」或「權狀」，由宏國地政｜易丞地政為您進行專案精估。` });
    }

    const groupedData = {};
    data.forEach(item => {
      let bType = item.building_type;
      // 🚨 濾水器：將「其他」或空白強制歸類為「土地」
      if (!bType || bType === '其他' || bType.trim() === '') bType = '土地';

      let ageGroup = '年份不詳';
      if (bType === '土地') ageGroup = '🌲 素地/開發價值';
      else if (item.transaction_type === '預售屋' || bType === '預售屋') ageGroup = '🚀 預售屋 (未來指標)';
      else if (item.building_age !== null) {
        if (item.building_age <= 5) ageGroup = '0-5年 (新成屋)';
        else if (item.building_age <= 10) ageGroup = '5-10年 (新古屋)';
        else if (item.building_age <= 20) ageGroup = '10-20年 (中古屋)';
        else ageGroup = '20年以上 (老屋)';
      }

      const tag = `${bType}_${ageGroup}`;
      const displayTag = `${bType} | ${ageGroup}`;
      if (!groupedData[tag]) groupedData[tag] = { count: 0, totalPrice: 0, display: displayTag, bType: bType, bAge: ageGroup };
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
      const isLand = stats.bType === '土地';
      
      let tagColor = isPresale ? '#e74c3c' : (isLand ? '#27ae60' : '#888888');

      bubbles.push({
        type: 'bubble', size: 'micro',
        header: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: keyword, weight: 'bold', size: 'xl', color: '#111111', wrap: true },
            { type: 'text', text: stats.display, size: 'xs', color: tagColor, weight: 'bold', wrap: true }
          ]
        },
        body: { type: 'box', layout: 'vertical', contents: [
            { type: "box", layout: "horizontal", contents: [
                { type: "text", text: "有效樣本", size: "sm", color: "#555555", flex: 2 },
                { type: "text", text: `${stats.count} 筆`, size: "sm", color: stats.count < 5 ? "#e67e22" : "#111111", align: "end", weight: "bold", flex: 1 }
              ]
            },
            { type: "box", layout: "horizontal", margin: "md", contents: [
                { type: "text", text: "平均單價", size: "sm", color: "#555555", flex: 1 },
                { type: "text", text: `約 ${avgPricePing} 萬`, size: "sm", color: "#00B900", align: "end", weight: "bold", flex: 2 }
              ]
            }
          ]
        },
        footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'button', style: 'primary', color: tagColor !== '#888888' ? tagColor : '#536DFE', action: { type: 'message', label: isLand ? '地價開發評估' : '詳細核貸試算', text: `💰試算 ${keyword}_${stats.bType}_${stats.bAge}` } }
          ]
        }
      });
    }

    const carouselBubbles = bubbles.slice(0, 12); 
    return client.replyMessage(event.replyToken, { type: 'flex', altText: `【${keyword}】的成交前評估出爐`, contents: { type: 'carousel', contents: carouselBubbles } });

  } catch (error) {
    return client.replyMessage(event.replyToken, { type: 'text', text: '系統線路繁忙，請稍後再試！' });
  }
}

module.exports = app;
