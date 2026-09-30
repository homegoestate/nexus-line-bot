const test = require('node:test');
const assert = require('node:assert/strict');
const { createStatelessLineClient } = require('../lib/stateless-line-client');

const TOKEN_URL = 'https://api.line.me/oauth2/v3/token';
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const message = [{ type: 'text', text: 'offline test only' }];
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function harness(options = {}) {
  let currentTime = 100_000;
  const calls = [];
  let tokenNumber = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === TOKEN_URL) return response({ access_token: `test-token-${++tokenNumber}`, expires_in: 3600, token_type: 'Bearer' });
    assert.equal(url, REPLY_URL, 'all network requests must use a mocked expected endpoint');
    return response({ sentMessages: [] });
  };
  const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', fetchImpl, now: () => currentTime, ...options });
  return { client, calls, setTime: value => { currentTime = value; }, tokenCalls: () => calls.filter(call => call.url === TOKEN_URL), replyCalls: () => calls.filter(call => call.url === REPLY_URL) };
}

test('stateless client is lazy and exchanges only its own credentials before replying', async () => {
  const h = harness();
  assert.equal(h.calls.length, 0);
  await h.client.replyMessage('reply-one', message);
  assert.equal(h.tokenCalls().length, 1);
  const exchange = h.tokenCalls()[0].init;
  assert.equal(exchange.method, 'POST');
  const body = new URLSearchParams(exchange.body);
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_id'), '2000000001');
  assert.equal(body.get('client_secret'), 'private-secret');
  const reply = h.replyCalls()[0].init;
  assert.equal(reply.method, 'POST');
  assert.equal(new Headers(reply.headers).get('authorization'), 'Bearer test-token-1');
  assert.deepEqual(JSON.parse(reply.body), { replyToken: 'reply-one', messages: message });
});

test('token cache reuses before and refreshes at expiry minus the 60 second safety margin', async () => {
  const h = harness();
  await h.client.replyMessage('first', message);
  h.setTime(100_000 + (3600 - 60) * 1000 - 1);
  await h.client.replyMessage('still-valid', message);
  assert.equal(h.tokenCalls().length, 1);
  h.setTime(100_000 + (3600 - 60) * 1000);
  await h.client.replyMessage('refresh-now', message);
  assert.equal(h.tokenCalls().length, 2);
  assert.deepEqual(h.replyCalls().map(call => new Headers(call.init.headers).get('authorization')), ['Bearer test-token-1', 'Bearer test-token-1', 'Bearer test-token-2']);
});

test('concurrent replies share a single token exchange but retain their own reply payloads', async () => {
  let releaseExchange;
  const pendingExchange = new Promise(resolve => { releaseExchange = resolve; });
  let exchanges = 0;
  const replies = [];
  const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'one-secret', fetchImpl: async (url, init) => {
    if (url === TOKEN_URL) { exchanges++; await pendingExchange; return response({ access_token: 'shared-token', expires_in: 3600 }); }
    assert.equal(url, REPLY_URL);
    replies.push(JSON.parse(init.body));
    return response({});
  } });
  const work = ['one', 'two', 'three'].map(replyToken => client.replyMessage(replyToken, message));
  await Promise.resolve();
  assert.equal(exchanges, 1);
  assert.equal(replies.length, 0);
  releaseExchange();
  await Promise.all(work);
  assert.deepEqual(replies.map(reply => reply.replyToken).sort(), ['one', 'three', 'two']);
});

test('different account clients never share token caches or authorization headers', async () => {
  const exchanges = [];
  const replies = [];
  const fetchImpl = async (url, init) => {
    if (url === TOKEN_URL) {
      const credentials = new URLSearchParams(init.body);
      exchanges.push([credentials.get('client_id'), credentials.get('client_secret')]);
      return response({ access_token: `token-for-${credentials.get('client_id')}`, expires_in: 3600 });
    }
    assert.equal(url, REPLY_URL);
    replies.push([JSON.parse(init.body).replyToken, new Headers(init.headers).get('authorization')]);
    return response({});
  };
  const first = createStatelessLineClient({ channelId: '2000000528', channelSecret: 'secret-528', fetchImpl });
  const second = createStatelessLineClient({ channelId: '2000000375', channelSecret: 'secret-375', fetchImpl });
  await Promise.all([first.replyMessage('528-a', message), second.replyMessage('375-a', message)]);
  await Promise.all([first.replyMessage('528-b', message), second.replyMessage('375-b', message)]);
  assert.deepEqual(exchanges.sort(), [['2000000375', 'secret-375'], ['2000000528', 'secret-528']]);
  assert.deepEqual(replies.sort(), [['375-a', 'Bearer token-for-2000000375'], ['375-b', 'Bearer token-for-2000000375'], ['528-a', 'Bearer token-for-2000000528'], ['528-b', 'Bearer token-for-2000000528']]);
});

test('failed shared token exchange reaches no reply and permits a later recovery', async () => {
  let exchanges = 0;
  let replies = 0;
  const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', fetchImpl: async url => {
    if (url === TOKEN_URL) {
      exchanges++;
      if (exchanges === 1) return response({ error: 'private-secret' }, 503);
      return response({ access_token: 'recovered-token', expires_in: 3600 });
    }
    assert.equal(url, REPLY_URL);
    replies++;
    return response({});
  } });
  const failed = await Promise.allSettled([client.replyMessage('a', message), client.replyMessage('b', message)]);
  assert.equal(exchanges, 1);
  assert.equal(replies, 0);
  assert.ok(failed.every(result => result.status === 'rejected'));
  for (const result of failed) assert.doesNotMatch(String(result.reason), /private-secret/);
  await client.replyMessage('c', message);
  assert.equal(exchanges, 2);
  assert.equal(replies, 1);
});

test('invalid expiry never enters cache or sends a reply', async () => {
  for (const expires_in of [undefined, null, 0, -1, '3600', Number.NaN, Number.POSITIVE_INFINITY]) {
    let calls = 0;
    const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', fetchImpl: async url => {
      assert.equal(url, TOKEN_URL);
      calls++;
      return response({ access_token: 'private-token', expires_in });
    } });
    await assert.rejects(client.replyMessage('a', message), `invalid expiry ${String(expires_in)}`);
    await assert.rejects(client.replyMessage('b', message));
    assert.equal(calls, 2, 'failed token must not be cached');
  }
});

test('empty or invalid access tokens never send replies', async () => {
  for (const access_token of [undefined, null, '', 42]) {
    const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', fetchImpl: async url => {
      assert.equal(url, TOKEN_URL);
      return response({ access_token, expires_in: 3600 });
    } });
    await assert.rejects(client.replyMessage('a', message));
  }
});

test('token transport and response parsing failures expose no credentials and recover', async t => {
  const logs = [];
  for (const method of ['error', 'warn', 'info', 'log']) t.mock.method(console, method, (...args) => logs.push(args));
  for (const fail of [async () => { throw new Error('private-secret private-token'); }, async () => ({ ok: true, status: 200, json: async () => { throw new Error('private-secret private-token'); } })]) {
    let failing = true;
    const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', fetchImpl: async url => {
      if (url === TOKEN_URL) {
        if (failing) return fail();
        return response({ access_token: 'private-token', expires_in: 3600 });
      }
      assert.equal(url, REPLY_URL);
      return response({});
    } });
    await assert.rejects(client.replyMessage('a', message), error => !/private-secret|private-token/.test(JSON.stringify(error) + String(error) + (error.stack || '')));
    failing = false;
    await client.replyMessage('b', message);
  }
  assert.doesNotMatch(JSON.stringify(logs), /private-secret|private-token/);
});

test('reply HTTP or transport failure never retries a possibly consumed reply token', async t => {
  const logs = [];
  for (const method of ['error', 'warn', 'info', 'log']) t.mock.method(console, method, (...args) => logs.push(args));
  for (const mode of ['http', 'transport']) {
    let exchanges = 0;
    let replies = 0;
    const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', fetchImpl: async url => {
      if (url === TOKEN_URL) { exchanges++; return response({ access_token: 'private-token', expires_in: 3600 }); }
      assert.equal(url, REPLY_URL);
      replies++;
      if (mode === 'transport') throw new Error('private-secret private-token');
      return response({ message: 'private-token private-secret' }, 401);
    } });
    await assert.rejects(client.replyMessage('single-use-reply', message), error => !/private-secret|private-token/.test(JSON.stringify(error) + String(error) + (error.stack || '')));
    assert.equal(exchanges, 1);
    assert.equal(replies, 1);
  }
  assert.doesNotMatch(JSON.stringify(logs), /private-secret|private-token/);
});

test('positive short-lived tokens have no reusable cache inside the safety margin', async () => {
  for (const expires_in of [1, 60]) {
    let exchanges = 0;
    let replies = 0;
    const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', now: () => 1000, fetchImpl: async url => {
      if (url === TOKEN_URL) { exchanges++; return response({ access_token: 'short-lived-token', expires_in }); }
      assert.equal(url, REPLY_URL);
      replies++;
      return response({});
    } });
    await client.replyMessage('a', message);
    await client.replyMessage('b', message);
    assert.equal(exchanges, 2);
    assert.equal(replies, 2);
  }
});

test('token timeout rejects without replying and late success cannot seed the next cache', async () => {
  for (const stage of ['fetch', 'json']) {
    let finishLateRequest;
    const lateResult = new Promise(resolve => { finishLateRequest = resolve; });
    let exchanges = 0;
    const replies = [];
    const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', timeoutMs: 20, fetchImpl: async (url, init) => {
      if (url === TOKEN_URL) {
        exchanges++;
        if (exchanges === 1) {
          if (stage === 'fetch') return lateResult;
          return { ok: true, status: 200, json: async () => lateResult };
        }
        return response({ access_token: 'fresh-token', expires_in: 3600 });
      }
      assert.equal(url, REPLY_URL);
      replies.push(new Headers(init.headers).get('authorization'));
      return response({});
    } });
    await assert.rejects(client.replyMessage('timed-out', message), error => error.code === 'LINE_TOKEN_TIMEOUT');
    assert.deepEqual(replies, []);
    const expiredRequestPayload = { access_token: 'late-private-token', expires_in: 3600 };
    finishLateRequest(stage === 'fetch' ? response(expiredRequestPayload) : expiredRequestPayload);
    await new Promise(resolve => setImmediate(resolve));
    await client.replyMessage('recovered', message);
    assert.equal(exchanges, 2, `${stage} timeout must not leave a reusable token`);
    assert.deepEqual(replies, ['Bearer fresh-token']);
  }
});

test('reply timeout does not retry the message or token exchange', async () => {
  let exchanges = 0;
  let replies = 0;
  const client = createStatelessLineClient({ channelId: '2000000001', channelSecret: 'private-secret', timeoutMs: 20, fetchImpl: async url => {
    if (url === TOKEN_URL) { exchanges++; return response({ access_token: 'private-token', expires_in: 3600 }); }
    assert.equal(url, REPLY_URL);
    replies++;
    return new Promise(() => {});
  } });
  await assert.rejects(client.replyMessage('possibly-consumed-reply', message), error => error.code === 'LINE_REPLY_TIMEOUT');
  assert.equal(exchanges, 1);
  assert.equal(replies, 1);
});
