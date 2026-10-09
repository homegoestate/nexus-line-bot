const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
test('native guide uses the unchanged signed webhook with three-account isolation and mocked transports', async t => {
  const { SERVICE_ACCOUNTS } = require('../lib/service-accounts');
  const { NATIVE_TEST_FLAGS, NATIVE_PUBLIC_FLAGS } = require('../lib/native-guide-config');
  const env = { CHANNEL_SECRET: 'offline-default-secret', CHANNEL_ACCESS_TOKEN: 'offline-default-token', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'offline-database-key', HG_SERVICE_PILOT_ENABLED: undefined };
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    env[account.secretEnv] ||= 'offline-secret-' + account.key;
    if (account.enabledEnv) env[account.enabledEnv] = 'true';
    env[NATIVE_TEST_FLAGS[account.key]] = 'true';
    env[NATIVE_PUBLIC_FLAGS[account.key]] = undefined;
  }
  for (const [name, value] of Object.entries(env)) {
    const old = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
  }
  const replies = [], db = [], requests = [], background = [];
  let failReply = false;
  const line = require('@line/bot-sdk');
  t.mock.method(line.Client.prototype, 'replyMessage', async (replyToken, messages) => { replies.push({ account: '604gpqef', replyToken, messages }); if (failReply) throw Error('offline failure'); return {}; });
  const sp = require.resolve('@supabase/supabase-js'), originalSupabase = require(sp);
  require.cache[sp].exports = { ...originalSupabase, createClient: () => ({ from: table => { db.push(table); throw Error('unexpected database access'); } }) };
  t.after(() => { require.cache[sp].exports = originalSupabase; });
  const vp = require.resolve('@vercel/functions'), originalFunctions = require(vp);
  require.cache[vp].exports = { ...originalFunctions, waitUntil: p => background.push(p) };
  t.after(() => { require.cache[vp].exports = originalFunctions; });
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(url);
    if (url === 'https://api.line.me/oauth2/v3/token') {
      const input = new URLSearchParams(init.body);
      const account = Object.values(SERVICE_ACCOUNTS).find(x => x.channelId === input.get('client_id'));
      assert.ok(account);
      assert.equal(input.get('client_secret'), env[account.secretEnv]);
      return { ok: true, status: 200, json: async () => ({ access_token: 'offline-token-' + account.key, expires_in: 900 }) };
    }
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply', 'no push or unrelated transport is permitted');
    const account = Object.values(SERVICE_ACCOUNTS).find(x => new Headers(init.headers).get('authorization') === 'Bearer offline-token-' + x.key);
    assert.ok(account);
    replies.push({ account: account.key, ...JSON.parse(init.body) });
    return { ok: !failReply, status: failReply ? 500 : 200, json: async () => ({}) };
  });
  const app = require('../api/index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const event = { type: 'message', mode: 'active', replyToken: 'offline-reply', source: { type: 'user', userId: 'offline-user' }, message: { type: 'text', text: '測試服務導覽' }, webhookEventId: 'offline-event' };
  async function post(account, changed = {}, destination = account.destination, secret = env[account.secretEnv]) {
    const raw = JSON.stringify({ destination, events: [{ ...event, ...changed }] });
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    const result = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api?account=' + account.key, method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': signature } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end(raw);
    });
    await Promise.all(background.splice(0));
    return result;
  }
  await t.test('all three account routes accept only their own signature and verified destination', async () => {
    for (const account of Object.values(SERVICE_ACCOUNTS)) {
      const count = replies.length;
      assert.equal(await post(account), 200);
      assert.equal(replies.length, count + 1);
      assert.equal(replies.at(-1).account, account.key);
      assert.ok(replies.at(-1).messages[0].altText.includes('交易流程與貸款收入證明'));
      const validCount = replies.length;
      assert.ok(await post(account, {}, account.destination, 'wrong-secret') >= 400);
      assert.equal(await post(account, {}, 'wrong-destination'), account.legacy ? 200 : 403);
      assert.equal(replies.length, validCount);
    }
  });
  await t.test('text actions, back and old cards remain native; replay gives fixed content with no writes', async () => {
    for (const account of Object.values(SERVICE_ACCOUNTS)) {
      await post(account, { message: { type: 'text', text: '測試導覽：買方備件' } });
      assert.ok(JSON.stringify(replies.at(-1).messages).includes('移轉核身'));
      const changes = { type: 'postback', postback: { data: 'hgchat-test:v1:step:5' }, deliveryContext: { isRedelivery: true } };
      await post(account, changes);
      const expected = replies.at(-1).messages;
      await post(account, changes);
      assert.deepEqual(replies.at(-1).messages, expected);
      await post(account, { type: 'postback', postback: { data: 'hgchat-test:v1:process' } });
      assert.equal(replies.at(-1).messages[0].contents.contents.length, 8);
    }
    assert.deepEqual(db, []);
  });
  await t.test('group, room, standby, disabled feature and old non-guide keywords do not enter new route', async () => {
    for (const account of Object.values(SERVICE_ACCOUNTS)) {
      const count = replies.length;
      for (const change of [{ source: { type: 'group' } }, { source: { type: 'room' } }, { mode: 'standby' }, { replyToken: '' }, { message: { type: 'text', text: '買賣流程' } }, { message: { type: 'text', text: '貸款' } }]) await post(account, change);
      const flag = NATIVE_TEST_FLAGS[account.key]; delete process.env[flag];
      await post(account); process.env[flag] = 'true';
      assert.equal(replies.length, count);
    }
    assert.deepEqual(db, []);
  });
  await t.test('failed native replies have one attempt without retry or push', async () => {
    failReply = true;
    for (const account of Object.values(SERVICE_ACCOUNTS)) {
      const count = replies.length;
      assert.equal(await post(account), 200);
      assert.equal(replies.length, count + 1);
    }
    assert.ok(requests.every(url => url.endsWith('/token') || url.endsWith('/message/reply')));
    assert.deepEqual(db, []);
  });
  await t.test('formal service entry is opt-in while original OA keyword entries stay intact', async () => {
    failReply=false;
    for(const account of Object.values(SERVICE_ACCOUNTS)) {
      const flag=NATIVE_PUBLIC_FLAGS[account.key],before=replies.length;
      for(const text of ['服務導覽','交易流程','貸款收入證明'])await post(account,{message:{type:'text',text}});
      assert.equal(replies.length,before);
      process.env[flag]='true';
      for(const text of ['服務導覽']){
        assert.equal(await post(account,{message:{type:'text',text}}),200);
        assert.equal(replies.at(-1).account,account.key);
        assert.doesNotMatch(JSON.stringify(replies.at(-1).messages),/測試服務導覽|測試導覽/);
      }
      assert.equal(replies.length,before+1);
      for(const text of ['交易流程','貸款收入證明'])await post(account,{message:{type:'text',text}});
      assert.equal(replies.length,before+1);delete process.env[flag];
    }
    assert.deepEqual(db,[]);
  });
});
