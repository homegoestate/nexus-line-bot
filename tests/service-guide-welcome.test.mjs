import test from 'node:test';
import assert from 'node:assert/strict';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import theme from '../lib/brand-theme.js';
import { buildWelcomeReply, routeEvent, PILOT_PREFIX, OWNER_REGISTER_URI } from '../lib/flow-router.mjs';
import { buildNativeGuide, PREFIX, LEGACY_PREFIX, EXISTING_SERVICE_KEYWORDS, PROCESS_STEP_TITLES } from '../lib/native-chat-guide.mjs';

const event = { type: 'message', mode: 'active', source: { type: 'user' }, replyToken: 'offline-only', message: { type: 'text', text: '服務導覽' } };
const expectedKeywords = {
  '@604gpqef': ['買賣', '簽約', '貸款規定', '公司簽約', '收支比', '申請加入 宏國地政 | 易丞地政 VIP社群'],
  '@528scwxf': ['買賣', '簽約', '貸款', '公司簽約', '收支比', '申請加入 宏國地政 | 易丞地政 VIP社群'],
  '@375umdzq': ['買賣', '簽約', '貸款規定', '公司簽約', '收支比', '申請加入 宏國地政 | 易丞地政 VIP社群'],
};
function walk(value, fn) {
  if (!value || typeof value !== 'object') return;
  fn(value);
  Object.values(value).forEach(child => walk(child, fn));
}
function actions(value, type) {
  const out = [];
  walk(value, node => { if (node.type === type && node.label) out.push(node); });
  return out;
}
function enable(t, account) {
  for (const [key, value] of [
    ['HG_SERVICE_PILOT_ENABLED', 'true'], ['HG_SERVICE_WELCOME_ENABLED', 'true'],
    [account.enabledEnv, 'true'], [config.NATIVE_TEST_FLAGS[account.key], 'true'],
    [config.NATIVE_PUBLIC_FLAGS[account.key], 'true'], [config.NATIVE_DOCUMENT_FLAGS[account.key], 'false'],
  ].filter(([key]) => key)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
}
const send = (account, changes = {}) => dispatch.getPilotReply({ ...event, ...changes }, account.destination, { account: account.key });
const click = (account, data) => send(account, { type: 'postback', postback: { data } });

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  test(`${account.account}: welcome starts with service guide and retains both ordered six-flow pages`, async t => {
    enable(t, account);
    const welcome = await send(account, { type: 'follow' });
    assert.equal(welcome.route, 'welcome');
    assert.equal(welcome.messages.length, 2);
    assert.match(welcome.messages[0].text, /服務導覽/);
    assert.match(welcome.messages[0].text, /06-258-2589/);
    assert.match(welcome.messages[0].text, /請先勿傳送身分證、帳戶或完整契約/);
    const cards = welcome.messages[1].contents.contents;
    assert.deepEqual(cards.map(card => card.body.contents[0].text), ['服務導覽', '買賣與房貸', '傳承、土地與交屋']);
    assert.deepEqual(actions(cards.slice(1), 'postback').map(a => a.data), ['buy', 'sell', 'loan', 'inherit', 'land', 'owner'].map(route => PILOT_PREFIX + route));
    const entry = actions(cards[0], 'postback').find(a => a.label === '開啟服務導覽');
    assert.equal(entry.data, PREFIX + 'home');
    assert.equal((await click(account, entry.data)).route, 'native:home');
    assert.equal(cards[0].styles.header.backgroundColor, theme.primary);
    assert.doesNotMatch(JSON.stringify(welcome.messages), /測試服務導覽|測試導覽/);
  });

  test(`${account.account}: reordered A–F labels send only B–F to the exact verified native OA keywords`, async t => {
    enable(t, account);
    const result = await click(account, PREFIX + 'services');
    assert.equal(result.route, 'native:services');
    assert.deepEqual(EXISTING_SERVICE_KEYWORDS[account.account], expectedKeywords[account.account]);
    const ordered = result.messages[0].contents.contents.flatMap(card => card.footer.contents.map(button => button.action));
    assert.deepEqual(ordered.map(a => a.label), ['買賣過戶', '貸款規劃', '收支比試算', '法人簽約', '自然人簽約', '加入社群']);
    assert.deepEqual(ordered[0], { type: 'postback', label: '買賣過戶', data: PREFIX + 'process', displayText: '查看買賣過戶' });
    const buttons = actions(result, 'message');
    assert.deepEqual(buttons.map(a => a.text), [2, 4, 3, 1, 5].map(index => expectedKeywords[account.account][index]));
    assert.equal(buttons.length, 5);
    assert.match(JSON.stringify(result.messages), /查看交易流程總覽/);
    for (const button of buttons) {
      assert.equal(await send(account, { message: { type: 'text', text: button.text } }), null);
      assert.equal(routeEvent({ ...event, message: { type: 'text', text: button.text } }, { account: account.account }), null);
    }
    for (const text of ['官方', '官方服務', '買賣', '交易流程', '貸款應備', '新青安', '簽約文件－自然人', '簽約文件－公司法人'])
      assert.equal(await send(account, { message: { type: 'text', text } }), null, text);
    assert.doesNotMatch(JSON.stringify(result.messages), /3000|3,000|5000|5,000|10000|10,000|6000|6,000|免費估價|https?:\/\//);
  });

  test(`${account.account}: service A and the existing backend text entry open all eight stages directly`, async t => {
    enable(t, account);
    const services = await click(account, PREFIX + 'services');
    const actionA = services.messages[0].contents.contents[0].footer.contents[0].action;
    const overview = await click(account, actionA.data);
    assert.equal(overview.route, 'native:process');
    assert.deepEqual(overview, await send(account, { message: { type: 'text', text: '服務導覽：交易流程' } }));
    const cards = overview.messages[0].contents.contents;
    assert.equal(cards.length, 8);
    assert.deepEqual(cards.map(card => card.body.contents[1].text), PROCESS_STEP_TITLES.map((title, index) => `${String(index + 1).padStart(2, '0')} ${title}`));
    for (let n = 1; n <= 8; n++) {
      const step = cards[n - 1].footer.contents[0].action;
      assert.equal(step.data, PREFIX + 'step:' + n);
      assert.equal((await click(account, step.data)).route, 'native:step:' + n);
    }
    assert.doesNotMatch(JSON.stringify(overview.messages), /https?:\/\/|影片|影片連結/);
    for (const text of ['交易流程總覽', '服務導覽：交易流程 ', '買賣過戶', '貸款規劃', '收支比試算', '法人簽約', '自然人簽約', '加入社群'])
      assert.equal(await send(account, { message: { type: 'text', text } }), null, text);
  });

  test(`${account.account}: reserved aliases and both menus connect without claiming original official entry`, async t => {
    enable(t, account);
    for (const [text, route] of [
      ['服務導覽', 'native:home'], ['服務導覽：總覽', 'native:home'],
      ['服務導覽：官方六項服務', 'native:services'], ['服務導覽：官方服務', 'native:services'],
      ['備件清單', 'native:finance'], ['宏國服務體驗', 'home'],
    ]) assert.equal((await send(account, { message: { type: 'text', text } })).route, route, text);
    const guide = await send(account);
    assert.ok(actions(guide, 'postback').some(a => a.data === PREFIX + 'services'));
    const back = actions(guide, 'message').find(a => a.label === '其他需求與屋主登錄');
    assert.equal(back.text, '宏國服務體驗');
    assert.equal((await send(account, { message: { type: 'text', text: back.text } })).route, 'home');
    const services = await click(account, PREFIX + 'services');
    assert.ok(actions(services, 'postback').some(a => a.data === PREFIX + 'home'));
  });

  test(`${account.account}: historical cards and owner URI remain usable from the integrated entry`, async t => {
    enable(t, account);
    for (const route of ['home', 'buy', 'sell', 'loan', 'inherit', 'land', 'owner'])
      assert.equal((await click(account, PILOT_PREFIX + route)).route, route);
    assert.equal((await click(account, LEGACY_PREFIX + 'home')).route, 'native:home');
    for (let n = 1; n <= 8; n++) {
      assert.equal((await click(account, LEGACY_PREFIX + 'step:' + n)).route, 'native:step:' + (n >= 7 ? 8 : n));
      assert.equal((await click(account, PREFIX + 'step:' + n)).route, 'native:step:' + n);
    }
    const registration = await click(account, PILOT_PREFIX + 'owner:guide:prepare');
    assert.deepEqual(actions(registration, 'uri'), [{ type: 'uri', label: '前往正式登錄', uri: OWNER_REGISTER_URI }]);
    assert.match(OWNER_REGISTER_URI, /view=register&oa=604gpqef$/);
    assert.equal((await click(account, PREFIX + 'docs:old')).route, 'native:finance');
  });

  test(`${account.account}: unmatched text and untrusted contexts do not start the guide`, async t => {
    enable(t, account);
    for (const text of ['服務導覽 ', '服務導覽：不存在', '官方服務 ', '買賣', '公司簽約', '交易流程', '我有問題'])
      assert.equal(await send(account, { message: { type: 'text', text } }), null, text);
    for (const changes of [
      { source: { type: 'group' } }, { source: { type: 'room' } }, { mode: 'standby' },
      { replyToken: '' }, { replyToken: 'x'.repeat(257) }, { type: 'message', message: { type: 'image' } },
    ]) assert.equal(await send(account, changes), null);
    assert.equal(await dispatch.getPilotReply(event, 'wrong-destination', { account: account.key }), null);
    assert.equal(await dispatch.getPilotReply(event, account.destination, { account: 'unknown' }), null);
    assert.equal((await click(account, PREFIX + 'services:unknown')).route, 'native:invalid');
  });

  test(`${account.account}: repeated follows, taps and redelivery produce one fresh reply envelope per trigger`, async t => {
    enable(t, account);
    for (const changes of [
      { type: 'follow' }, { type: 'postback', postback: { data: PREFIX + 'home' } },
      { type: 'postback', postback: { data: PREFIX + 'services' } },
      { type: 'postback', postback: { data: PREFIX + 'process' } },
      { type: 'message', message: { type: 'text', text: '服務導覽：交易流程' } },
    ]) {
      const original = await send(account, changes);
      const repeated = await Promise.all(Array.from({ length: 20 }, () => send(account, {
        ...changes, deliveryContext: { isRedelivery: true }, webhookEventId: 'offline-event',
      })));
      for (const result of repeated) assert.deepEqual(result, original);
      assert.equal(original.messages.length, changes.type === 'follow' ? 2 : 1);
      repeated[0].messages[0].type = 'mutated';
      assert.deepEqual(await send(account, changes), original);
      assert.doesNotMatch(JSON.stringify(original), /offline-event|offline-only/);
    }
  });
}

test('service card gating remains account-specific and does not alter stored rollout configuration', t => {
  for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
    enable(t, account);
    const options = { account: account.account };
    for (const flag of [config.NATIVE_TEST_FLAGS[account.key], config.NATIVE_PUBLIC_FLAGS[account.key]]) {
      delete process.env[flag];
      const welcome = buildWelcomeReply(options);
      assert.equal(welcome.messages[1].contents.contents.length, 2);
      assert.deepEqual(actions(welcome.messages[1], 'postback').map(a => a.data), ['buy', 'sell', 'loan', 'inherit', 'land', 'owner'].map(route => PILOT_PREFIX + route));
      process.env[flag] = 'true';
    }
    assert.equal(buildWelcomeReply(options).messages[1].contents.contents.length, 3);
  }
});

test('six-service content varies only by the verified personal loan message and does not accept unknown OA copy', () => {
  const official = buildNativeGuide('services', { account: '@604gpqef' });
  const personal = buildNativeGuide('services', { account: '@528scwxf' });
  const project = buildNativeGuide('services', { account: '@375umdzq' });
  assert.deepEqual(official, project);
  assert.notDeepEqual(official, personal);
  for (const account of ['@unknown', 'toString', '__proto__', ''])
    assert.equal(buildNativeGuide('services', { account }).route, 'native:invalid');
  assert.equal(buildWelcomeReply({ account: '@unknown' }), null);
});
