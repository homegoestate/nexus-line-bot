const test = require('node:test');
const assert = require('node:assert/strict');
const { getPilotReply, PILOT_DESTINATION } = require('../lib/pilot-dispatch');
const event = { type: 'message', mode: 'active', source: { type: 'user' }, replyToken: 'local-test-token', message: { type: 'text', text: '宏國服務體驗' } };
const follow = { type: 'follow', mode: 'active', source: { type: 'user' }, replyToken: 'local-follow-token' };
const policyPath = require.resolve('../welcome-policy.json');
require(policyPath);
function mockPolicy(t, policy) {
  const previous = require.cache[policyPath].exports;
  require.cache[policyPath].exports = policy;
  t.after(() => { require.cache[policyPath].exports = previous; });
}
function mockEnv(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}
const confirmedPolicy = { accounts: { '@604gpqef': { nativeGreetingDisabledConfirmed: true } } };
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
test('confirmed 604 follow returns the welcome builder exactly once', async t => {
  mockPolicy(t, confirmedPolicy);
  mockEnv(t, 'HG_SERVICE_PILOT_ENABLED', undefined);
  mockEnv(t, 'HG_SERVICE_WELCOME_ENABLED', undefined);
  const { buildWelcomeReply } = await import('../lib/flow-router.mjs');
  const reply = await getPilotReply(follow, PILOT_DESTINATION);
  assert.deepEqual(reply, buildWelcomeReply({ account: '@604gpqef' }));
  assert.equal(reply.route, 'welcome');
  assert.equal(reply.messages.length, 2);
  assert.equal(reply.messages.filter(message => message.type === 'text').length, 1);
  assert.equal(reply.messages.filter(message => message.type === 'flex').length, 1);
});
test('follow requires exact true in trusted 604 policy, not claims in the event', async t => {
  mockPolicy(t, null);
  const claimedFollow = { ...follow, nativeGreetingDisabledConfirmed: true, policy: confirmedPolicy, account: '@604gpqef' };
  for (const policy of [null, {}, { accounts: {} }, { accounts: { '@375umdzq': { nativeGreetingDisabledConfirmed: true } } }, ...[false, 'true', 1, undefined].map(value => ({ accounts: { '@604gpqef': { nativeGreetingDisabledConfirmed: value } } }))]) {
    require.cache[policyPath].exports = policy;
    assert.equal(await getPilotReply(claimedFollow, PILOT_DESTINATION), null);
  }
});
test('follow keeps the account, active, direct-user and reply-token gates', async t => {
  mockPolicy(t, confirmedPolicy);
  assert.equal(await getPilotReply(follow, 'different-destination'), null);
  assert.equal(await getPilotReply(follow, undefined), null);
  for (const changed of [{ source: { type: 'group' } }, { source: { type: 'room' } }, { source: undefined }, { mode: 'standby' }, { mode: undefined }, { replyToken: '' }, { replyToken: undefined }, { replyToken: 123 }, { replyToken: 'x'.repeat(257) }]) {
    assert.equal(await getPilotReply({ ...follow, ...changed }, PILOT_DESTINATION), null);
  }
});
test('either kill switch suppresses welcome without changing normal guide routing', async t => {
  mockPolicy(t, confirmedPolicy);
  mockEnv(t, 'HG_SERVICE_PILOT_ENABLED', undefined);
  mockEnv(t, 'HG_SERVICE_WELCOME_ENABLED', 'false');
  assert.equal(await getPilotReply(follow, PILOT_DESTINATION), null);
  assert.equal((await getPilotReply(event, PILOT_DESTINATION)).route, 'home');
  assert.equal((await getPilotReply({ ...event, type: 'postback', postback: { data: 'hgpilot:v1:owner' } }, PILOT_DESTINATION)).route, 'owner');
  delete process.env.HG_SERVICE_WELCOME_ENABLED;
  process.env.HG_SERVICE_PILOT_ENABLED = 'false';
  assert.equal(await getPilotReply(follow, PILOT_DESTINATION), null);
  assert.equal(await getPilotReply(event, PILOT_DESTINATION), null);
});
test('confirmed welcome policy never sends welcome on ordinary messages or unrelated events', async t => {
  mockPolicy(t, confirmedPolicy);
  for (const text of ['您好', '買房', '房貸', '【需求諮詢】買房']) {
    assert.equal(await getPilotReply({ ...event, message: { type: 'text', text } }, PILOT_DESTINATION), null);
  }
  assert.equal((await getPilotReply(event, PILOT_DESTINATION)).route, 'home');
  for (const type of ['unfollow', 'join', 'leave', 'beacon']) {
    assert.equal(await getPilotReply({ ...follow, type }, PILOT_DESTINATION), null);
  }
});
test('unconfirmed welcome policy leaves message and postback guide routing unchanged', async t => {
  mockPolicy(t, { accounts: { '@604gpqef': { nativeGreetingDisabledConfirmed: false } } });
  assert.equal(await getPilotReply(follow, PILOT_DESTINATION), null);
  assert.equal((await getPilotReply(event, PILOT_DESTINATION)).route, 'home');
  assert.equal((await getPilotReply({ ...event, type: 'postback', postback: { data: 'hgpilot:v1:buy' } }, PILOT_DESTINATION)).route, 'buy');
});
