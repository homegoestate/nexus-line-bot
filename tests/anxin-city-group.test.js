const test = require('node:test');
const assert = require('node:assert/strict');
const { routeAnxinCityEntry, buildAnxinCityReply, buildAnxinCityGroupReply, isAnxinCityGroupEvent } = require('../lib/anxin-city-entry');
const { getPilotReply } = require('../lib/pilot-dispatch');
const { SERVICE_ACCOUNTS } = require('../lib/service-accounts');
const event = () => ({ type: 'message', mode: 'active', source: { type: 'group', groupId: 'PRIVATE_GROUP', userId: 'PRIVATE_MEMBER' }, replyToken: 'PRIVATE_REPLY', message: { type: 'text', text: '安心城' } });
function enable(t) {
  const values = { HG_SERVICE_PILOT_ENABLED: 'true' };
  for (const account of Object.values(SERVICE_ACCOUNTS)) if (account.enabledEnv) values[account.enabledEnv] = 'true';
  for (const [key,value] of Object.entries(values)) { const old=process.env[key];process.env[key]=value;t.after(()=>old===undefined?delete process.env[key]:process.env[key]=old); }
}

test('only brand group exact text gets the compact entrance; three private entrances and all rooms retain their boundaries', async t => {
  enable(t);
  for (const account of Object.values(SERVICE_ACCOUNTS)) for (const type of ['user','group','room']) {
    const input = { ...event(), source: { type } };
    const expected = type === 'user' ? buildAnxinCityReply() : type === 'group' && account.key === '604gpqef' ? buildAnxinCityGroupReply() : null;
    assert.deepEqual(routeAnxinCityEntry(input,account.key),expected);
    assert.deepEqual(await getPilotReply(input,account.destination,{account:account.key}),expected);
  }
  for (const account of ['training','unknown','@604gpqef',undefined]) assert.equal(routeAnxinCityEntry(event(),account),null);
});

test('brand group exception retains exact matching, active mode, valid reply token, verified destination, flags and event account isolation', async t => {
  enable(t);const brand=SERVICE_ACCOUNTS['604gpqef'];
  for(const text of ['', ' 安心城','安心城 ','安心城\n','安心城！','我想玩安心城','官方','貸款規定','宏國安心城']) {
    const input={...event(),message:{type:'text',text}};
    assert.equal(isAnxinCityGroupEvent(input,brand.key),false);
    assert.equal(await getPilotReply(input,brand.destination,{account:brand.key}),null);
  }
  for(const change of [{mode:'standby'},{mode:undefined},{replyToken:''},{replyToken:'x'.repeat(257)},{type:'follow'},{type:'postback',postback:{data:'安心城'}},{message:{type:'image'}},{source:{type:'room'}},{source:{}}]) assert.equal(await getPilotReply({...event(),...change},brand.destination,{account:brand.key}),null);
  assert.equal(await getPilotReply(event(),'wrong-destination',{account:brand.key}),null);
  assert.equal(await getPilotReply({...event(),account:brand.key},SERVICE_ACCOUNTS['375umdzq'].destination,{account:'375umdzq'}),null);
  process.env.HG_SERVICE_PILOT_ENABLED='false';assert.equal(await getPilotReply(event(),brand.destination,{account:brand.key}),null);
});

test('group reply has one public URI CTA, bounded Flex content, no personal data and no shared mutable payload', () => {
  const first=routeAnxinCityEntry(event(),'604gpqef');
  assert.equal(first.messages.length,1);const message=first.messages[0];assert.equal(message.type,'flex');assert.ok(message.altText.length<=400);
  assert.equal(message.contents.type,'bubble');assert.equal(message.contents.body.contents.length,2);
  assert.deepEqual(message.contents.footer.contents.map(b=>b.action),[{type:'uri',label:'開始體驗安心城',uri:'https://homegoestate.github.io/anxin-city/'}]);
  assert.ok(Buffer.byteLength(JSON.stringify(message))<30000);
  assert.doesNotMatch(JSON.stringify(first),/PRIVATE_GROUP|PRIVATE_MEMBER|PRIVATE_REPLY|免費|保證|核貸/);
  first.messages[0].contents.footer.contents[0].action.uri='https://invalid.example/';assert.deepEqual(routeAnxinCityEntry(event(),'604gpqef'),buildAnxinCityGroupReply());
});
