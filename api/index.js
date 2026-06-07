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

app.get('/api', (req, res) => {
  res.status(200).send('LINE Bot is running.');
});

app.post('/api', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events || [];
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).send('OK');
  }
});

// 兼容 Vercel 有時候吃到根路徑的情況
app.post('/', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events || [];
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook root error:', err);
    res.status(200).send('OK');
  }
});

function toFullWidth(str) {
  return String(str || '').replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

function normalizeKeyword(text) {
  return String(text || '')
    .replace(/[，,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeKeywordForOr(keyword) {
  return String(keyword || '')
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function getAgeGroup(item) {
  if (item.transaction_type === '預售屋') return '🚀 預售屋 (未來指標)';

  const age = item.building_age;

  if (age === null || age === undefined || age === '') return '年份不詳';

  const numAge = Number(age);

  if (!Number.isFinite(numAge)) return '年份不詳';
  if (numAge <= 5) return '0-5年 (新成屋)';
  if (numAge <= 10) return '5-10年 (新古屋)';
  if (numAge <= 20) return '10-20年 (中古屋)';

  return '20年以上 (老屋)';
}

function isBadSample(item) {
  const notes = String(item.notes || '');
  return notes.includes('親友') ||
    notes.includes('特殊') ||
    notes.includes('急買急賣') ||
    notes.includes('關係人');
}

async function resolveDictionaryKeyword(keyword) {
  const cleanKeyword = normalizeKeyword(keyword);

  if (!cleanKeyword) return '';

  try {
    const { data } = await supabase
      .from('community_dictionary')
      .select('address_keyword')
      .ilike('community_name', `%${cleanKeyword}%`)
      .limit(1);

    if (data && data.length > 0 && data[0].address_keyword) {
      return normalizeKeyword(data[0].address_keyword);
    }
  } catch (error) {
    console.warn('Dictionary lookup skipped:', error.message);
  }

  return cleanKeyword;
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const rawText = normalizeKeyword(event.message.text);

  if (rawText.length < 2) {
    return Promise.resolve(null);
  }

  try {
    if (rawText.startsWith('估價')) {
      return await handleEstimate(event, rawText);
    }

    if (rawText.startsWith('租屋') || rawText.startsWith('租金') || rawText.startsWith('查租')) {
      return await handleRent(event, rawText);
    }

    if (rawText.startsWith('💰試算')) {
      return await handleLoanDetail(event, rawText);
    }

    return Promise.resolve(null);

  } catch (error) {
    console.error('handleEvent error:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '系統查詢暫時忙碌，請稍後再試一次。'
    });
  }
}

async function handleEstimate(event, rawText) {
  const keyword = normalizeKeyword(rawText.replace(/^估價/, ''));

  if (!keyword) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請輸入：估價 路名或社區名\n例如：估價 北門路'
    });
  }

  const searchKeyword = await resolveDictionaryKeyword(keyword);
  const safeKeyword = safeKeywordForOr(searchKeyword);
  const fullWidthKeyword = toFullWidth(safeKeyword);

  const { data, error } = await supabase
    .from('real_estate_transactions')
    .select('city,transaction_type,address,building_type,building_age,unit_price_sqm,unit_price_ping,notes')
    .or(`address.ilike.%${safeKeyword}%,notes.ilike.%${safeKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`)
    .limit(1000);

  if (error) {
    console.error('estimate query error:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '估價查詢發生錯誤，請稍後再試。'
    });
  }

  const rows = (data || [])
    .filter(item => !isBadSample(item))
    .filter(item => toNumber(item.unit_price_sqm) > 0);

  if (rows.length === 0) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `查無「${keyword}」附近足夠買賣行情資料。\n\n你可以改用：\n估價 府前路\n估價 中華東路\n估價 東門路`
    });
  }

  const groupMap = new Map();

  rows.forEach(item => {
    const buildingType = item.building_type || item.transaction_type || '類型不詳';
    const ageGroup = getAgeGroup(item);
    const key = `${buildingType}__${ageGroup}`;

    const unitPricePing = item.unit_price_ping
      ? toNumber(item.unit_price_ping)
      : toNumber(item.unit_price_sqm) * 3.30579;

    if (!Number.isFinite(unitPricePing) || unitPricePing <= 0) return;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        buildingType,
        ageGroup,
        count: 0,
        totalUnitPricePing: 0
      });
    }

    const group = groupMap.get(key);
    group.count += 1;
    group.totalUnitPricePing += unitPricePing;
  });

  const groups = Array.from(groupMap.values())
    .filter(group => group.count >= 2)
    .map(group => ({
      ...group,
      avgUnitPricePing: group.totalUnitPricePing / group.count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (groups.length === 0) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `「${keyword}」有資料，但有效樣本不足，暫不建議直接作為估價依據。`
    });
  }

  const bubbles = groups.map(group => createEstimateBubble(keyword, group));

  return client.replyMessage(event.replyToken, {
    type: 'flex',
    altText: `${keyword} 買賣行情`,
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  });
}

function createEstimateBubble(keyword, group) {
  const avgWanPerPing = group.avgUnitPricePing / 10000;
  const avgText = avgWanPerPing.toFixed(1);

  const isPresale = group.ageGroup.includes('預售屋');
  const color = isPresale ? '#e74c3c' : '#536DFE';

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: keyword,
          weight: 'bold',
          size: 'xl',
          wrap: true
        },
        {
          type: 'text',
          text: `${group.buildingType}｜${group.ageGroup}`,
          size: 'sm',
          color,
          weight: 'bold',
          margin: 'sm',
          wrap: true
        },
        {
          type: 'separator',
          margin: 'lg'
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'lg',
          contents: [
            {
              type: 'text',
              text: '有效樣本',
              size: 'sm',
              color: '#555555'
            },
            {
              type: 'text',
              text: `${group.count} 筆`,
              size: 'sm',
              weight: 'bold',
              align: 'end'
            }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: '平均單價',
              size: 'sm',
              color: '#555555'
            },
            {
              type: 'text',
              text: `約 ${avgText} 萬/坪`,
              size: 'sm',
              color: '#00B900',
              weight: 'bold',
              align: 'end'
            }
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
          color,
          action: {
            type: 'message',
            label: '詳細核貸試算',
            text: `💰試算 ${keyword}_${group.buildingType}_${group.ageGroup}`
          }
        }
      ]
    }
  };
}

async function handleLoanDetail(event, rawText) {
  try {
    const content = rawText.replace(/^💰試算\s*/, '').trim();
    const parts = content.split('_');

    const keyword = parts[0];
    const targetType = parts[1];
    const targetAgeGroup = parts.slice(2).join('_');

    if (!keyword || !targetType || !targetAgeGroup) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '試算格式錯誤，請重新從估價卡片點選「詳細核貸試算」。'
      });
    }

    const searchKeyword = await resolveDictionaryKeyword(keyword);
    const safeKeyword = safeKeywordForOr(searchKeyword);
    const fullWidthKeyword = toFullWidth(safeKeyword);

    const { data, error } = await supabase
      .from('real_estate_transactions')
      .select('city,transaction_type,address,building_type,building_age,unit_price_sqm,unit_price_ping,notes')
      .or(`address.ilike.%${safeKeyword}%,notes.ilike.%${safeKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`)
      .limit(1000);

    if (error) throw error;

    let count = 0;
    let totalUnitPricePing = 0;

    (data || []).forEach(item => {
      if (isBadSample(item)) return;

      const ageGroup = getAgeGroup(item);
      const buildingType = item.building_type || item.transaction_type || '類型不詳';

      const unitPricePing = item.unit_price_ping
        ? toNumber(item.unit_price_ping)
        : toNumber(item.unit_price_sqm) * 3.30579;

      if (buildingType === targetType && ageGroup === targetAgeGroup && unitPricePing > 0) {
        count += 1;
        totalUnitPricePing += unitPricePing;
      }
    });

    if (count === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 查無試算資料'
      });
    }

    const avgPricePingWan = totalUnitPricePing / count / 10000;
    const avgPricePingText = avgPricePingWan.toFixed(1);

    const totalEstimated = Math.round(avgPricePingWan * 35);
    const loan = Math.round(totalEstimated * 0.8);
    const downPayment = totalEstimated - loan;
    const monthlyIncome = (loan / 158).toFixed(1);

    const isPresale = targetAgeGroup.includes('預售屋');
    const accentColor = isPresale ? '#e74c3c' : '#536DFE';

    const detailFlex = {
      type: 'flex',
      altText: `${keyword} 詳細核貸試算`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1c2833',
          contents: [
            {
              type: 'text',
              text: '宏國地政｜易丞地政',
              color: '#ffffff',
              weight: 'bold',
              size: 'md'
            },
            {
              type: 'text',
              text: '不動產成交前評估系統',
              color: '#f1c40f',
              size: 'xs',
              margin: 'sm'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📍 查詢標的 (${targetType})`,
              size: 'xs',
              color: '#888888'
            },
            {
              type: 'text',
              text: keyword,
              size: 'xxl',
              weight: 'bold',
              margin: 'sm',
              wrap: true
            },
            {
              type: 'text',
              text: targetAgeGroup,
              size: 'sm',
              color: accentColor,
              margin: 'xs',
              weight: 'bold',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: '數據可信度',
                  size: 'sm',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: count >= 20 ? 'A級（高度可信）' : count >= 8 ? 'B級（可參考）' : 'C級（樣本偏少）',
                  size: 'sm',
                  color: count >= 20 ? '#00B900' : '#e67e22',
                  weight: 'bold',
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '均價（排除特例）',
                  size: 'sm',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: `約 ${avgPricePingText} 萬/坪`,
                  size: 'sm',
                  color: '#00B900',
                  weight: 'bold',
                  align: 'end'
                }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: '🏦 銀行核貸試算（以標準35坪計）',
              size: 'sm',
              weight: 'bold',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '預估標的總價',
                  size: 'sm',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: `${totalEstimated} 萬`,
                  size: 'sm',
                  weight: 'bold',
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '銀行可貸（估8成）',
                  size: 'sm',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: `${loan} 萬`,
                  size: 'sm',
                  color: '#3498db',
                  weight: 'bold',
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '需準備自備款',
                  size: 'sm',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: `${downPayment} 萬`,
                  size: 'sm',
                  color: '#e67e22',
                  weight: 'bold',
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              backgroundColor: '#f4f6f7',
              cornerRadius: 'md',
              paddingAll: 'md',
              contents: [
                {
                  type: 'text',
                  text: '💡 建議月收入達',
                  size: 'sm',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: `${monthlyIncome} 萬以上`,
                  size: 'sm',
                  color: '#e74c3c',
                  weight: 'bold',
                  align: 'end'
                }
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
              color: accentColor,
              action: {
                type: 'message',
                label: '條件符合？洽詢專屬方案',
                text: '我想洽詢房貸專案'
              }
            }
          ]
        }
      }
    };

    return client.replyMessage(event.replyToken, detailFlex);

  } catch (error) {
    console.error('loan detail error:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '試算發生錯誤，請稍後再試。'
    });
  }
}

async function handleRent(event, rawText) {
  const keyword = normalizeKeyword(rawText.replace(/^(租屋|租金|查租)/, ''));

  if (!keyword) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請輸入：租屋 路名或行政區\n例如：租屋 北門路\n也可以輸入：租金 安南區'
    });
  }

  const searchKeyword = await resolveDictionaryKeyword(keyword);
  const safeKeyword = safeKeywordForOr(searchKeyword);
  const fullWidthKeyword = toFullWidth(safeKeyword);

  const { data, error } = await supabase
    .from('rental_transactions')
    .select('city,transaction_type,address,building_type,total_rent,unit_rent_ping,total_area_sqm,floor_info,notes')
    .or(`address.ilike.%${safeKeyword}%,notes.ilike.%${safeKeyword}%,address.ilike.%${fullWidthKeyword}%,notes.ilike.%${fullWidthKeyword}%`)
    .limit(1000);

  if (error) {
    console.error('rent query error:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '租屋行情查詢發生錯誤，請稍後再試。'
    });
  }

  const rows = (data || [])
    .filter(item => !isBadSample(item))
    .filter(item => toNumber(item.total_rent) > 0)
    .filter(item => toNumber(item.total_rent) < 500000);

  if (rows.length === 0) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `查無「${keyword}」附近足夠租屋行情資料。\n\n你可以改用：\n租屋 東區\n租金 安南區\n租屋 北門路`
    });
  }

  let totalRent = 0;
  let minRent = Infinity;
  let maxRent = 0;

  let totalRentPing = 0;
  let rentPingCount = 0;

  const typeMap = new Map();

  rows.forEach(item => {
    const rent = toNumber(item.total_rent);
    totalRent += rent;
    minRent = Math.min(minRent, rent);
    maxRent = Math.max(maxRent, rent);

    const rentPing = toNumber(item.unit_rent_ping);
    if (rentPing > 0 && rentPing < 10000) {
      totalRentPing += rentPing;
      rentPingCount += 1;
    }

    const type = item.building_type || '類型不詳';

    if (!typeMap.has(type)) {
      typeMap.set(type, 0);
    }

    typeMap.set(type, typeMap.get(type) + 1);
  });

  const avgRent = Math.round(totalRent / rows.length);
  const avgRentPing = rentPingCount > 0 ? Math.round(totalRentPing / rentPingCount) : 0;

  const topTypes = Array.from(typeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type} ${count}筆`)
    .join('、');

  const rentFlex = {
    type: 'flex',
    altText: `${keyword} 租屋行情`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1c2833',
        contents: [
          {
            type: 'text',
            text: '宏國地政｜易丞地政',
            color: '#ffffff',
            weight: 'bold',
            size: 'md'
          },
          {
            type: 'text',
            text: '租屋租金行情查詢',
            color: '#f1c40f',
            size: 'xs',
            margin: 'sm'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `📍 查詢區域 / 路段`,
            size: 'xs',
            color: '#888888'
          },
          {
            type: 'text',
            text: keyword,
            size: 'xxl',
            weight: 'bold',
            margin: 'sm',
            wrap: true
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'lg',
            contents: [
              {
                type: 'text',
                text: '有效樣本',
                size: 'sm',
                color: '#555555'
              },
              {
                type: 'text',
                text: `${rows.length} 筆`,
                size: 'sm',
                weight: 'bold',
                align: 'end'
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: '平均租金',
                size: 'sm',
                color: '#555555'
              },
              {
                type: 'text',
                text: `約 ${avgRent.toLocaleString()} 元/月`,
                size: 'sm',
                color: '#00B900',
                weight: 'bold',
                align: 'end'
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: '每坪租金',
                size: 'sm',
                color: '#555555'
              },
              {
                type: 'text',
                text: avgRentPing > 0 ? `約 ${avgRentPing.toLocaleString()} 元/坪` : '資料不足',
                size: 'sm',
                color: '#00B900',
                weight: 'bold',
                align: 'end'
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: '租金範圍',
                size: 'sm',
                color: '#555555'
              },
              {
                type: 'text',
                text: `${minRent.toLocaleString()}～${maxRent.toLocaleString()} 元`,
                size: 'sm',
                weight: 'bold',
                align: 'end',
                wrap: true
              }
            ]
          },
          {
            type: 'text',
            text: topTypes ? `常見類型：${topTypes}` : '常見類型：資料不足',
            size: 'xs',
            color: '#888888',
            wrap: true,
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            backgroundColor: '#f4f6f7',
            cornerRadius: 'md',
            paddingAll: 'md',
            contents: [
              {
                type: 'text',
                text: '提醒：租金行情會受屋況、家具家電、管理費、車位、樓層與裝潢影響，建議作為初步參考。',
                size: 'xs',
                color: '#555555',
                wrap: true
              }
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
            color: '#00B900',
            action: {
              type: 'message',
              label: '我想諮詢租賃或買賣規劃',
              text: '我想諮詢租賃或買賣規劃'
            }
          }
        ]
      }
    }
  };

  return client.replyMessage(event.replyToken, rentFlex);
}

module.exports = app;
