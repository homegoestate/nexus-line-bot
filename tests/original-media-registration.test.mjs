import test from 'node:test';
import assert from 'node:assert/strict';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import { PREFIX, PROCESS_STEP_TITLES } from '../lib/native-chat-guide.mjs';
import { OWNER_REGISTER_URI, PILOT_PREFIX } from '../lib/flow-router.mjs';

function enable(t, account) {
  for (const key of [account.enabledEnv, config.NATIVE_TEST_FLAGS[account.key], config.NATIVE_PUBLIC_FLAGS[account.key]].filter(Boolean)) {
    const old = process.env[key]; process.env[key] = 'true';
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
}
function actions(value, type) {
  const out = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === type && node.label) out.push(node);
    Object.values(node).forEach(walk);
  }
  walk(value); return out;
}

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  for (const sourceType of ['user', 'group', 'room']) {
    test(`${account.account} ${sourceType}: A remains eight stages and original media goes to exactly one existing native keyword`, async t => {
      enable(t, account);
      const event = { type: 'message', mode: 'active', source: { type: sourceType }, replyToken: 'offline-only', message: { type: 'text', text: '服務導覽：交易流程' } };
      const send = changed => dispatch.getPilotReply({ ...event, ...changed }, account.destination, { account: account.key });
      const overview = await send({});
      assert.equal(overview.route, 'native:process');
      assert.deepEqual(overview.messages[0].contents.contents.map(card => card.body.contents[1].text), PROCESS_STEP_TITLES.map((title, i) => `${String(i + 1).padStart(2, '0')} ${title}`));
      assert.deepEqual(actions(overview, 'message'), [{ type: 'message', label: '原買賣影片／說明', text: '買賣' }]);
      assert.equal(await send({ message: { type: 'text', text: '買賣' } }), null, 'native receiver owns this message; no second webhook reply');
      assert.equal(actions(overview, 'uri').length, 0);
      assert.equal(actions(overview, 'video').length, 0);
      assert.deepEqual(await send({ type: 'postback', postback: { data: PREFIX + 'process' } }), overview);
      for (let n = 1; n <= 8; n++) assert.equal((await send({ type: 'postback', postback: { data: PREFIX + 'step:' + n } })).route, 'native:step:' + n);
    });
  }

  test(`${account.account}: private owner path retains the exact form URI and shared chats cannot start registration`, async t => {
    enable(t, account);
    const event = { type: 'postback', mode: 'active', source: { type: 'user' }, replyToken: 'offline-only', postback: { data: PREFIX + 'home' } };
    const send = changed => dispatch.getPilotReply({ ...event, ...changed }, account.destination, { account: account.key });
    const home = await send({});
    const legacy = actions(home, 'message').find(a => a.label === '其他需求與屋主登錄');
    assert.equal(legacy.text, '宏國服務體驗');
    const oldMenu = await send({ type: 'message', message: { type: 'text', text: legacy.text } });
    assert.ok(actions(oldMenu, 'postback').some(a => a.data === PILOT_PREFIX + 'owner'));
    const prepare = await send({ postback: { data: PILOT_PREFIX + 'owner:guide:prepare' } });
    assert.deepEqual(actions(prepare, 'uri'), [{ type: 'uri', label: '前往正式登錄', uri: OWNER_REGISTER_URI }]);
    assert.equal(new URL(OWNER_REGISTER_URI).searchParams.get('oa'), '604gpqef');
    assert.match(JSON.stringify(prepare.messages), /請勿輸入虛構或示範資料/);
    for (const type of ['group', 'room']) assert.equal(await send({ source: { type }, postback: { data: PILOT_PREFIX + 'owner:guide:prepare' } }), null);
    for (const stage of ['supplement', 'missing']) {
      const result = await send({ postback: { data: PILOT_PREFIX + 'owner:guide:' + stage } });
      assert.equal(actions(result, 'uri').length, 0, 'no duplicate registration route');
    }
  });
}
