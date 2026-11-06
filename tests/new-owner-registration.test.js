const test = require('node:test');
const assert = require('node:assert/strict');
const { getPilotReply } = require('../lib/pilot-dispatch');
const { getServiceAccount } = require('../lib/service-accounts');
const { routeNewOwnerRegistration, NEW_OWNER_REPLY_TEXT } = require('../lib/new-owner-registration');

const SUMMARY = '【新屋主登錄】\n案件編號：PEND-20261106-A3449E78E199\n建設公司：上宇建設\n建案：上宇Link\n棟／樓／戶：A棟／5樓／A7戶\n承購人：黃敬介\n我已完成建檔，請協助核對資料。';
const build = (text, overrides = {}) => ({ type: 'message', mode: 'active', source: { type: 'user' }, replyToken: 'test-reply', message: { type: 'text', text }, ...overrides });

function enable(t) {
  const name = 'HG_SERVICE_PILOT_375UMDZQ_ENABLED';
  const previous = process.env[name];
  process.env[name] = 'true';
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}

test('375umdzq private chat registration summary gets the acknowledgement', async t => {
  enable(t);
  const account = getServiceAccount('375umdzq');
  const reply = await getPilotReply(build(SUMMARY), account.destination, { account: '375umdzq' });
  assert.equal(reply.route, 'new-owner-registration:ack');
  assert.deepEqual(reply.messages, [{ type: 'text', text: NEW_OWNER_REPLY_TEXT }]);
  assert.match(NEW_OWNER_REPLY_TEXT, /交易流程/);
  assert.match(NEW_OWNER_REPLY_TEXT, /貸款收入證明/);
  assert.ok(NEW_OWNER_REPLY_TEXT.length < 5000);
});

test('leading whitespace before the marker is tolerated', () => {
  assert.equal(routeNewOwnerRegistration(build('  \n' + SUMMARY), '375umdzq').route, 'new-owner-registration:ack');
});

test('ordinary messages, loan health summaries and photos stay silent', async t => {
  enable(t);
  const account = getServiceAccount('375umdzq');
  for (const text of ['您好', '貸款健檢｜上宇建設｜上宇Link｜A棟A7戶｜黃敬介', '請問新屋主登錄要怎麼做', '新屋主登錄', '我已完成【新屋主登錄】']) {
    assert.equal(await getPilotReply(build(text), account.destination, { account: '375umdzq' }), null, text);
  }
  assert.equal(routeNewOwnerRegistration({ ...build(''), message: { type: 'image', id: '1' } }, '375umdzq'), null);
});

test('other accounts, groups and standby events never get the acknowledgement', async t => {
  enable(t);
  for (const key of ['604gpqef', '528scwxf']) {
    assert.equal(routeNewOwnerRegistration(build(SUMMARY), key), null, key);
  }
  assert.equal(routeNewOwnerRegistration(build(SUMMARY, { source: { type: 'group', groupId: 'G1' } }), '375umdzq'), null);
  assert.equal(routeNewOwnerRegistration(build(SUMMARY, { mode: 'standby' }), '375umdzq'), null);
  const official = getServiceAccount('604gpqef');
  const reply = await getPilotReply(build(SUMMARY), official.destination, { account: '604gpqef' });
  assert.equal(reply, null);
});

test('wrong destination for 375umdzq is still rejected before routing', async t => {
  enable(t);
  assert.equal(await getPilotReply(build(SUMMARY), 'U0000000000000000000000000000000', { account: '375umdzq' }), null);
});
