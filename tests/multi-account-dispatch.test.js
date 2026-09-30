const test = require('node:test');
const assert = require('node:assert/strict');
const { getPilotReply, PILOT_DESTINATION } = require('../lib/pilot-dispatch');
const { getServiceAccount, resolveRequestAccount, isAccountEnabled } = require('../lib/service-accounts');
const accounts = [
  { key: '528scwxf', destination: 'U84b618fe443161f9044ddf51334f58f1', channelId: '2009777750', flag: 'HG_SERVICE_PILOT_528SCWXF_ENABLED' },
  { key: '375umdzq', destination: 'U61e64edf2fdbe4903d535367212ebc6e', channelId: '2009791946', flag: 'HG_SERVICE_PILOT_375UMDZQ_ENABLED' }
];
const event = { type: 'message', mode: 'active', source: { type: 'user' }, replyToken: 'test-reply', message: { type: 'text', text: '宏國服務體驗' } };
const follow = { ...event, type: 'follow' };
const policyPath = require.resolve('../welcome-policy.json');
require(policyPath);

function setEnv(t, values) {
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
}

function setPolicy(t, policy) {
  const previous = require.cache[policyPath].exports;
  require.cache[policyPath].exports = policy;
  t.after(() => { require.cache[policyPath].exports = previous; });
}

test('allowed new accounts have fixed destinations and channel identifiers', () => {
  for (const account of accounts) {
    const descriptor = getServiceAccount(account.key);
    assert.equal(descriptor.destination, account.destination);
    assert.equal(String(descriptor.channelId), account.channelId);
    assert.equal(descriptor.legacy, false);
    assert.equal(getServiceAccount('@' + account.key), descriptor);
  }
  assert.equal(resolveRequestAccount({}).account, '@604gpqef');
  assert.equal(getServiceAccount('604gpqef').legacy, true);
});

test('selector rejects unrecognized, empty, object and multiple values instead of falling back', () => {
  for (const account of ['', 'unknown', '528SCWXF', ['528scwxf'], ['528scwxf', '375umdzq'], {}, null]) {
    assert.throws(() => resolveRequestAccount({ account }), error => error.status === 400, JSON.stringify(account));
  }
});

test('raw and parsed account selectors must agree and cannot hide inherited or accessor values', () => {
  for (const [query, url] of [[{}, '/api?account=unknown'], [{}, '/api?account=528scwxf'], [{ account: '528scwxf' }, '/api?account=375umdzq'], [{ account: '528scwxf' }, '/api?account=528scwxf&account=528scwxf'], [Object.create({ account: '528scwxf' }), '/api?account=528scwxf']]) {
    assert.throws(() => resolveRequestAccount(query, url), error => error.status === 400);
  }
  let getterRead = false;
  const query = Object.defineProperty({}, 'account', { get() { getterRead = true; return '528scwxf'; } });
  assert.throws(() => resolveRequestAccount(query, '/api?account=528scwxf'), error => error.status === 400);
  assert.equal(getterRead, false);
  assert.equal(resolveRequestAccount({ account: '528scwxf' }, '/api?account=528scwxf').account, '@528scwxf');
});

test('new account opt-in requires its own exact true; default 604 remains enabled by default', async t => {
  setEnv(t, { HG_SERVICE_PILOT_ENABLED: undefined });
  assert.equal(isAccountEnabled('604gpqef', {}), true);
  assert.equal((await getPilotReply(event, PILOT_DESTINATION)).route, 'home');
  for (const account of accounts) {
    setEnv(t, { [account.flag]: undefined });
    for (const value of [undefined, 'false', 'TRUE', '1', ' true ']) {
      if (value === undefined) delete process.env[account.flag]; else process.env[account.flag] = value;
      assert.equal(await getPilotReply(event, account.destination, { account: account.key }), null, `${account.key}: ${value}`);
    }
    process.env[account.flag] = 'true';
    assert.equal((await getPilotReply(event, account.destination, { account: account.key })).route, 'home');
    assert.equal(await getPilotReply(event, account.destination), null, 'default routing must never infer a new account from destination');
  }
});

test('new account dispatch keeps destination and event gates and never claims legacy keywords', async t => {
  setEnv(t, Object.fromEntries(accounts.map(account => [account.flag, 'true'])));
  for (const account of accounts) {
    const options = { account: account.key };
    assert.equal(await getPilotReply(event, PILOT_DESTINATION, options), null);
    for (const changed of [{ source: { type: 'group' } }, { source: { type: 'room' } }, { source: undefined }, { mode: 'standby' }, { mode: undefined }, { replyToken: '' }, { replyToken: 123 }, { replyToken: 'x'.repeat(257) }]) {
      assert.equal(await getPilotReply({ ...event, ...changed }, account.destination, options), null);
    }
    for (const text of ['估價', '租屋', '租金', '查租', '💰試算', '我要買房', '您好']) {
      assert.equal(await getPilotReply({ ...event, message: { type: 'text', text } }, account.destination, options), null);
    }
    assert.equal((await getPilotReply({ ...event, type: 'postback', postback: { data: 'hgpilot:v1:owner' } }, account.destination, options)).route, 'owner');
  }
});

test('welcome permission is independent for each account and cannot come from event claims', async t => {
  setEnv(t, { HG_SERVICE_PILOT_ENABLED: undefined, HG_SERVICE_WELCOME_ENABLED: undefined, ...Object.fromEntries(accounts.map(account => [account.flag, 'true'])) });
  setPolicy(t, { accounts: {} });
  const { buildWelcomeReply } = await import('../lib/flow-router.mjs');
  for (const selected of ['604gpqef', ...accounts.map(account => account.key)]) {
    require.cache[policyPath].exports = { accounts: { ['@' + selected]: { nativeGreetingDisabledConfirmed: true } } };
    for (const account of [{ key: '604gpqef', destination: PILOT_DESTINATION }, ...accounts]) {
      const reply = await getPilotReply({ ...follow, nativeGreetingDisabledConfirmed: true, account: '@' + selected }, account.destination, { account: account.key });
      if (account.key === selected) assert.deepEqual(reply, buildWelcomeReply({ account: '@' + selected }));
      else assert.equal(reply, null, `${selected} approval must not authorize ${account.key}`);
    }
  }
  for (const account of accounts) {
    for (const value of [false, 'true', 1, undefined]) {
      require.cache[policyPath].exports = { accounts: { ['@' + account.key]: { nativeGreetingDisabledConfirmed: value } } };
      assert.equal(await getPilotReply(follow, account.destination, { account: account.key }), null);
      assert.equal((await getPilotReply(event, account.destination, { account: account.key })).route, 'home');
    }
  }
});
