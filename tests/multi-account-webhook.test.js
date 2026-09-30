const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

const DEFAULT_DESTINATION = 'U8b81ef7675293ace19bffe31ca3c701f';
const accounts = [
  { key: '528scwxf', destination: 'U84b618fe443161f9044ddf51334f58f1', channelId: '2009777750', secret: 'test-secret-528', secretEnv: 'CHANNEL_SECRET_528SCWXF', flag: 'HG_SERVICE_PILOT_528SCWXF_ENABLED' },
  { key: '375umdzq', destination: 'U61e64edf2fdbe4903d535367212ebc6e', channelId: '2009791946', secret: 'test-secret-375', secretEnv: 'CHANNEL_SECRET_375UMDZQ', flag: 'HG_SERVICE_PILOT_375UMDZQ_ENABLED' }
];
const event = { type: 'message', mode: 'active', source: { type: 'user', userId: 'offline-user-id' }, replyToken: 'offline-reply', message: { type: 'text', text: '宏國服務體驗' } };

test('signed account-specific HTTP webhook isolation with every external request mocked', async t => {
  const environment = { CHANNEL_ACCESS_TOKEN: 'test-legacy-token', CHANNEL_SECRET: 'test-default-secret', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key', HG_SERVICE_PILOT_ENABLED: undefined, HG_SERVICE_WELCOME_ENABLED: undefined };
  for (const account of accounts) { environment[account.secretEnv] = account.secret; environment[account.flag] = 'true'; }
  for (const [name, value] of Object.entries(environment)) {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }

  const legacyReplies = [];
  const tokenRequests = [];
  const newReplies = [];
  const databaseRequests = [];
  const background = [];
  const logs = [];
  for (const method of ['info', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  const line = require('@line/bot-sdk');
  t.mock.method(line.Client.prototype, 'replyMessage', async (replyToken, messages) => { legacyReplies.push({ replyToken, messages }); return {}; });
  const supabasePath = require.resolve('@supabase/supabase-js');
  const originalSupabase = require(supabasePath);
  require.cache[supabasePath].exports = { ...originalSupabase, createClient: () => ({ from: table => { databaseRequests.push(table); throw new Error('unexpected database access in isolated webhook test'); } }) };
  t.after(() => { require.cache[supabasePath].exports = originalSupabase; });
  const functionsPath = require.resolve('@vercel/functions');
  const originalFunctions = require(functionsPath);
  require.cache[functionsPath].exports = { ...originalFunctions, waitUntil: promise => { background.push(promise); } };
  t.after(() => { require.cache[functionsPath].exports = originalFunctions; });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url === 'https://api.line.me/oauth2/v3/token') {
      const credentials = new URLSearchParams(init.body);
      const account = accounts.find(item => item.channelId === credentials.get('client_id'));
      assert.ok(account, 'unexpected account must never request a token');
      assert.equal(credentials.get('client_secret'), account.secret);
      tokenRequests.push(account.key);
      return { ok: true, status: 200, json: async () => ({ access_token: `offline-token-${account.key}`, expires_in: 900 }) };
    }
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply', 'unexpected external request is blocked');
    const authorization = new Headers(init.headers).get('authorization');
    const account = accounts.find(item => authorization === `Bearer offline-token-${item.key}`);
    assert.ok(account, 'a new account reply must use its own minted token');
    newReplies.push({ account: account.key, ...JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) };
  });

  const app = require('../api/index');
  const policyPath = require.resolve('../welcome-policy.json');
  const originalPolicy = require(policyPath);
  require.cache[policyPath].exports = { accounts: { '@604gpqef': { nativeGreetingDisabledConfirmed: true } } };
  t.after(() => { require.cache[policyPath].exports = originalPolicy; });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  async function request(path, body, secret = 'test-default-secret') {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = payload === undefined ? {} : { 'content-type': 'application/json', 'x-line-signature': crypto.createHmac('sha256', secret).update(payload).digest('base64') };
    const result = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method: payload === undefined ? 'GET' : 'POST', headers }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end(payload);
    });
    await Promise.all(background.splice(0));
    return result;
  }
  const post = (account, changed = {}, options = {}) => request(options.path || `/api?account=${account.key}`, { destination: options.destination === undefined ? account.destination : options.destination, events: [{ ...event, ...changed }] }, options.secret || account.secret);

  await t.test('per-account health renders locally and never issues a token or reply', async () => {
    for (const account of accounts) {
      const response = await request(`/api?pilot=version&account=${account.key}`);
      assert.equal(response.status, 200);
      const health = JSON.parse(response.text);
      assert.equal(health.account, '@' + account.key);
      assert.equal(health.routerReady, true);
      assert.equal(health.welcomeReady, false);
      assert.equal(health.welcomeTextSha256, null);
      assert.equal(health.welcomeContentRevision, require('../welcome-messages.json').version);
    }
    assert.equal(tokenRequests.length, 0);
    assert.equal(newReplies.length, 0);
    assert.equal(legacyReplies.length, 0);
  });

  await t.test('each signed route replies using its own account token and fixed destination', async () => {
    for (const account of accounts) {
      const initial = newReplies.length;
      assert.equal((await post(account, { replyToken: 'reply-' + account.key })).status, 200);
      assert.equal(newReplies.length, initial + 1);
      assert.equal(newReplies.at(-1).account, account.key);
      assert.equal(newReplies.at(-1).replyToken, 'reply-' + account.key);
      assert.equal(newReplies.at(-1).messages[0].type, 'flex');
      assert.equal((await post(account, { type: 'postback', postback: { data: 'hgpilot:v1:buy' } })).status, 200);
      assert.equal(newReplies.length, initial + 2);
    }
    assert.deepEqual(tokenRequests.sort(), ['375umdzq', '528scwxf']);
    assert.equal(legacyReplies.length, 0);
  });

  await t.test('default and explicit 604 retain the old SDK reply and root webhook behavior', async () => {
    const initial = legacyReplies.length;
    const newCount = newReplies.length;
    for (const path of ['/api', '/', '/api?account=604gpqef']) {
      assert.equal((await request(path, { destination: DEFAULT_DESTINATION, events: [event] })).status, 200);
    }
    assert.equal(legacyReplies.length, initial + 3);
    assert.equal(newReplies.length, newCount);
    assert.equal((await request('/api', { destination: 'legacy-empty-verification', events: [] })).status, 200);
  });

  await t.test('invalid, duplicate, array and object selectors reject before any account handling', async () => {
    const initial = newReplies.length + legacyReplies.length;
    for (const selector of ['account=unknown', 'account=', 'account=528SCWXF', 'account=@528scwxf', 'account=528scwxf&account=375umdzq', 'account=528scwxf&account=528scwxf', 'account[]=528scwxf', 'account[0]=528scwxf', 'account[key]=528scwxf', 'account.key=528scwxf']) {
      const response = await request('/api?' + selector, { destination: accounts[0].destination, events: [event] }, accounts[0].secret);
      assert.equal(response.status, 400, selector);
      assert.doesNotMatch(response.text, /test-secret|test-default-secret|test-legacy-token/);
    }
    assert.equal(newReplies.length + legacyReplies.length, initial);
  });

  await t.test('signatures from the default or other new account cannot authenticate the selected account', async () => {
    const initial = newReplies.length + legacyReplies.length;
    for (const account of accounts) {
      for (const secret of ['test-default-secret', accounts.find(item => item.key !== account.key).secret]) {
        const response = await post(account, {}, { secret });
        assert.ok(response.status >= 400 && response.status < 500);
        assert.doesNotMatch(response.text, /test-secret|test-default-secret|test-legacy-token/);
      }
    }
    assert.equal(newReplies.length + legacyReplies.length, initial);
  });

  await t.test('correct signature with wrong or missing destination is rejected with 403', async () => {
    const initial = newReplies.length + legacyReplies.length;
    for (const account of accounts) {
      for (const destination of [DEFAULT_DESTINATION, accounts.find(item => item.key !== account.key).destination, '', null]) {
        assert.equal((await post(account, {}, { destination })).status, 403);
      }
      assert.equal((await request(`/api?account=${account.key}`, { events: [event] }, account.secret)).status, 403);
    }
    assert.equal(newReplies.length + legacyReplies.length, initial);
  });

  await t.test('missing configuration and missing exact opt-in return 503 with no fallback', async () => {
    const initial = newReplies.length + legacyReplies.length;
    for (const account of accounts) {
      for (const missing of [undefined, '', '   ']) {
        if (missing === undefined) delete process.env[account.secretEnv]; else process.env[account.secretEnv] = missing;
        assert.equal((await post(account)).status, 503);
      }
      process.env[account.secretEnv] = account.secret;
      for (const disabled of [undefined, 'false', 'TRUE', '1']) {
        if (disabled === undefined) delete process.env[account.flag]; else process.env[account.flag] = disabled;
        assert.equal((await post(account)).status, 503);
      }
      process.env[account.flag] = 'true';
    }
    assert.equal(newReplies.length + legacyReplies.length, initial);
  });

  await t.test('new accounts never enter legacy database or reply handlers for legacy commands', async () => {
    const initial = newReplies.length + legacyReplies.length;
    for (const account of accounts) {
      for (const text of ['估價', '估價 海安路', '租屋', '租屋 台南', '租金', '查租', '💰試算', '💰試算 海安路_大樓_新屋', '您好']) {
        assert.equal((await post(account, { message: { type: 'text', text } })).status, 200);
      }
      for (const changed of [{ source: { type: 'group' } }, { mode: 'standby' }, { type: 'follow' }]) assert.equal((await post(account, changed)).status, 200);
    }
    assert.equal(newReplies.length + legacyReplies.length, initial);
    assert.deepEqual(databaseRequests, []);
    const before = legacyReplies.length;
    assert.equal((await request('/api', { destination: DEFAULT_DESTINATION, events: [{ ...event, message: { type: 'text', text: '估價' } }] })).status, 200);
    assert.equal(legacyReplies.length, before + 1, 'default account retains legacy help handler');
  });

  await t.test('each welcome requires its own independent trusted policy approval', async () => {
    const { buildWelcomeReply } = await import('../lib/flow-router.mjs');
    for (const selected of accounts) {
      require.cache[policyPath].exports = { accounts: { ['@' + selected.key]: { nativeGreetingDisabledConfirmed: true } } };
      for (const account of accounts) {
        const before = newReplies.length;
        assert.equal((await post(account, { type: 'follow', nativeGreetingDisabledConfirmed: true })).status, 200);
        assert.equal(newReplies.length, before + (selected.key === account.key ? 1 : 0));
        if (selected.key === account.key) {
          assert.deepEqual(newReplies.at(-1).messages, buildWelcomeReply({ account: '@' + selected.key }).messages);
          assert.equal(newReplies.at(-1).account, selected.key);
          const health = JSON.parse((await request(`/api?pilot=version&account=${selected.key}`)).text);
          assert.equal(health.welcomeReady, true);
          assert.equal(health.welcomeTextSha256, crypto.createHash('sha256').update(newReplies.at(-1).messages[0].text).digest('hex'));
        }
      }
    }
    const before = newReplies.length;
    process.env.HG_SERVICE_WELCOME_ENABLED = 'false';
    assert.equal((await post(accounts[1], { type: 'follow' })).status, 200);
    delete process.env.HG_SERVICE_WELCOME_ENABLED;
    assert.equal(newReplies.length, before);
    assert.deepEqual(databaseRequests, []);
    assert.doesNotMatch(JSON.stringify(logs), /test-secret-528|test-secret-375|test-default-secret|test-legacy-token|offline-token-|offline-user-id|offline-reply/);
  });
});
