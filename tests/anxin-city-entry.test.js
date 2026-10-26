const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { ANXIN_CITY_ACCOUNTS, ANXIN_CITY_LINKS, buildAnxinCityReply, routeAnxinCityEntry } = require('../lib/anxin-city-entry');
const { SERVICE_ACCOUNTS } = require('../lib/service-accounts');
const { getPilotReply, PILOT_VERSION } = require('../lib/pilot-dispatch');
const config = require('../lib/native-guide-config');

const baseEvent = () => ({
  type: 'message', mode: 'active', source: { type: 'user', userId: 'offline-user' },
  replyToken: 'offline-reply', message: { type: 'text', text: '安心城' },
});
const nativeKeywords = ['官方服務', '官方', '新青安', '貸款規定', '貸款', '買賣', '簽約', '公司簽約', '收支比', '主題影片', '影片清單', '影音導覽'];
const nonExact = ['', ' 安心城', '安心城 ', '安心城\n', '安心城！', '宏國安心城', '安心城首購', '我想玩安心城', '安心城?start=seller'];

function setEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
}

test('one bounded Flex bubble has only the six fixed public URLs and no user data', () => {
  assert.equal(PILOT_VERSION, 'hgservice-20261026-v11-anxin-city-three-oa');
  const reply = buildAnxinCityReply();
  assert.equal(reply.messages.length, 1);
  const message = reply.messages[0];
  assert.equal(message.type, 'flex');
  assert.ok(message.altText.length <= 400);
  assert.equal(message.contents.type, 'bubble');
  assert.equal(message.contents.footer.contents.length, 6);
  assert.deepEqual(message.contents.footer.contents.map(button => button.action), ANXIN_CITY_LINKS.map(link => ({ type: 'uri', ...link })));
  const starts = ['first-home', 'move-home', 'seller', 'legacy-family', 'tainan'];
  for (const [index, link] of ANXIN_CITY_LINKS.entries()) {
    assert.ok(link.label.length <= 20);
    const url = new URL(link.uri);
    assert.equal(url.origin, 'https://homegoestate.github.io');
    assert.equal(url.username + url.password + url.hash, '');
    assert.equal(url.pathname, index < 5 ? '/anxin-city/' : '/');
    assert.deepEqual([...url.searchParams], index < 5 ? [['start', starts[index]]] : []);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(message)) < 30_000);
  const routed = routeAnxinCityEntry({ ...baseEvent(), userName: 'DO_NOT_ECHO', message: { type: 'text', text: '安心城', arbitrary: 'DO_NOT_ECHO' } }, '604gpqef');
  assert.doesNotMatch(JSON.stringify(routed), /offline-user|offline-reply|DO_NOT_ECHO/);
});

test('pure route accepts exact 安心城 on the three approved active private chats and returns fresh payloads', () => {
  const expected = buildAnxinCityReply();
  assert.deepEqual(ANXIN_CITY_ACCOUNTS, ['604gpqef', '375umdzq', '528scwxf']);
  for (const account of ANXIN_CITY_ACCOUNTS) assert.deepEqual(routeAnxinCityEntry(baseEvent(), account), expected);
  for (const account of ['training', '@604gpqef', '@375umdzq', '@528scwxf', 'unknown', undefined, null]) {
    assert.equal(routeAnxinCityEntry(baseEvent(), account), null);
  }
  for (const text of [...nonExact, ...nativeKeywords]) {
    assert.equal(routeAnxinCityEntry({ ...baseEvent(), message: { type: 'text', text } }, '604gpqef'), null);
  }
  for (const changed of [{ mode: 'standby' }, { mode: undefined }, { source: { type: 'group' } }, { source: { type: 'room' } }, { source: {} }, { type: 'follow' }, { type: 'postback', postback: { data: '安心城' } }, { message: { type: 'image' } }]) {
    assert.equal(routeAnxinCityEntry({ ...baseEvent(), ...changed }, '604gpqef'), null);
  }
  for (const event of [null, undefined, {}, []]) assert.equal(routeAnxinCityEntry(event, '604gpqef'), null);
  const first = routeAnxinCityEntry(baseEvent(), '604gpqef');
  first.messages[0].contents.footer.contents[0].action.uri = 'https://invalid.example/';
  assert.deepEqual(routeAnxinCityEntry(baseEvent(), '604gpqef'), expected);
});

test('dispatcher keeps verified destination, account opt-in, exact text and original keyword boundaries', async t => {
  const flags = { HG_SERVICE_PILOT_ENABLED: 'true' };
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    if (account.enabledEnv) flags[account.enabledEnv] = 'true';
    flags[config.NATIVE_TEST_FLAGS[account.key]] = 'true';
    flags[config.NATIVE_PUBLIC_FLAGS[account.key]] = 'true';
  }
  setEnv(t, flags);
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    const result = await getPilotReply(baseEvent(), account.destination, { account: account.key });
    assert.deepEqual(result, buildAnxinCityReply());
    for (const text of [...nonExact, ...nativeKeywords]) {
      assert.equal(await getPilotReply({ ...baseEvent(), message: { type: 'text', text } }, account.destination, { account: account.key }), null);
    }
  }
  const brand = SERVICE_ACCOUNTS['604gpqef'];
  for (const changed of [{ replyToken: '' }, { replyToken: 'x'.repeat(257) }, { mode: 'standby' }, { source: { type: 'group' } }, { source: { type: 'room' } }]) {
    assert.equal(await getPilotReply({ ...baseEvent(), ...changed }, brand.destination), null);
  }
  assert.equal(await getPilotReply(baseEvent(), 'wrong-destination'), null);
  assert.deepEqual(await getPilotReply({ ...baseEvent(), account: '604gpqef' }, SERVICE_ACCOUNTS['528scwxf'].destination, { account: '528scwxf' }), buildAnxinCityReply(), 'event hints cannot change the verified account');
  for (const account of Object.values(SERVICE_ACCOUNTS).filter(a => a.enabledEnv)) {
    process.env[account.enabledEnv] = 'false';
    assert.equal(await getPilotReply(baseEvent(), account.destination, { account: account.key }), null);
    process.env[account.enabledEnv] = 'true';
  }
  process.env.HG_SERVICE_PILOT_ENABLED = 'false';
  assert.equal(await getPilotReply(baseEvent(), brand.destination), null);
});

test('signed local webhook replies once per approved account exact keyword, with no network or database access', async t => {
  const env = {
    CHANNEL_SECRET: 'offline-default-secret', CHANNEL_ACCESS_TOKEN: 'offline-default-token',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'offline-database-key',
    HG_SERVICE_PILOT_ENABLED: 'true',
  };
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    env[account.secretEnv] ||= 'offline-secret-' + account.key;
    if (account.enabledEnv) env[account.enabledEnv] = 'true';
    env[config.NATIVE_TEST_FLAGS[account.key]] = 'true';
    env[config.NATIVE_PUBLIC_FLAGS[account.key]] = 'true';
  }
  setEnv(t, env);
  const replies = [], background = [];
  const line = require('@line/bot-sdk');
  t.mock.method(line.Client.prototype, 'replyMessage', async (replyToken, messages) => { replies.push({ replyToken, messages }); return {}; });
  t.mock.method(globalThis, 'fetch', async () => { throw Error('External network is forbidden in this test'); });
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'error', () => {});
  const supabasePath = require.resolve('@supabase/supabase-js');
  const originalSupabase = require(supabasePath);
  require.cache[supabasePath].exports = { ...originalSupabase, createClient: () => ({ from: () => { throw Error('Database access is forbidden in this test'); } }) };
  t.after(() => { require.cache[supabasePath].exports = originalSupabase; });
  const functionsPath = require.resolve('@vercel/functions');
  const originalFunctions = require(functionsPath);
  require.cache[functionsPath].exports = { ...originalFunctions, waitUntil: promise => background.push(promise) };
  t.after(() => { require.cache[functionsPath].exports = originalFunctions; });
  const statelessPath = require.resolve('../lib/stateless-line-client');
  const originalStateless = require(statelessPath);
  require.cache[statelessPath].exports = { ...originalStateless, createStatelessLineClient: () => ({
    replyMessage: async (replyToken, messages) => { replies.push({ replyToken, messages }); return {}; },
  }) };
  t.after(() => { require.cache[statelessPath].exports = originalStateless; });
  const app = require('../api/index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function post(account, changed = {}, destination = account.destination, secret = env[account.secretEnv]) {
    const body = JSON.stringify({ destination, events: [{ ...baseEvent(), ...changed }] });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
    const status = await new Promise((resolve, reject) => {
      const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api?account=' + account.key, method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': signature } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end(body);
    });
    await Promise.all(background.splice(0));
    return status;
  }
  const brand = SERVICE_ACCOUNTS['604gpqef'];
  assert.equal(await post(brand), 200);
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].messages, buildAnxinCityReply().messages);
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    if (account !== brand) {
      const count = replies.length;
      assert.equal(await post(account), 200);
      assert.equal(replies.length, count + 1);
      assert.deepEqual(replies.at(-1).messages, buildAnxinCityReply().messages);
    }
    for (const text of [...nonExact, ...nativeKeywords]) assert.equal(await post(account, { message: { type: 'text', text } }), 200);
    for (const sourceType of ['group', 'room']) assert.equal(await post(account, { source: { type: sourceType } }), 200);
  }
  assert.equal(await post(brand, {}, 'wrong-destination'), 200);
  assert.ok(await post(brand, {}, brand.destination, 'wrong-secret') >= 400);
  for (const account of Object.values(SERVICE_ACCOUNTS).filter(a => a !== brand)) {
    assert.ok(await post(account, {}, account.destination, 'wrong-secret') >= 400);
    assert.equal(await post(account, {}, brand.destination), 403);
  }
  assert.equal(replies.length, 3);
});
