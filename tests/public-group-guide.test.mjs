import test from 'node:test';
import assert from 'node:assert/strict';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import { routeEvent } from '../lib/flow-router.mjs';
import { PREFIX, ROUTES, TEXT_ACTIONS, buildNativeGuide, routeNativeGuide, PROCESS_STEP_TITLES } from '../lib/native-chat-guide.mjs';

const base = { type: 'message', mode: 'active', replyToken: 'offline-group-reply', message: { type: 'text', text: '服務導覽：交易流程' } };
const source = type => ({ type, userId: 'PRIVATE_USER', groupId: 'PRIVATE_GROUP', roomId: 'PRIVATE_ROOM' });
const eventFor = type => ({ ...base, source: source(type) });
function enable(t, account) {
  for (const name of [account.enabledEnv, config.NATIVE_TEST_FLAGS[account.key], config.NATIVE_PUBLIC_FLAGS[account.key], config.NATIVE_DOCUMENT_FLAGS[account.key]].filter(Boolean)) {
    const old = process.env[name]; process.env[name] = 'true';
    t.after(() => old === undefined ? delete process.env[name] : process.env[name] = old);
  }
}
function walk(value, fn) {
  if (!value || typeof value !== 'object') return;
  fn(value); Object.values(value).forEach(child => walk(child, fn));
}

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  for (const type of ['user', 'group', 'room']) {
    test(`${account.account} ${type}: A text and callback return the complete public eight-stage overview`, async t => {
      enable(t, account);
      const event = eventFor(type), options = { account: account.account };
      const expected = buildNativeGuide('process', options);
      for (const input of [event, { ...event, type: 'postback', postback: { data: PREFIX + 'process' } }]) {
        assert.deepEqual(routeNativeGuide(input, account.account), expected);
        assert.deepEqual(routeEvent(input, options), expected);
        const result = await dispatch.getPilotReply(input, account.destination, { account: account.key });
        assert.deepEqual(result, expected);
        assert.equal(result.messages.length, 1);
        assert.deepEqual(result.messages[0].contents.contents.map(card => card.body.contents[1].text), PROCESS_STEP_TITLES.map((title, index) => `${String(index + 1).padStart(2, '0')} ${title}`));
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|offline-group-reply/);
      }
    });

    test(`${account.account} ${type}: exact public navigation remains usable without revealing event identities`, async t => {
      enable(t, account);
      const event = eventFor(type);
      for (const route of ROUTES) {
        const input = { ...event, type: 'postback', postback: { data: PREFIX + route } };
        const result = await dispatch.getPilotReply(input, account.destination, { account: account.key });
        assert.equal(result.route, 'native:' + route);
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|offline-group-reply|hgchat:v2:docs:|hgchat-test:v1:docs:/);
        walk(result, node => {
          if (node.type === 'postback') assert.ok(ROUTES.includes(node.data.slice(PREFIX.length)), node.data);
          if (['group', 'room'].includes(type) && node.type === 'message') assert.notEqual(node.text, '宏國服務體驗');
        });
      }
      for (const [text, route] of Object.entries(TEXT_ACTIONS)) {
        const result = await dispatch.getPilotReply({ ...event, message: { type: 'text', text } }, account.destination, { account: account.key });
        assert.equal(result.route, 'native:' + route, text);
      }
      const expected = await dispatch.getPilotReply(event, account.destination, { account: account.key });
      for (let n = 0; n < 10; n++) assert.deepEqual(await dispatch.getPilotReply({ ...event, deliveryContext: { isRedelivery: true } }, account.destination, { account: account.key }), expected);
    });

    test(`${account.account} ${type}: account identity, active-mode and reply-token gates remain enforced`, async t => {
      enable(t, account);
      const event = eventFor(type), options = { account: account.key };
      for (const change of [{ mode: 'standby' }, { mode: undefined }, { replyToken: '' }, { replyToken: 'x'.repeat(257) }, { source: { type: 'unknown' } }])
        assert.equal(await dispatch.getPilotReply({ ...event, ...change }, account.destination, options), null);
      assert.equal(await dispatch.getPilotReply(event, 'wrong-destination', options), null);
      assert.equal(await dispatch.getPilotReply(event, account.destination, { account: 'unknown' }), null);
      const flag = config.NATIVE_TEST_FLAGS[account.key]; delete process.env[flag];
      assert.equal(await dispatch.getPilotReply(event, account.destination, options), null);
      process.env[flag] = 'true';
      if (account.enabledEnv) {
        delete process.env[account.enabledEnv];
        assert.equal(await dispatch.getPilotReply(event, account.destination, options), null);
        process.env[account.enabledEnv] = 'true';
      }
    });
  }

  for (const type of ['group', 'room']) {
    test(`${account.account} ${type}: snapshots, legacy flows, unrelated and sensitive commands stay outside the new allowance`, async t => {
      enable(t, account);
      const event = eventFor(type), options = { account: account.account };
      const denied = [
        ...['備件清單', '測試服務導覽', '測試導覽：買賣流程', '測試導覽：備件勾選', '宏國服務體驗', '宏國新屋主導覽', '官方', '官方服務', '買賣', '交易流程', '貸款', '貸款規定', '收支比', '公司簽約', '簽約', '查銀行案件', '查內部資料', '權限管理', '客戶完整帳號', '群發', '退群', '服務導覽：私人案件', '服務導覽:交易流程', '服務導覽：交易流程 '].map(text => ({ ...event, message: { type: 'text', text } })),
        ...['hgpilot:v1:owner', 'hgpilot:v1:home', 'hgchat-test:v1:process', 'hgchat:v2:docs:choose', 'hgchat-test:v1:docs:choose', 'hgchat:v2:unknown', 'hgchat:v2:home?account=375umdzq', 'hgchat:v2:step:9', 'hgchat:v2:' + 'x'.repeat(100)].map(data => ({ ...event, type: 'postback', postback: { data } })),
        ...['follow', 'join', 'leave', 'memberJoined'].map(type => ({ ...event, type })),
      ];
      for (const input of denied) {
        assert.equal(routeNativeGuide(input, account.account), null);
        assert.equal(routeEvent(input, options), null);
        assert.equal(await dispatch.getPilotReply(input, account.destination, { account: account.key }), null);
      }
      const flag = config.NATIVE_PUBLIC_FLAGS[account.key]; delete process.env[flag];
      for (const input of [event, { ...event, type: 'postback', postback: { data: PREFIX + 'home' } }]) {
        assert.equal(routeNativeGuide(input, account.account), null);
        assert.equal(await dispatch.getPilotReply(input, account.destination, { account: account.key }), null);
      }
    });
  }
}
