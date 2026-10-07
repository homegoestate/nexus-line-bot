import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeGuide, routeNativeGuide, ROUTES, PREFIX } from '../lib/native-chat-guide.mjs';
import { routeEvent } from '../lib/flow-router.mjs';
const text = route => JSON.stringify(buildNativeGuide(route));
const keywords = ["13","不動產交易流程","交易流程","交易程序","契稅","完稅","對保","對保帶什麼資料","對保應備文件","對保文件","對保要帶什麼","履約保證","已送件","影片","應備文件","文件","查進度","案件流程","案件進度","產權登記","用印","用印應備文件","登記進度","稅費","簽約","簽約應備文件","簽約文件－自然人","缺件","補件","買房費用","買賣","買賣應備文件","買賣流程","買賣程序","辦理塗銷","送件","進度查詢","過戶","過戶應備文件"];

test('document handoff identifies purpose, recipient, originals and return record without collecting documents', () => {
  for (const route of ['step:2', 'buyer', 'seller']) {
    const copy = text(route);
    for (const expected of ['哪筆案件', '用途', '交給誰', '是否需正本', '用後返還', '安全管道', '交付日期', '文件名稱', '返還紀錄']) assert.ok(copy.includes(expected), route + ': ' + expected);
    assert.doesNotMatch(copy, /上傳文件|請傳身分證照片|請提供買方姓名/);
  }
  assert.ok(text('step:2').includes('由公司提供；移轉核身獨立'));
});

test('tax notice has four concrete checks and paid receipts go to handler before submission confirmation', () => {
  for (const route of ['step:3', 'step:4']) {
    const copy = text(route);
    for (const expected of ['稅單四欄', '①建案／戶別或買賣標的', '②納稅義務人', '③稅費名稱與金額', '④繳納期限及指定方式', '資料不一致，先向承辦']) assert.ok(copy.includes(expected));
  }
  const copy = text('step:4');
  assert.ok(copy.includes('交付收據，請承辦核對收據、文件與付款條件'));
  assert.ok(copy.includes('繳款或點卡不等於已送地政'));
  assert.doesNotMatch(copy, /已完成地政送件|已成功繳稅/);
});

test('escrow checks are conditional, use approved contract details and contain no payment destination', () => {
  const copy = text('step:1');
  for (const expected of ['本案適用履約保證時', '履保公司', '正式專戶名稱與帳號', '各期付款時間及撥款條件', '資料不一致，先向承辦確認']) assert.ok(copy.includes(expected));
  assert.doesNotMatch(copy, /一律.*履保|保證付款安全|https?:\/\/|[0-9]{10,}/);
});

test('registry tracking requires handler confirmation and official receipt, not a card or untrusted event claim', () => {
  const event = { type: 'postback', mode: 'active', source: { type: 'user', userId: 'synthetic-user' }, postback: { data: PREFIX + 'step:5' }, caseStatus: 'submitted', officialReceiptUrl: 'https://untrusted.example/receipt' };
  for (const account of ['@375umdzq', '@528scwxf', '@604gpqef']) {
    const output = routeNativeGuide(event, account);
    assert.deepEqual(output, buildNativeGuide('step:5'));
    const copy = JSON.stringify(output);
    assert.ok(copy.includes('承辦確認已送件後，可依領件單資訊查詢'));
    assert.ok(copy.includes('尚未收到正式受理資料時，先向承辦確認'));
    assert.ok(copy.includes('點卡只索取流程說明'));
    assert.doesNotMatch(copy, /目前案件已送入|以上領件單QR|untrusted|synthetic-user/);
  }
});

test('repayment instructions defer branch verification and do not promise instant lost-stamp changes', () => {
  const copy = text('step:6');
  for (const expected of ['原貸款分行', '清償金額', '塗銷申請', '核身與委託領件', '房貸窗口聯繫方式交承辦', '向該分行確認處理方式', '無舊貸可依個案略過代償']) assert.ok(copy.includes(expected));
  assert.doesNotMatch(copy, /不見可當場變更|所有銀行.*變更|保證.*現場變更/);
});

test('all financial types include signing conditions and keep company delivery separate from personal identification', () => {
  for (const route of ['finance:salary', 'finance:business', 'finance:pension', 'finance:rental']) {
    const copy = text(route);
    for (const expected of ['核貸金額', '利率', '年限', '寬限期', '提前清償違約金', '撥款條件與日期', '先向承辦確認再簽', '公司送件與對保當日核身分開', '依銀行正式通知配合']) assert.ok(copy.includes(expected));
    assert.ok(copy.includes('自報不等於承辦收件確認'));
  }
});

test('all captured legacy keywords still pass through and every new action remains isolated with no copied marketing or links', () => {
  for (const account of ['@375umdzq', '@528scwxf', '@604gpqef']) {
    for (const keyword of keywords) assert.equal(routeEvent({ type: 'message', mode: 'active', source: { type: 'user' }, message: { type: 'text', text: keyword } }, { account }), null, keyword);
  }
  for (const route of ROUTES) {
    const output = buildNativeGuide(route);
    assert.doesNotMatch(JSON.stringify(output), /https?:\/\/|06-2582589|文賢路|預約諮詢|目前案件已送入/);
    const visit = node => { if (!node || typeof node !== 'object') return; if (node.type === 'postback') assert.ok(node.data.startsWith(PREFIX)); for (const child of Object.values(node)) visit(child); };
    visit(output);
  }
});
