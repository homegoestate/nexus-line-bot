const test = require('node:test');
const assert = require('node:assert/strict');
const { getPilotReply, PILOT_DESTINATION } = require('../lib/pilot-dispatch');
const event = { type: 'message', mode: 'active', source: { type: 'user' }, replyToken: 'local-test-token', message: { type: 'text', text: '宏國服務體驗' } };
test('pilot serves the one authorized destination', async () => {
  assert.equal((await getPilotReply(event, PILOT_DESTINATION)).route, 'home');
  assert.equal(await getPilotReply(event, 'different-destination'), null);
});
test('pilot excludes groups, rooms, standby, missing mode and missing reply token', async () => {
  for (const changed of [{source:{type:'group'}}, {source:{type:'room'}}, {mode:'standby'}, {mode:undefined}, {replyToken:''}]) {
    assert.equal(await getPilotReply({...event,...changed},PILOT_DESTINATION), null);
  }
});
test('old keywords and arbitrary messages do not load or intercept pilot', async () => {
  for (const text of ['估價 海安路','租屋 台南','租金 台南','查租 東區','💰試算 1000','我要買房','房貸','買房','1','21','過戶','【需求諮詢】買房',' 宏國服務體驗']) {
    assert.equal(await getPilotReply({...event,message:{type:'text',text}},PILOT_DESTINATION), null, text);
  }
});
test('only pilot postback namespace is intercepted', async () => {
  const postback={...event,type:'postback',postback:{data:'unrelated:home'}};
  assert.equal(await getPilotReply(postback,PILOT_DESTINATION),null);
  assert.equal((await getPilotReply({...postback,postback:{data:'hgpilot:v1:owner'}},PILOT_DESTINATION)).route,'owner');
});
test('pilot kill switch leaves original handlers available', async () => {
  process.env.HG_SERVICE_PILOT_ENABLED = 'false';
  try { assert.equal(await getPilotReply(event,PILOT_DESTINATION),null); }
  finally { delete process.env.HG_SERVICE_PILOT_ENABLED; }
});
