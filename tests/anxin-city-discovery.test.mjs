import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWelcomeReply, routeEvent, PILOT_PREFIX } from '../lib/flow-router.mjs';
import { buildNativeGuide, PREFIX, LEGACY_PREFIX, ROUTES } from '../lib/native-chat-guide.mjs';
import accounts from '../lib/service-accounts.js';
import flags from '../lib/native-guide-config.js';
import dispatch from '../lib/pilot-dispatch.js';
import keyword from '../lib/anxin-city-entry.js';
import { expectedPanel, expectedWelcomeParagraph, stripAnxinDiscovery } from './helpers/anxin-discovery.mjs';

const URI = 'https://homegoestate.github.io/anxin-city/';
const event = { type: 'message', mode: 'active', source: { type: 'user', userId: 'PRIVATE_ID' }, replyToken: 'PRIVATE_TOKEN', message: { type: 'text', text: '服務導覽' } };
function enable(t) {
  const values = { HG_SERVICE_PILOT_ENABLED: 'true', HG_SERVICE_WELCOME_ENABLED: 'true' };
  for (const a of Object.values(accounts.SERVICE_ACCOUNTS)) {
    if (a.enabledEnv) values[a.enabledEnv] = 'true';
    values[flags.NATIVE_TEST_FLAGS[a.key]] = 'true';
    values[flags.NATIVE_PUBLIC_FLAGS[a.key]] = 'true';
  }
  for (const [key,value] of Object.entries(values)) { const old=process.env[key];process.env[key]=value;t.after(()=>old===undefined?delete process.env[key]:process.env[key]=old); }
}
const send = (account, changes = {}) => dispatch.getPilotReply({ ...event, ...changes }, accounts.SERVICE_ACCOUNTS[account].destination, { account });
function nodes(value, predicate) { const out=[];const walk=x=>{if(!x||typeof x!=='object')return;if(predicate(x))out.push(x);Object.values(x).forEach(walk);};walk(value);return out; }
const links = value => nodes(value, n => n.type === 'uri' && n.uri === URI);
const firstCard = view => view.messages.find(m=>m.type==='flex').contents.contents[0];

test('new follows show one direct discovery button on the first brand card; other OAs remain separate', async t => {
  enable(t);
  for (const a of Object.values(accounts.SERVICE_ACCOUNTS)) {
    const reply = await send(a.key,{type:'follow'});
    assert.equal(reply.route,'welcome');assert.equal(reply.messages.length,2);
    assert.equal(links(reply).length,a.key==='604gpqef'?1:0);
    if(a.key==='604gpqef') {
      assert.ok(reply.messages[0].text.includes(expectedWelcomeParagraph));
      assert.deepEqual(firstCard(reply).body.contents.at(-1),expectedPanel);
      assert.deepEqual(firstCard(reply).footer.contents.map(b=>b.action.label),['開啟服務導覽','交易流程','貸款收入證明']);
    }
  }
});

test('existing private home texts, current callbacks and old callbacks all expose one button without a new keyword', async t => {
  enable(t);
  const changes=[{message:{type:'text',text:'宏國服務體驗'}},{message:{type:'text',text:'服務導覽'}},{message:{type:'text',text:'服務導覽：總覽'}},...[PILOT_PREFIX,PREFIX,LEGACY_PREFIX].map(p=>({type:'postback',postback:{data:p+'home'}}))];
  for(const change of changes) {
    const brand=await send('604gpqef',change),other=await send('375umdzq',change);
    assert.equal(links(brand).length,1);assert.equal(links(firstCard(brand)).length,1);
    assert.deepEqual(links(brand)[0],expectedPanel.contents[2].action);
    assert.deepEqual(stripAnxinDiscovery(brand),other,'only the explicit panel may differ');
  }
});

test('all shared public routes and reused A-F entrance cards retain no discovery promotion', async t => {
  enable(t);
  for(const account of Object.keys(accounts.SERVICE_ACCOUNTS)) for(const type of ['group','room']) for(const route of [...ROUTES,'entry:buy']) {
    const reply=await send(account,{source:{type},type:'postback',postback:{data:PREFIX+route}});
    assert.ok(reply);assert.equal(links(reply).length,0,`${account} ${type} ${route}`);
  }
  for(const route of ['services','entry:buy','finance']) assert.equal(links(await send('604gpqef',{type:'postback',postback:{data:PREFIX+route}})).length,0);
});

test('discovery does not broaden exact keyword routing or create message/postback handlers', async t => {
  enable(t);
  for(const account of Object.keys(accounts.SERVICE_ACCOUNTS)) {
    for(const text of ['房產選擇先試試','安心城體驗','我想玩安心城',' 安心城','安心城 ','買賣','貸款','官方服務','公司簽約']) assert.equal(await send(account,{message:{type:'text',text}}),null);
    const exact=await send(account,{message:{type:'text',text:'安心城'}});
    assert.deepEqual(exact,keyword.buildAnxinCityReply());
  }
});

test('existing signature/account context and opt-ins still bound the dispatcher', async t => {
  enable(t);
  const brand=accounts.SERVICE_ACCOUNTS['604gpqef'];
  assert.equal(await dispatch.getPilotReply(event,'wrong-destination',{account:brand.key}),null);
  for(const change of [{mode:'standby'},{replyToken:''},{source:{type:'unknown'}}]) assert.equal(await send(brand.key,change),null);
  assert.equal(links(await send('528scwxf',{account:'604gpqef'})).length,0);
  process.env.HG_SERVICE_WELCOME_ENABLED='false';assert.equal(await send(brand.key,{type:'follow'}),null);
  process.env.HG_SERVICE_PILOT_ENABLED='false';assert.equal(await send(brand.key),null);
});

test('brand discovery remains available on the historical home when native guide flags are off', t => {
  enable(t);
  delete process.env[flags.NATIVE_TEST_FLAGS['604gpqef']];delete process.env[flags.NATIVE_PUBLIC_FLAGS['604gpqef']];
  for(const view of [buildWelcomeReply(),routeEvent({...event,message:{type:'text',text:'宏國服務體驗'}})]) {
    assert.equal(links(view).length,1);
    assert.equal(view.messages.find(m=>m.type==='flex').contents.contents.length,2);
    assert.deepEqual(nodes(view,n=>n.type==='postback').map(n=>n.data),['buy','sell','loan','inherit','land','owner'].map(r=>PILOT_PREFIX+r));
  }
});

test('new rendered Flex is bounded, schema-shaped, fresh, and contains no personal data or added promises', async t => {
  enable(t);
  for(const changes of [{type:'follow'},{},{message:{type:'text',text:'宏國服務體驗'}}]) {
    const view=await send('604gpqef',changes);
    for(const msg of view.messages) {
      if(msg.type==='text'){assert.ok(msg.text.length<=500);continue;}
      assert.equal(msg.type,'flex');assert.ok(msg.altText.length>0&&msg.altText.length<=400);
      assert.ok(msg.contents.contents.length<=12);assert.ok(Buffer.byteLength(JSON.stringify(msg))<50000);
      for(const card of msg.contents.contents)assert.ok(Buffer.byteLength(JSON.stringify(card))<30000);
      for(const n of nodes(msg,n=>n.type==='box')) {assert.ok(['vertical','horizontal','baseline'].includes(n.layout));assert.ok(Array.isArray(n.contents));}
      for(const n of nodes(msg,n=>n.type==='text'))assert.ok(n.text.length>0&&n.text.length<=2000);
      for(const n of nodes(msg,n=>['uri','postback','message'].includes(n.type)&&n.label))assert.ok(n.label.length<=20);
      assert.ok((msg.quickReply?.items.length||0)<=13);
    }
    assert.doesNotMatch(JSON.stringify(view),/PRIVATE_ID|PRIVATE_TOKEN/);
    const original=structuredClone(view);links(view)[0].uri='https://invalid.example/';
    assert.deepEqual(await send('604gpqef',changes),original);
  }
  assert.doesNotMatch(JSON.stringify(expectedPanel),/免費|保證|核貸|獲利|身分證/);
  assert.equal(new URL(URI).search,'');
});

test('historical normalization cannot conceal a changed label, URI, unexpected panel, or wrong route', () => {
  const view={route:'home',messages:[{contents:{contents:[structuredClone(expectedPanel)]}}]};
  assert.equal(stripAnxinDiscovery(view).messages[0].contents.contents.length,0);
  for(const key of ['label','uri']) {const altered=structuredClone(view);altered.messages[0].contents.contents[0].contents[2].action[key]='unexpected';assert.deepEqual(stripAnxinDiscovery(altered),altered);}
  const other={...view,route:'native:services'};assert.deepEqual(stripAnxinDiscovery(other),other);
});
