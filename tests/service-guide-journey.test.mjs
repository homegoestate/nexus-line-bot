import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeGuide, PREFIX, LEGACY_PREFIX, EXISTING_SERVICE_KEYWORDS, ROUTES } from '../lib/native-chat-guide.mjs';
import { buildTransactionEntryCandidate } from '../lib/service-entry-candidate.mjs';
import { buildTransactionProcessImageMessage } from '../lib/transaction-process-image.mjs';
import { VIDEO_NATIVE_ALIASES } from '../lib/video-playlists.mjs';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';

const base = { mode: 'active', replyToken: 'offline-journey-only', source: { type: 'user' } };
function enable(t, account) {
  for (const key of ['HG_SERVICE_PILOT_ENABLED', account.enabledEnv, config.NATIVE_TEST_FLAGS[account.key], config.NATIVE_PUBLIC_FLAGS[account.key]].filter(Boolean)) {
    const old = process.env[key];
    process.env[key] = 'true';
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
}
function actions(value) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['postback', 'message', 'uri'].includes(node.type)) found.push(node);
    Object.values(node).forEach(visit);
  }
  visit(value);
  return found;
}
function buttons(view) {
  return view.messages[0].contents.contents.flatMap(card => card.footer.contents.map(button => button.action));
}
const send = (account, sourceType, action) => dispatch.getPilotReply({
  ...base, source: { type: sourceType }, type: action.type === 'postback' ? 'postback' : 'message',
  ...(action.type === 'postback' ? { postback: { data: action.data } } : { message: { type: 'text', text: action.text } }),
}, account.destination, { account: account.key });

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  test(account.account + ': A starts with roles and the original eight stages; B hands off once to the existing native first-card receiver', async t => {
    enable(t, account);
    for (const type of ['user', 'group', 'room']) {
      const menu = await send(account, type, { type: 'postback', data: PREFIX + 'services' });
      const six = buttons(menu);
      assert.equal(six.length, 6);
      assert.equal(six[0].data, PREFIX + 'entry:buy');
      assert.deepEqual(six[1], { type: 'message', label: '貸款規劃', text: account.key === '528scwxf' ? '貸款' : '貸款規定' });
      assert.equal(await send(account, type, six[1]), null, 'native owns its income entry, original text and videos; webhook adds no duplicate reply');
      assert.deepEqual(six.slice(2).map(action => action.text), [
        '收支比', '公司簽約', '簽約', '申請加入 宏國地政 | 易丞地政 VIP社群',
      ]);
      const buy = await send(account, type, six[0]);
      assert.equal(buy.route, 'native:entry:buy');
      assert.deepEqual(buy.messages.map(message => message.type), ['flex', 'image', 'flex']);
      assert.deepEqual(buy.messages, buildTransactionEntryCandidate({ account: account.account }).messages);
      assert.deepEqual(buy.messages[1], buildTransactionProcessImageMessage());
      assert.deepEqual(buy.messages[2], buildNativeGuide('process', { account: account.account }).messages[0]);
      for (const role of ['buyer', 'seller']) {
        const roleButton = actions(buy.messages[0]).find(action => action.data === PREFIX + role);
        assert.ok(roleButton);
        const preparation = await send(account, type, roleButton);
        assert.equal(preparation.route, 'native:' + role);
        const stagesButton = actions(preparation).find(action => action.data === PREFIX + 'process:' + role);
        const stages = await send(account, type, stagesButton);
        assert.equal(stages.messages[0].contents.contents.length, 8);
      }
      const finance = await send(account, type, { type: 'message', text: '服務導覽：貸款收入證明' });
      assert.equal(finance.route, 'native:finance');
      assert.equal(finance.messages[0].contents.contents.length, 2);
      for (const category of ['salary', 'business', 'pension', 'rental', 'other']) {
        assert.ok(actions(finance).some(action => action.data === PREFIX + 'finance:' + category));
      }
      const bridges = actions(finance).filter(action => action.label === '原貸款文字／影片');
      assert.equal(bridges.length, 0, 'income guide must not reissue the native package and repeat its first card');
      const options = await send(account, type, { type: 'message', text: '服務導覽：貸款選項' });
      assert.equal(options.route, 'native:finance:options');
      assert.ok(finance.messages[0].quickReply.items.length <= 13);
      assert.ok(finance.messages[0].quickReply.items.every(item => item.action.label.length <= 20));
    }
  });

  test(account.account + ': back, repeated clicks and old callbacks produce one deterministic route result per dispatch', async t => {
    enable(t, account);
    for (const type of ['user', 'group', 'room']) {
      for (const route of ['services', 'entry:buy', 'finance', 'home', 'process']) {
        const action = { type: 'postback', data: PREFIX + route };
        const first = await send(account, type, action);
        const second = await send(account, type, action);
        assert.deepEqual(second, first);
        assert.equal(first.messages.length, route === 'entry:buy' ? 3 : 1);
      }
      const finance = await send(account, type, { type: 'postback', data: PREFIX + 'finance' });
      const back = actions(finance).find(action => action.label === '返回上一層');
      assert.equal((await send(account, type, back)).route, 'native:home');
      const overview = await send(account, type, { type: 'postback', data: PREFIX + 'process' });
      assert.equal(overview.messages.length, 1, 'old eight-stage callback is not redirected');
      assert.equal(overview.messages[0].contents.contents.length, 8);
      const options = await send(account, type, { type: 'postback', data: PREFIX + 'finance:options' });
      const qingan = actions(options).find(action => action.label === '新青安3.0');
      assert.deepEqual(qingan, { type: 'message', label: '新青安3.0', text: '新青安' });
    }
    const legacy = await send(account, 'user', { type: 'postback', data: LEGACY_PREFIX + 'process' });
    assert.deepEqual(legacy, buildNativeGuide('process', { account: account.account }));
  });

  test(account.account + ': native content aliases and unknown texts remain pass-through, never copied into the webhook', async t => {
    enable(t, account);
    const texts = new Set([...EXISTING_SERVICE_KEYWORDS[account.account], ...VIDEO_NATIVE_ALIASES,
      '新青安', '簽約文件－自然人', '簽約文件－公司法人', '官方服務', '未命中服務文字', '服務導覽：未知', '服務導覽：買賣過戶入口 ']);
    for (const type of ['user', 'group', 'room']) for (const text of texts) {
      assert.equal(await send(account, type, { type: 'message', text }), null, type + ': ' + text);
    }
  });
}

test('all income subflows avoid raw native loan re-entry while keeping their existing program navigation', () => {
  for (const account of Object.keys(EXISTING_SERVICE_KEYWORDS)) for (const route of ROUTES.filter(route => route === 'finance' || route.startsWith('finance:'))) {
    const view = buildNativeGuide(route, { account });
    assert.ok(!actions(view).some(action => action.label === '原貸款文字／影片'));
    assert.ok(!actions(view).some(action => action.type === 'message' && ['貸款', '貸款規定'].includes(action.text)), account + ' ' + route);
    assert.ok(actions(view).some(action => action.type === 'postback' && action.data.startsWith(PREFIX)), 'income paths retain program navigation');
  }
});
