import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFIX, ROUTES, TEXT_ACTIONS, LEGACY_TEXT_ACTIONS, LEGACY_PREFIX, PROCESS_SOURCE_STATUS, PROCESS_SOURCE, PROCESS_STEP_TITLES, buildNativeGuide, routeNativeGuide } from '../lib/native-chat-guide.mjs';
import { routeEvent } from '../lib/flow-router.mjs';
import dispatch from '../lib/pilot-dispatch.js';
import config from '../lib/native-guide-config.js';
import accounts from '../lib/service-accounts.js';
const event = { type: 'message', mode: 'active', source: { type: 'user', userId: 'synthetic-user' }, replyToken: 'synthetic-reply', message: { type: 'text', text: '測試服務導覽' } };
function walk(value, fn) { if (!value || typeof value !== 'object') return; fn(value); for (const child of Object.values(value)) walk(child, fn); }
function actions(value) { const out = []; walk(value, node => { if (node.type === 'postback' || node.type === 'message' || node.type === 'uri') out.push(node); }); return out; }
test('new trigger and every text alternative stay in a separate exact namespace', t => {
  const flag=config.NATIVE_PUBLIC_FLAGS['604gpqef'],old=process.env[flag];process.env[flag]='true';t.after(()=>{if(old===undefined)delete process.env[flag];else process.env[flag]=old;});
  for (const [text, route] of Object.entries(TEXT_ACTIONS)) {
    assert.ok(text.length <= 32);
    assert.deepEqual(routeEvent({ ...event, message: { type: 'text', text } }), buildNativeGuide(route));
  }
  for (const text of ['測試服務導覽 ', '測試導覽：unknown', '貸款', '買賣流程 ', '买方備件', '估價', '租金', '💰試算']) assert.equal(routeEvent({ ...event, message: { type: 'text', text } }), null);
});
test('every native route is reachable and offers functional back or overview', () => {
  const reached = new Set(['home']);
  const queue = ['home'];
  while (queue.length) {
    const route = queue.shift();
    const output = buildNativeGuide(route);
    for (const a of actions(output)) {
      if(a.type==='message'){assert.ok(['查看買方交屋清單','查看賣方交屋清單'].includes(a.text));continue;}
      assert.equal(a.type, 'postback');
      assert.ok(a.data.startsWith(PREFIX));
      const next = a.data.slice(PREFIX.length);
      assert.ok(ROUTES.includes(next));
      if (!reached.has(next)) { reached.add(next); queue.push(next); }
    }
    if (route !== 'home') assert.ok(actions(output).some(a => a.data === PREFIX + 'home'));
  }
  assert.deepEqual([...reached].sort(), [...ROUTES].sort());
  for (let n = 1; n <= 8; n++) {
    const output = buildNativeGuide('step:' + n);
    assert.ok(actions(output).some(a => a.data === PREFIX + 'detail:' + n));
    assert.ok(actions(output).some(a => a.data === PREFIX + (n === 1 ? 'process' : 'step:' + (n - 1))));
  }
});
test('all output is native Flex with bounded texts, buttons, postbacks and generic alternatives', () => {
  for (const route of ROUTES) {
    const output = buildNativeGuide(route), msg = output.messages[0];
    assert.equal(output.messages.length, 1);
    assert.equal(msg.type, 'flex');
    assert.ok(msg.altText.length <= 400);
    assert.equal(msg.altText, buildNativeGuide('home').messages[0].altText);
    const cards = msg.contents.type === 'carousel' ? msg.contents.contents : [msg.contents];
    assert.ok(cards.length <= 12);
    for (const card of cards) {
      assert.ok(Buffer.byteLength(JSON.stringify(card)) < 30000);
      assert.ok(card.footer.contents.length <= 3);
    }
    assert.ok(Buffer.byteLength(JSON.stringify(msg)) < 50000);
    assert.ok((msg.quickReply?.items.length || 0) <= 13);
    walk(msg, node => {
      if (node.type === 'text') assert.ok(typeof node.text === 'string' && node.text.length > 0 && node.text.length <= 2000);
      if (node.type === 'postback') { assert.ok(node.label.length <= 20); assert.ok(node.data.length <= 80); }
      assert.notEqual(node.type, 'uri'); assert.notEqual(node.type, 'video'); assert.notEqual(node.type, 'image');
    });
    assert.doesNotMatch(JSON.stringify(msg), /https?:\/\/|synthetic-user|synthetic-reply/);
  }
});
test('private active context and trusted account are required; event claims do not override caller', () => {
  for (const account of ['@604gpqef', '@528scwxf', '@375umdzq']) assert.deepEqual(routeNativeGuide({ ...event, account: 'attacker' }, account), buildNativeGuide('home'));
  for (const account of ['604gpqef', '@unknown', undefined, null, {}]) assert.equal(routeNativeGuide(event, account), null);
  for (const type of ['group', 'room', undefined]) assert.equal(routeNativeGuide({ ...event, source: { type } }, '@604gpqef'), null);
  for (const mode of ['standby', undefined, null]) assert.equal(routeNativeGuide({ ...event, mode }, '@604gpqef'), null);
});
test('reserved malformed postbacks recover without echoing unsafe input', () => {
  for (const data of [PREFIX + 'step:0', PREFIX + 'step:9', PREFIX + 'step:01', PREFIX + '../buyer', PREFIX + 'secret-user-id', PREFIX + 'home?account=375umdzq', PREFIX + 'x'.repeat(100)]) {
    const result = routeEvent({ ...event, type: 'postback', postback: { data } });
    assert.equal(result.route, 'native:invalid');
    assert.doesNotMatch(JSON.stringify(result), /secret-user-id|\.\.\/buyer|home\?account/);
  }
  assert.equal(routeEvent({ ...event, type: 'postback', postback: { data: 'other:home' } }), null);
});
test('old cards, replay, rapid taps and different users yield fresh deterministic snapshots without state or receipt claims', async () => {
  const input = { ...event, type: 'postback', webhookEventId: 'synthetic-event', deliveryContext: { isRedelivery: true }, postback: { data: PREFIX + 'step:5', caseId: 'untrusted-case', checked: true } };
  const expected = buildNativeGuide('step:5');
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => Promise.resolve(routeEvent({ ...input, source: { type: 'user', userId: 'user-' + i } }))));
  for (const result of results) { assert.deepEqual(result, expected); assert.doesNotMatch(JSON.stringify(result), /untrusted-case|synthetic-event|user-\d/); }
  results[0].messages[0].altText = 'mutated';
  assert.deepEqual(routeEvent(input), expected);
  assert.ok(JSON.stringify(expected).includes('3–5'));
});
test('confirmed source and separate role/financial content stay explicit', () => {
  assert.equal(PROCESS_SOURCE_STATUS, 'owner-confirmed-eight-stages-amended-20261008');
  assert.deepEqual(PROCESS_SOURCE, { libraryFileId: 'libfile_a8ce364601148191b533464f098b1ad7', version: 1, confirmedOn: '2026-10-07', amendment: 'owner-instructions-and-official-research-20261008' });
  const process = JSON.stringify(buildNativeGuide('process'));
  assert.doesNotMatch(process, /原圖.*待核對|閱讀草稿/);
  assert.equal(buildNativeGuide('process').messages[0].contents.contents.length, 8);
  assert.ok(JSON.stringify(buildNativeGuide('buyer')).includes('由公司提供'));
  assert.ok(JSON.stringify(buildNativeGuide('buyer')).includes('移轉核身'));
  assert.ok(JSON.stringify(buildNativeGuide('seller')).includes('不混入買方財力清單'));
  for (const route of ['finance:salary', 'finance:business', 'finance:pension', 'finance:rental']) {
    const s = JSON.stringify(buildNativeGuide(route));
    assert.ok(s.includes('期間、文件格式與組合依承貸銀行通知'));
    assert.ok(s.includes('自報不等於承辦收件確認'));
    assert.doesNotMatch(s, /近6|近六|一律六|必須提供配偶/);
  }
});
test('original eight names match the owner-confirmed source and navigation stays aligned', () => {
  const expected = ['簽約', '備證用印', '申報稅費與貸款', '完稅', '過戶', '代償', '塗銷', '交屋結案'];
  assert.deepEqual(PROCESS_STEP_TITLES, expected);
  const overview = buildNativeGuide('process').messages[0].contents.contents;
  for (let i = 0; i < expected.length; i++) {
    const title = String(i + 1).padStart(2, '0') + ' ' + expected[i];
    assert.equal(overview[i].body.contents[1].text, title);
    const detail = buildNativeGuide('step:' + (i + 1));
    assert.equal(detail.messages[0].contents.body.contents[1].text, title);
    const next = actions(detail).find(a => a.data === PREFIX + (i === 7 ? 'closing' : 'step:' + (i + 2)));
    assert.ok(next);
    assert.equal(next.label, i === 7 ? '查看交屋注意事項' : '下一步：' + expected[i + 1]);
  }
  assert.ok(JSON.stringify(buildNativeGuide('detail:3')).includes('土地增值稅與契稅申報'));
  assert.ok(JSON.stringify(buildNativeGuide('detail:4')).includes('稅單期限'));
});
test('every step gives distinct buyer and seller tasks without reporting actual completion', () => {
  for (let n = 1; n <= 8; n++) {
    const detail = buildNativeGuide('step:' + n), copy = [];
    walk(detail, node => { if (node.type === 'text') copy.push(node.text); });
    const buyer = copy.find(x => x.startsWith('買方｜'));
    const seller = copy.find(x => x.startsWith('賣方｜'));
    assert.ok(buyer?.length > 10);
    assert.ok(seller?.length > 10);
    assert.notEqual(buyer.slice(3), seller.slice(3));
    assert.ok(copy.includes('流程說明不代表案件已送件或辦結；以本案契約、銀行及承辦通知為準。'));
    assert.doesNotMatch(JSON.stringify(detail), /你已完成|您已完成|已成功登錄|已成功過戶|https?:\/\//);
  }
  assert.ok(JSON.stringify(buildNativeGuide('detail:2')).includes('由公司提供；移轉核身及用印'));
  assert.ok(JSON.stringify(buildNativeGuide('detail:6')).includes('無原貸或不需代償'));
  assert.ok(JSON.stringify(buildNativeGuide('detail:6')).includes('清償、塗銷時點與前階段可能交錯'));
});
test('transfer and repayment have separate qualified 3–5 workday estimates; early inspection grants no occupancy or escrow release',()=>{
  const overview=buildNativeGuide('process').messages[0].contents.contents;
  for(const n of [5,6]){
    for(const output of [overview[n-1],buildNativeGuide('step:'+n),buildNativeGuide('detail:'+n)])assert.ok(JSON.stringify(output).includes('3–5'));
    const detail=JSON.stringify(buildNativeGuide('detail:'+n));for(const word of ['銀行','非保證期限','仲介','提前入住','施工','履保提前付款'])assert.ok(detail.includes(word),word);
    walk(buildNativeGuide('detail:'+n),node=>{if(node.type==='text')assert.doesNotMatch(node.text,/保證(?:在|於)?\s*3–5.*(?:完成|辦結)|法定(?:期限|工期)(?:為|是|：|:)?\s*3–5/);});
  }
  assert.ok(JSON.stringify(buildNativeGuide('step:6')).includes('另約 3–5'));
});

test('three server opt-ins fail closed and cannot be enabled by event or another account', async t => {
  for (const [key, flag] of Object.entries(config.NATIVE_TEST_FLAGS)) {
    const previous = process.env[flag];
    delete process.env[flag];
    t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
  }
  for (const key of Object.keys(config.NATIVE_TEST_FLAGS)) {
    const account = accounts.getServiceAccount(key);
    const pilotFlag = account.enabledEnv;
    const previous = pilotFlag ? process.env[pilotFlag] : undefined;
    if (pilotFlag) { process.env[pilotFlag] = 'true'; t.after(() => { if (previous === undefined) delete process.env[pilotFlag]; else process.env[pilotFlag] = previous; }); }
    assert.equal(await dispatch.getPilotReply({ ...event, enabled: true }, account.destination, { account: key }), null);
    const ownFlag = config.NATIVE_TEST_FLAGS[key];
    const publicFlag=config.NATIVE_PUBLIC_FLAGS[key],publicOld=process.env[publicFlag];delete process.env[publicFlag];t.after(()=>{if(publicOld===undefined)delete process.env[publicFlag];else process.env[publicFlag]=publicOld;});
    for (const bad of ['TRUE', '1', 'false', '']) { process.env[ownFlag] = bad; assert.equal(await dispatch.getPilotReply(event, account.destination, { account: key }), null); }
    process.env[ownFlag] = 'true';
    assert.deepEqual(await dispatch.getPilotReply(event, account.destination, { account: key }), buildNativeGuide('home'));
    const publicEvent={...event,message:{type:'text',text:'交易流程'},publicEnabled:true};
    for(const bad of [undefined,'TRUE','1','false','']){if(bad===undefined)delete process.env[publicFlag];else process.env[publicFlag]=bad;assert.equal(await dispatch.getPilotReply(publicEvent,account.destination,{account:key}),null);}
    process.env[publicFlag]='true';
    for (const text of Object.keys(TEXT_ACTIONS)) assert.ok(await dispatch.getPilotReply({ ...event, message: { type: 'text', text } }, account.destination, { account: key }));
    assert.equal(await dispatch.getPilotReply(event, 'wrong-destination', { account: key }), null);
    assert.equal(await dispatch.getPilotReply({ ...event, source: { type: 'group' } }, account.destination, { account: key }), null);
    for (const other of Object.keys(config.NATIVE_TEST_FLAGS).filter(x => x !== key)) assert.equal(config.isNativeTestEnabled(other), false);
    delete process.env[ownFlag];delete process.env[publicFlag];
  }
});

test('legacy aliases and old closing cards preserve their meaning; new step seven is mortgage removal',()=>{
  for(const [text,route]of Object.entries(LEGACY_TEXT_ACTIONS))assert.deepEqual(routeNativeGuide({...event,message:{type:'text',text}},'@604gpqef'),buildNativeGuide(route));
  for(let n=1;n<=8;n++)assert.deepEqual(routeNativeGuide({...event,type:'postback',postback:{data:LEGACY_PREFIX+'step:'+n}},'@604gpqef'),buildNativeGuide('step:'+(n>=7?8:n)));
  assert.deepEqual(routeNativeGuide({...event,type:'postback',postback:{data:PREFIX+'step:7'}},'@604gpqef'),buildNativeGuide('step:7'));
});
test('all customer-facing native output uses formal names and compact main cards',()=>{
  for(const route of ROUTES)assert.doesNotMatch(JSON.stringify(buildNativeGuide(route)),/測試服務導覽|測試導覽|備件勾選測試|備件測試快照/);
  for(let n=1;n<=8;n++){const texts=[];walk(buildNativeGuide('step:'+n),node=>{if(node.type==='text')texts.push(node.text);});assert.ok(texts.filter(x=>!x.startsWith('宏國')).every(x=>x.length<=70));}
});
test('income proof menu has four short categories plus other/mixed with no universal six-month demand',()=>{
  for(const label of ['受薪','自營／接案','退休','租金','其他／混合'])assert.ok(actions(buildNativeGuide('finance')).some(a=>a.label===label));
  for(const route of ['finance:salary','finance:business','finance:pension','finance:rental','finance:other'])assert.ok(actions(buildNativeGuide(route)).some(a=>a.data===PREFIX+'finance:conditions'));
  assert.match(JSON.stringify(buildNativeGuide('finance:business')),/401／403／405.*不是人人全交/);assert.match(JSON.stringify(buildNativeGuide('finance:pension')),/一次領取與每月給付不同/);assert.match(JSON.stringify(buildNativeGuide('finance:other')),/來源與金流需對應/);
});
