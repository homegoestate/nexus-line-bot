const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
test('document snapshots traverse original signed webhook for all three OAs with zero real transport or storage', async t => {
  const { SERVICE_ACCOUNTS } = require('../lib/service-accounts');
  const config = require('../lib/native-guide-config');
  const env = { CHANNEL_SECRET: 'offline-secret', CHANNEL_ACCESS_TOKEN: 'offline-token', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'offline-db' };
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    env[account.secretEnv] ||= 'offline-secret-' + account.key;
    if (account.enabledEnv) env[account.enabledEnv] = 'true';
    env[config.NATIVE_TEST_FLAGS[account.key]] = 'true';
    env[config.NATIVE_DOCUMENT_FLAGS[account.key]] = 'true';
    env[config.NATIVE_PUBLIC_FLAGS[account.key]] = 'true';
  }
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const replies = [], databaseCalls = [], pending = [], transports = [];
  t.mock.method(require('@line/bot-sdk').Client.prototype, 'replyMessage', async (token, messages) => { replies.push({ account: '604gpqef', messages }); return {}; });
  const sp = require.resolve('@supabase/supabase-js'), original = require(sp);
  require.cache[sp].exports = { ...original, createClient: () => ({ from: table => { databaseCalls.push(table); throw Error('No case access'); } }) };
  t.after(() => { require.cache[sp].exports = original; });
  const vp = require.resolve('@vercel/functions'), functions = require(vp);
  require.cache[vp].exports = { ...functions, waitUntil: promise => pending.push(promise) };
  t.after(() => { require.cache[vp].exports = functions; });
  t.mock.method(console, 'info', () => {}); t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    transports.push(url);
    if (url === 'https://api.line.me/oauth2/v3/token') {
      const p = new URLSearchParams(init.body), account = Object.values(SERVICE_ACCOUNTS).find(a => a.channelId === p.get('client_id'));
      assert.ok(account); assert.equal(p.get('client_secret'), env[account.secretEnv]);
      return { ok: true, status: 200, json: async () => ({ access_token: 'offline-token-' + account.key, expires_in: 900 }) };
    }
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    const account = Object.values(SERVICE_ACCOUNTS).find(a => new Headers(init.headers).get('authorization') === 'Bearer offline-token-' + a.key);
    assert.ok(account); replies.push({ account: account.key, ...JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) };
  });
  const app = require('../api/index'), server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { DOCUMENT_TRIGGER, encodeSnapshot, initialSnapshot } = await import('../lib/native-document-guide.mjs');
  const base = { type: 'message', mode: 'active', replyToken: 'offline-reply', source: { type: 'user', userId: 'offline-user' }, message: { type: 'text', text: DOCUMENT_TRIGGER } };
  async function post(account, event, destination = account.destination, secret = env[account.secretEnv]) {
    const raw = JSON.stringify({ destination, events: [event] }), signature = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api?account=' + account.key, method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': signature } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end(raw);
    });
    await Promise.all(pending.splice(0)); return status;
  }
  for (const account of Object.values(SERVICE_ACCOUNTS)) {
    const before = replies.length;
    assert.equal(await post(account, base), 200);
    assert.equal(replies.length, before + 1); assert.equal(replies.at(-1).account, account.key);
    assert.match(replies.at(-1).messages[0].altText, /財力備件清單，自報尚未核實/);
    const event = { ...base, type: 'postback', webhookEventId: 'offline-replayed', postback: { data: encodeSnapshot(initialSnapshot('salary'), 'list', 'report', 0), staff: true, verified: true }, deliveryContext: { isRedelivery: true } };
    assert.equal(await post(account, event), 200);
    const first = replies.at(-1).messages;
    assert.match(JSON.stringify(first), /已交（客戶自報）/); assert.match(JSON.stringify(first), /承辦尚未核實/);
    assert.equal(await post(account, event), 200); assert.deepEqual(replies.at(-1).messages, first);
    const validCount = replies.length;
    assert.ok(await post(account, base, account.destination, 'bad-secret') >= 400);
    await post(account, base, 'wrong-destination');
    assert.equal(replies.length, validCount);
    await post(account, { ...base, source: { type: 'group', groupId: 'offline-group' } });
    await post(account, { ...base, mode: 'standby' });
    assert.equal(replies.length, validCount);
  }
  assert.deepEqual(databaseCalls, []);
  assert.ok(transports.every(url => ['https://api.line.me/oauth2/v3/token', 'https://api.line.me/v2/bot/message/reply'].includes(url)));
});
