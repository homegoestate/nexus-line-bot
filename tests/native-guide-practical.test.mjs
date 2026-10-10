import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeGuide, routeNativeGuide, ROUTES, PREFIX } from '../lib/native-chat-guide.mjs';
import { routeEvent } from '../lib/flow-router.mjs';
const text = route => JSON.stringify(buildNativeGuide(route));
const keywords = ["13","不動產交易流程","交易流程","交易程序","契稅","完稅","對保","對保帶什麼資料","對保應備文件","對保文件","對保要帶什麼","履約保證","已送件","影片","應備文件","文件","查進度","案件流程","案件進度","產權登記","用印","用印應備文件","登記進度","稅費","簽約","簽約應備文件","簽約文件－自然人","缺件","補件","買房費用","買賣","買賣應備文件","買賣流程","買賣程序","辦理塗銷","送件","進度查詢","過戶","過戶應備文件"];

test('seal preparation tells clients to follow handler notices and delegates certificate checks to company', () => {
  const copy=text('detail:2');
  for(const expected of ['請依承辦通知準備印鑑章與印鑑證明','公司會核對證明日期、用途及用印資料','由承辦協助核對','特殊身分或核身方式','由公司提供；移轉核身及用印'])assert.ok(copy.includes(expected),expected);
  assert.doesNotMatch(copy,/上傳文件|請傳身分證照片|請提供買方姓名|哪筆案件|交付日期|返還紀錄/);
});

test('tax notice has four concrete checks and paid receipts go to handler before submission confirmation', () => {
  for (const route of ['detail:4']) {
    const copy = text(route);
    for (const expected of ['稅單四欄', '①建案／戶別或買賣標的', '②納稅義務人', '③稅費名稱與金額', '④繳納期限及指定方式', '資料不一致，先向承辦']) assert.ok(copy.includes(expected));
  }
  const copy = text('detail:4');
  assert.ok(copy.includes('交付收據，由承辦核對文件與付款條件'));
  assert.ok(copy.includes('繳款或閱讀不等於已送地政'));
  assert.doesNotMatch(copy, /已完成地政送件|已成功繳稅/);
});

test('escrow checks are conditional, use approved contract details and contain no payment destination', () => {
  const copy = text('detail:1');
  for (const expected of ['本案適用履保時', '履保公司', '正式專戶戶名與帳號', '每期付款及撥款條件', '不符先聯繫承辦']) assert.ok(copy.includes(expected));
  assert.doesNotMatch(copy, /一律.*履保|保證付款安全|https?:\/\/|[0-9]{10,}/);
});

test('registry tracking requires handler confirmation and official receipt, not a card or untrusted event claim', () => {
  const event = { type: 'postback', mode: 'active', source: { type: 'user', userId: 'synthetic-user' }, postback: { data: PREFIX + 'detail:5' }, caseStatus: 'submitted', officialReceiptUrl: 'https://untrusted.example/receipt' };
  for (const account of ['@375umdzq', '@528scwxf', '@604gpqef']) {
    const output = routeNativeGuide(event, account);
    assert.deepEqual(output, buildNativeGuide('detail:5'));
    const copy = JSON.stringify(output);
    assert.ok(copy.includes('公司追蹤地政進度並通知雙方'));
    assert.ok(copy.includes('以承辦送件通知及正式受理資料確認'));
    assert.ok(copy.includes('這張卡表示我的案件已送件？'));
    assert.doesNotMatch(copy, /目前案件已送入|以上領件單QR|untrusted|synthetic-user/);
  }
});

test('repayment delegates authorized handling to company and bank while clients receive notices', () => {
  const copy=text('detail:6');
  for(const expected of ['公司與銀行依授權辦理代償','客戶接收進度通知','必要時依承辦通知配合補件或核身','無原貸或不需代償'])assert.ok(copy.includes(expected),expected);
  assert.doesNotMatch(copy,/不見可當場變更|所有銀行.*變更|保證.*現場變更|提供銀行窗口銜接/);
});

test('income branches lead to signing conditions and handler confirmation without worksheet entry',()=>{
  for(const route of ['finance:salary','finance:business','finance:pension','finance:rental','finance:other'])assert.ok(text(route).includes('交付與需求請直接向承辦確認'));
  const copy=text('finance:conditions');for(const expected of ['核貸金額','利率','年限','寬限期','提前清償違約金','撥款條件與日期','先向承辦確認再簽','公司送件與對保當日核身分開','依銀行正式通知配合','貸款不足或延遲仍依契約'])assert.ok(copy.includes(expected),expected);
});

test('all captured legacy keywords still pass through and every new action remains isolated with no copied marketing or links', () => {
  for (const account of ['@375umdzq', '@528scwxf', '@604gpqef']) {
    for (const keyword of keywords) assert.equal(routeEvent({ type: 'message', mode: 'active', source: { type: 'user' }, message: { type: 'text', text: keyword } }, { account }), null, keyword);
  }
  for (const route of ROUTES) {
    const output = buildNativeGuide(route);
    assert.doesNotMatch(JSON.stringify(output), /https?:\/\/|06-2582589|文賢路|目前案件已送入/);
    const visit = node => { if (!node || typeof node !== 'object') return; if (node.type === 'postback') assert.ok(node.data.startsWith(PREFIX)); if(node.type==='message')assert.ok(['簽約文件－自然人','簽約文件－公司法人','新青安','預約諮詢','宏國服務體驗','買賣','簽約','貸款規定','公司簽約','收支比','申請加入 宏國地政 | 易丞地政 VIP社群'].includes(node.text)); for (const child of Object.values(node)) visit(child); };
    visit(output);
  }
});

test('seal-certificate date follows public-contract signing and does not impose a generic expiry or universal requirement',()=>{
  const copy=text('detail:2');for(const expected of ['公契立契日前一年以後','由承辦協助核對','不動產登記','不限定用途','登載於其他欄','特殊身分或核身方式'])assert.ok(copy.includes(expected),expected);assert.doesNotMatch(copy,/申請後一年有效|有效期限一年/);
});
test('payment instructions use case-specific amounts and never permit missed tax deadlines',()=>{
  const copy=text('detail:4');for(const expected of ['於繳稅前通知買方預收款、服務費與貸款差額','不提供通用匯款帳號','銀行作業延遲不表示可以逾稅單期限','提前聯繫承辦'])assert.ok(copy.includes(expected),expected);
});
