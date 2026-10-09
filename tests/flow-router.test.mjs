import test from 'node:test';
import theme from '../lib/brand-theme.js';
import assert from 'node:assert/strict';
import { routeEvent, buildWelcomeReply, PILOT_PREFIX, MAX_POSTBACK_LENGTH, OWNER_REGISTER_URI, TEXT_TRIGGERS } from '../lib/flow-router.mjs';

const textEvent = text => ({ type: 'message', message: { type: 'text', text } });
const postEvent = data => ({ type: 'postback', postback: { data } });
const go = route => routeEvent(postEvent(PILOT_PREFIX + route));
const serialized = value => JSON.stringify(value);
const MATRIX = [
  ['buy', ['looking', 'selected', 'signed'], ['docs', 'funds', 'process']],
  ['loan', ['before', 'selected', 'existing'], ['funds', 'valuation', 'docs']],
  ['sell', ['evaluating', 'listed', 'offer'], ['net', 'costs', 'docs']],
  ['inherit', ['planning', 'inherited', 'discussing'], ['assets', 'docs', 'family']],
  ['land', ['owner', 'builder', 'partner'], ['rights', 'development', 'project']],
];
const LEGACY = new Set(['買房檢查', '買房費用', '買賣流程', '貸款']);
function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => walk(item, visit));
    else walk(child, visit);
  }
}
function actions(value, type) {
  const result = [];
  walk(value, node => { if (node.type === type && node.label) result.push(node); });
  return result;
}
function visibleText(value) {
  const result = [];
  walk(value, node => { if (node.type === 'text') result.push(node.text); });
  return result.join('\n');
}
function allOutputs(options) {
  const queue = Object.keys(TEXT_TRIGGERS).map(value => routeEvent(textEvent(value), options));
  const byRoute = new Map();
  while (queue.length) {
    const output = queue.shift();
    assert.ok(output);
    if (byRoute.has(output.route)) continue;
    byRoute.set(output.route, output);
    for (const action of actions(output.messages, 'postback')) queue.push(routeEvent(postEvent(action.data), options));
  }
  return [...byRoute.values()];
}

test('seven exact triggers retain all four existing entrypoints', () => {
  assert.deepEqual(Object.keys(TEXT_TRIGGERS), ['宏國服務體驗', '宏國買房導覽', '宏國房貸導覽', '宏國新屋主導覽', '宏國賣房導覽', '宏國傳承導覽', '宏國土地建商導覽']);
  assert.equal(PILOT_PREFIX, 'hgpilot:v1:');
  for (const [trigger, route] of Object.entries(TEXT_TRIGGERS)) {
    assert.equal(routeEvent(textEvent(trigger)).route, route);
    assert.deepEqual(routeEvent(textEvent(trigger)), go(route));
  }
});

test('home has two concise cards with six ordered problem-based options', () => {
  const message = go('home').messages[0];
  assert.equal(message.contents.type, 'carousel');
  const cards = message.contents.contents;
  assert.equal(cards.length, 2);
  for (const card of cards) {
    assert.equal(actions(card, 'postback').length, 3);
    assert.equal(card.body.contents.length, 1, 'no introductory paragraph wall');
  }
  assert.deepEqual(actions(message, 'postback').map(action => action.data), ['buy', 'sell', 'loan', 'inherit', 'land', 'owner'].map(route => PILOT_PREFIX + route));
  assert.equal(actions(message, 'message').length, 0);
  assert.equal(actions(message, 'uri').length, 0);
});

for (const [flow, stages, focuses] of MATRIX) {
  test(`${flow}: all 9 paths reach personalized preparation and a transparent consultation card`, () => {
    assert.equal(go(flow).state.step, 'stage');
    const stageChoices = actions(go(flow).messages[0].contents, 'postback');
    assert.equal(stageChoices.length, 3);
    for (const stage of stages) {
      const stageChoice = stageChoices.find(choice => choice.data === PILOT_PREFIX + `${flow}:stage:${stage}`);
      assert.ok(stageChoice);
      const focusPage = go(`${flow}:stage:${stage}`);
      assert.deepEqual(focusPage.state, { flow, step: 'focus', stage });
      assert.match(visibleText(focusPage.messages), new RegExp(stageChoice.label));
      const choices = actions(focusPage.messages[0].contents, 'postback');
      assert.equal(choices.length, 3);
      for (const focus of focuses) {
        const route = `${flow}:result:${stage}:${focus}`;
        const choice = choices.find(item => item.data === PILOT_PREFIX + route);
        assert.ok(choice);
        const result = go(route);
        assert.deepEqual(result.state, { flow, step: 'summary', stage, focus });
        const carousel = result.messages[0].contents;
        assert.equal(carousel.type, 'carousel');
        assert.equal(carousel.contents.length, 2);
        const [checklist, summary] = carousel.contents;
        assert.match(visibleText(checklist), /準備清單/);
        assert.match(visibleText(checklist), /還需確認：.{8,}/);
        assert.ok(visibleText(checklist).includes(stageChoice.label));
        assert.ok(visibleText(checklist).includes(choice.label));
        assert.equal(checklist.body.contents.filter(item => item.type === 'box').length, 3);
        const ctas = actions(summary, 'message');
        assert.equal(ctas.length, 1);
        assert.match(ctas[0].text, /^【需求諮詢】/);
        assert.ok(ctas[0].text.includes(stageChoice.label));
        assert.ok(ctas[0].text.includes(choice.label));
        assert.match(ctas[0].text, /還需確認：/);
        assert.equal(ctas[0].label, '請代書協助下一步');
        assert.ok(visibleText(summary).includes(ctas[0].text), 'the exact outgoing message is visible');
        assert.match(visibleText(summary), /尚不代表已受理/);
        assert.match(visibleText(summary), /未承諾回覆或完成時間/);
        assert.equal(routeEvent(textEvent(ctas[0].text)), null);
      }
    }
  });
}

test('all historical v1 postback states remain usable', () => {
  const routes = ['home', 'buy', 'loan', 'owner'];
  for (const [flow, stages, focuses] of MATRIX.slice(0, 2)) {
    for (const stage of stages) {
      routes.push(`${flow}:stage:${stage}`);
      for (const focus of focuses) routes.push(`${flow}:result:${stage}:${focus}`);
    }
  }
  for (const stage of ['prepare', 'supplement', 'missing']) routes.push(`owner:guide:${stage}`);
  assert.equal(routes.length, 31);
  for (const route of routes) assert.equal(go(route).route, route);
});

test('original keyword actions are strictly allowlisted and optional, one per checklist', () => {
  const used = new Set();
  for (const output of allOutputs().filter(item => item.state.step === 'summary')) {
    const [checklist, summary] = output.messages[0].contents.contents;
    const links = actions(checklist, 'message');
    assert.ok(links.length <= 1);
    if (output.state.flow === 'buy') {
      assert.equal(links.length, 1);
      assert.equal(links[0].text, { docs: '買房檢查', funds: '買房費用', process: '買賣流程' }[output.state.focus]);
    } else if (output.state.flow === 'loan') {
      assert.equal(links.length, 1);
      assert.equal(links[0].text, '貸款');
    } else {
      assert.equal(links.length, 0);
    }
    for (const link of links) {
      assert.ok(LEGACY.has(link.text));
      assert.equal(routeEvent(textEvent(link.text)), null, 'existing handler owns the original keyword');
      used.add(link.text);
    }
    assert.equal(actions(summary, 'message').length, 1);
  }
  assert.deepEqual(used, LEGACY);
});

test('stage and focus change concrete preparation content, and all summaries are unique', () => {
  const summaries = new Set();
  for (const [flow, stages, focuses] of MATRIX) {
    const getLines = (stage, focus) => go(`${flow}:result:${stage}:${focus}`).messages[0].contents.contents[0].body.contents.filter(item => item.type === 'box').map(item => item.contents[1].text);
    const stageLines = stages.map(stage => getLines(stage, focuses[0])[0]);
    const focusLines = focuses.map(focus => getLines(stages[0], focus)[1]);
    assert.equal(new Set(stageLines).size, 3);
    assert.equal(new Set(focusLines).size, 3);
  }
  for (const output of allOutputs()) {
    for (const action of actions(output.messages, 'message').filter(item => item.text.startsWith('【需求諮詢】'))) {
      assert.ok(!summaries.has(action.text));
      summaries.add(action.text);
    }
  }
  assert.equal(summaries.size, 48);
});

test('owner prepare preserves exact formal URI and warning on the registration card', () => {
  const result = go('owner:guide:prepare');
  assert.deepEqual(result.state, { flow: 'owner', step: 'guidance', stage: 'prepare' });
  const [checklist, summary] = result.messages[0].contents.contents;
  const links = actions(checklist, 'uri');
  assert.equal(links.length, 1);
  assert.equal(links[0].label, '前往正式登錄');
  assert.equal(links[0].uri, 'https://script.google.com/macros/s/AKfycbwne31PhZ2AxkDpIbTsq4Al9kexafx7LbZEM9mBXlutDo7ls5G4hG95SkQN-E4oB6G0/exec?view=register&oa=604gpqef');
  assert.equal(links[0].uri, OWNER_REGISTER_URI);
  assert.equal(new URL(links[0].uri).searchParams.get('oa'), '604gpqef');
  assert.ok(visibleText(checklist).includes('「前往正式登錄」會開啟既有正式登錄表單。請勿輸入虛構或示範資料；僅閱讀導覽時可返回首頁。'));
  assert.equal(actions(summary, 'message')[0].label, '請代書協助下一步');
});

test('other owner paths avoid duplicate registration and retain separate consultation summaries', () => {
  for (const stage of ['supplement', 'missing']) {
    const result = go(`owner:guide:${stage}`);
    assert.equal(result.state.stage, stage);
    assert.equal(result.messages[0].contents.contents.length, 2);
    assert.equal(actions(result.messages, 'uri').length, 0);
    assert.equal(actions(result.messages, 'message').length, 1);
    assert.match(visibleText(result.messages[0].contents.contents[0]), /還需確認：/);
  }
  assert.match(visibleText(go('owner:guide:supplement').messages), /不要為補充資料重複新增/);
  assert.match(visibleText(go('owner:guide:missing').messages), /請勿改選其他建案送出/);
});

test('all reachable outputs make no automated policy, tax, eligibility or timing commitment', () => {
  for (const output of allOutputs()) {
    const content = visibleText(output.messages);
    assert.doesNotMatch(content, /[0-9]+(?:\.[0-9]+)?\s*[%％成萬元]|保證核准|保證過件|一定核貸|已核貸|已建檔|已指派|已收到您的|保證省稅|免稅資格|可合法興建|開發可行|自動試算|付費鑑價|案件進度查詢|立即上傳|上傳身分證|\d+\s*(?:分鐘|小時|天)內回覆/);
    if (output.state.flow === 'loan' && output.state.step === 'summary') {
      assert.match(content, /未進行貸款試算/);
      assert.match(content, /銀行依個案審核/);
      assert.doesNotMatch(content, /利率|成數|鑑價收費/);
    }
    if (output.state.flow === 'sell' && output.state.step === 'summary') assert.match(content, /尚未計算售後實拿或稅費/);
    if (output.state.flow === 'inherit' && output.state.step === 'summary') assert.match(content, /尚未判定權利、應辦程序或傳承方案/);
    if (output.state.flow === 'land' && output.state.step === 'summary') assert.match(content, /尚未判定可否使用、開發或合作可行性/);
  }
});

test('back navigation preserves each stage and every non-home state can return home', () => {
  for (const output of allOutputs()) {
    if (output.state.flow === 'home') continue;
    const navigation = output.messages[0].quickReply.items.map(item => item.action);
    const home = navigation.find(action => action.label === '返回服務主選單');
    assert.equal(routeEvent(postEvent(home.data)).route, 'home');
    const back = navigation.find(action => action.label === '回上一題');
    if (output.state.step === 'stage') {
      assert.equal(back, undefined);
      continue;
    }
    assert.ok(back);
    const previous = routeEvent(postEvent(back.data));
    if (output.state.step === 'summary') {
      assert.equal(previous.state.step, 'focus');
      assert.equal(previous.state.stage, output.state.stage);
    } else {
      assert.equal(previous.state.step, 'stage');
    }
    assert.equal(previous.state.flow, output.state.flow);
  }
});

test('nonreserved keywords and unrelated events fall through without stealing old handlers', () => {
  for (const value of [...LEGACY, '買房', '房貸', '鑑價', '新屋主', '新屋主登錄', '登錄', '買賣', '賣房', '繼承', '傳承', '土地', '建商', '服務', '宏國', '人工客服', '案件進度', '銀行鑑價', 'toString', '__proto__', '【需求諮詢】買房']) {
    assert.equal(routeEvent(textEvent(value)), null, value);
  }
  for (const trigger of Object.keys(TEXT_TRIGGERS)) {
    for (const value of [` ${trigger}`, `${trigger} `, `${trigger}\n`, `請問${trigger}`, `${trigger}A`]) assert.equal(routeEvent(textEvent(value)), null, value);
  }
  for (const event of [undefined, null, [], 'message', {}, { type: 'follow' }, { type: 'message' }, { type: 'message', message: { type: 'image' } }, textEvent(null), textEvent(12), postEvent(null), postEvent({}), postEvent('other:home'), postEvent('hgpilot:v2:home')]) assert.equal(routeEvent(event), null);
});

test('malicious or unknown own-prefix postbacks receive fixed recovery and never echo input', () => {
  const invalidValues = [
    '', 'unknown', 'buy:stage:constructor', 'buy:result:signed:valuation',
    'loan:result:signed:docs', 'sell:result:offer:valuation', 'inherit:result:planning:tax',
    'land:result:owner:permit', 'owner:guide:__proto__', 'home:extra',
    'home\n', 'home ', 'HOME', 'home\0', 'home?user=123', 'home&oa=other',
    '%68ome', 'buy:result:looking:docs:extra', '{"flow":"home"}',
    '<script>alert(1)</script>', 'https://evil.example/', 'x'.repeat(MAX_POSTBACK_LENGTH + 1),
  ];
  const canonical = go('unknown');
  assert.equal(canonical.route, 'invalid');
  for (const value of invalidValues) {
    const output = go(value);
    assert.deepEqual(output, canonical, value);
    assert.equal(actions(output.messages, 'message').length, 0);
    assert.equal(actions(output.messages, 'uri').length, 0);
  }
});

test('event identities and untrusted payload fields never enter any result', () => {
  for (const route of ['buy:result:selected:funds', 'sell:result:offer:net', 'inherit:result:inherited:family', 'land:result:partner:development', 'owner:guide:prepare']) {
    const event = postEvent(PILOT_PREFIX + route);
    event.source = { type: 'user', userId: 'PRIVATE_USER_MARKER' };
    event.replyToken = 'PRIVATE_REPLY_MARKER';
    event.postback.params = { text: 'UNTRUSTED_TEXT_MARKER', uri: 'https://evil.example' };
    event.state = { stage: 'UNTRUSTED_STAGE_MARKER' };
    assert.deepEqual(routeEvent(event), go(route));
    assert.doesNotMatch(serialized(routeEvent(event)), /PRIVATE_|UNTRUSTED_|evil\.example/);
  }
});

test('group, room and standby events are never handled', () => {
  for (const trigger of Object.keys(TEXT_TRIGGERS)) {
    for (const type of ['group', 'room']) assert.equal(routeEvent({ ...textEvent(trigger), source: { type } }), null);
    assert.equal(routeEvent({ ...textEvent(trigger), mode: 'standby' }), null);
  }
  for (const type of ['group', 'room']) assert.equal(routeEvent({ ...postEvent(PILOT_PREFIX + 'home'), source: { type } }), null);
  assert.equal(routeEvent({ ...postEvent(PILOT_PREFIX + 'home'), mode: 'standby' }), null);
});

test('mutating one result cannot change future cards or retain another user state', () => {
  const baseline = go('buy:result:signed:docs');
  const changed = go('buy:result:signed:docs');
  changed.state.stage = 'ARBITRARY';
  changed.messages[0].contents.contents[0].header.contents[0].text = 'ARBITRARY';
  assert.deepEqual(go('buy:result:signed:docs'), baseline);
  assert.deepEqual(go('land:result:owner:project').state, { flow: 'land', step: 'summary', stage: 'owner', focus: 'project' });
});

test('all 70 states meet local LINE Flex limits, three-action cap and summary privacy rules', () => {
  // Structural checks only; this does not claim LINE validate API acceptance.
  const outputs = allOutputs();
  assert.equal(outputs.length, 70);
  assert.deepEqual(new Set(outputs.map(output => output.state.flow)), new Set(['home', 'buy', 'loan', 'owner', 'sell', 'inherit', 'land']));
  for (const output of [...outputs, go('invalid')]) {
    assert.ok(output.messages.length > 0 && output.messages.length <= 5);
    for (const message of output.messages) {
      assert.equal(message.type, 'flex');
      assert.ok(message.altText.length > 0 && message.altText.length <= 400);
      assert.ok(['bubble', 'carousel'].includes(message.contents.type));
      const bubbles = message.contents.type === 'bubble' ? [message.contents] : message.contents.contents;
      assert.ok(bubbles.length >= 1 && bubbles.length <= 12);
      assert.ok(Buffer.byteLength(serialized(message.contents)) <= 50 * 1024);
      for (const card of bubbles) {
        assert.equal(card.type, 'bubble');
        assert.ok(Buffer.byteLength(serialized(card)) <= 30 * 1024);
        assert.equal(card.size, 'mega');
        assert.equal(card.styles.header.backgroundColor, theme.primary);
        assert.equal(card.header.contents[0].color, '#FFFFFF');
        let actionCount = 0;
        walk(card, node => {
          if (node.type === 'box') {
            assert.ok(['vertical', 'horizontal', 'baseline'].includes(node.layout));
            assert.ok(Array.isArray(node.contents) && node.contents.length > 0);
          }
          if (node.type === 'text') assert.ok(node.text.length > 0 && node.text.length <= 2000);
          if (node.type === 'button') {
            actionCount++;
            assert.ok(['postback', 'message', 'uri'].includes(node.action.type));
            assert.ok(node.action.label.length > 0 && node.action.label.length <= 20);
          }
        });
        assert.ok(actionCount <= 3);
      }
      if (message.quickReply) {
        assert.ok(message.quickReply.items.length > 0 && message.quickReply.items.length <= 13);
        for (const item of message.quickReply.items) {
          assert.equal(item.type, 'action');
          assert.equal(item.action.type, 'postback');
          assert.ok(item.action.label.length > 0 && item.action.label.length <= 20);
        }
      }
      for (const action of actions(message, 'postback')) {
        assert.ok(action.data.startsWith(PILOT_PREFIX));
        assert.ok(action.data.length <= MAX_POSTBACK_LENGTH && action.data.length <= 300);
        assert.notEqual(routeEvent(postEvent(action.data)).route, 'invalid');
        assert.equal(action.text, undefined);
      }
      for (const action of actions(message, 'message')) {
        assert.ok(action.text.length > 0 && action.text.length <= 300);
        if (LEGACY.has(action.text)) continue;
        assert.match(action.text, /^【需求諮詢】(?:買房|賣房|房貸|傳承|土地與建案|新屋主登錄)\n/);
        assert.doesNotMatch(action.text, /姓名|電話|身分證|帳號|https?:|已建檔|已受理|已指派/);
        assert.equal(action.label, '請代書協助下一步');
        assert.equal(routeEvent(textEvent(action.text)), null);
      }
      for (const action of actions(message, 'uri')) {
        assert.equal(action.uri, OWNER_REGISTER_URI);
        assert.ok(action.uri.length <= 1000);
      }
    }
  }
});

const ACCOUNTS = ['@604gpqef', '@528scwxf', '@375umdzq'];
const BRAND = '宏國地政|易丞地政';

test('each allowlisted account has 70 routes and the same formal registration URI', () => {
  for (const account of ACCOUNTS) {
    const outputs = allOutputs({ account });
    assert.equal(outputs.length, 70);
    let linkCount = 0;
    for (const output of outputs) {
      for (const action of actions(output.messages, 'uri')) {
        linkCount++;
        assert.equal(output.route, 'owner:guide:prepare');
        assert.equal(action.uri, OWNER_REGISTER_URI);
        assert.doesNotMatch(action.uri, /%40|oa=@/);
      }
    }
    assert.equal(linkCount, 1);
  }
  assert.equal(new URL(OWNER_REGISTER_URI).searchParams.get('oa'), '604gpqef', 'the legacy export remains unchanged');
  assert.deepEqual(go('owner:guide:prepare'), routeEvent(postEvent(PILOT_PREFIX + 'owner:guide:prepare'), { account: '@604gpqef' }));
});

test('all allowlisted accounts produce identical output for every reachable route', () => {
  const outputsByAccount = ACCOUNTS.map(account => new Map(allOutputs({ account }).map(output => [output.route, output])));
  assert.deepEqual([...outputsByAccount[0].keys()].length, 70);
  for (const [route, expected] of outputsByAccount[0]) {
    for (const accountOutputs of outputsByAccount.slice(1)) {
      assert.deepEqual(accountOutputs.get(route), expected, `${route} must be identical across accounts`);
    }
  }
});

test('unknown or malformed account options fail closed for routes and welcome builder', () => {
  const getterOptions = Object.defineProperty({}, 'account', { get() { throw new Error('must not read an account getter'); } });
  const invalidOptions = [
    null, false, 604, '@604gpqef', [], {}, { account: undefined }, { account: null },
    { account: 604 }, { account: '604gpqef' }, { account: '@604' },
    { account: '@528' }, { account: '@375' }, { account: '@unknown' },
    { account: '@604gpqef ' }, { account: ' @604gpqef' }, { account: '@604gpqef\n' },
    { account: '@604gpqef&oa=other' }, { account: '__proto__' },
    { account: '@604gpqef', ownerRegisterUri: 'https://evil.example' },
    Object.create({ account: '@604gpqef' }),
    Object.assign(new Date(), { account: '@604gpqef' }), getterOptions,
  ];
  for (const options of invalidOptions) {
    for (const event of [textEvent('宏國服務體驗'), postEvent(PILOT_PREFIX + 'owner:guide:prepare'), postEvent(PILOT_PREFIX + 'invalid')]) {
      assert.equal(routeEvent(event, options), null);
    }
    assert.equal(buildWelcomeReply(options), null);
  }
});

test('all cards and Flex alternatives use the exact unified brand', () => {
  for (const account of ACCOUNTS) {
    const outputs = [...allOutputs({ account }), routeEvent(postEvent(PILOT_PREFIX + 'invalid'), { account }), buildWelcomeReply({ account })];
    for (const output of outputs) {
      for (const message of output.messages.filter(item => item.type === 'flex')) {
        assert.ok(message.altText.startsWith(BRAND + '：'));
        assert.ok(message.altText.length <= 400);
        const cards = message.contents.type === 'bubble' ? [message.contents] : message.contents.contents;
        for (const card of cards) assert.equal(card.header.contents[0].text, BRAND);
        assert.doesNotMatch(visibleText(message), /宏國地政｜服務體驗|宏國地政｜易丞地政/);
      }
    }
  }
});

test('welcome contains one brief text and the original six-service Flex without handling follow', () => {
  for (const account of ACCOUNTS) {
    const options = { account };
    const reply = buildWelcomeReply(options);
    assert.equal(reply.route, 'welcome');
    assert.deepEqual(reply.state, { flow: 'home', step: 'welcome' });
    assert.equal(reply.messages.length, 2);
    const [greeting, menu] = reply.messages;
    assert.equal(greeting.type, 'text');
    assert.ok(greeting.text.includes(BRAND));
    assert.ok(greeting.text.length > 0 && greeting.text.length <= 500);
    assert.match(greeting.text, /下方.*卡片/);
    assert.match(greeting.text, /請代書協助下一步/);
    assert.match(greeting.text, /確認/);
    assert.match(greeting.text, /請先勿傳送身分證、帳戶或完整契約/);
    assert.doesNotMatch(greeting.text, /\{Nickname\}|已受理|已收到|已指派|保證|立即回覆|\d+\s*(?:分鐘|小時|天)內回覆|優惠|免費|案件進度|完全看不到|優先處理|VIP/);
    assert.deepEqual(menu, routeEvent(textEvent('宏國服務體驗'), options).messages[0]);
    assert.equal(actions(menu, 'postback').length, 6);
    assert.equal(actions(menu, 'message').length, 0);
    assert.equal(actions(menu, 'uri').length, 0);
    for (const action of actions(menu, 'postback')) {
      assert.ok(action.label.length <= 20);
      assert.notEqual(routeEvent(postEvent(action.data), options).route, 'invalid');
    }
    assert.equal(routeEvent({ type: 'follow', source: { type: 'user' } }, options), null);
  }
  assert.deepEqual(buildWelcomeReply(), buildWelcomeReply({ account: '@604gpqef' }));
});

test('event account spoofing cannot override verified options and calls keep no account state', () => {
  for (const account of ACCOUNTS) {
    const event = postEvent(PILOT_PREFIX + 'owner:guide:prepare');
    event.account = '@604gpqef&oa=evil';
    event.destination = 'UNTRUSTED_DESTINATION';
    event.options = { account: '@528scwxf' };
    event.postback.params = { account: '@375umdzq', oa: 'evil', uri: 'https://evil.example' };
    const output = routeEvent(event, { account });
    assert.deepEqual(output, routeEvent(postEvent(PILOT_PREFIX + 'owner:guide:prepare'), { account }));
    assert.equal(actions(output.messages, 'uri')[0].uri, OWNER_REGISTER_URI);
    assert.doesNotMatch(serialized(output), /UNTRUSTED_|evil\.example/);
  }
  assert.equal(actions(go('owner:guide:prepare').messages, 'uri')[0].uri, OWNER_REGISTER_URI);
  const changed = buildWelcomeReply({ account: '@375umdzq' });
  changed.messages[0].text = 'MUTATED';
  changed.messages[1].contents.contents[0].header.contents[0].text = 'MUTATED';
  assert.doesNotMatch(serialized(buildWelcomeReply({ account: '@375umdzq' })), /MUTATED/);
});

test('all accounts retain original keywords, group protection and standby protection', () => {
  for (const account of ACCOUNTS) {
    const options = { account };
    for (const keyword of LEGACY) assert.equal(routeEvent(textEvent(keyword), options), null);
    for (const type of ['group', 'room']) {
      assert.equal(routeEvent({ ...textEvent('宏國服務體驗'), source: { type } }, options), null);
      assert.equal(routeEvent({ ...postEvent(PILOT_PREFIX + 'owner:guide:prepare'), source: { type } }, options), null);
    }
    assert.equal(routeEvent({ ...textEvent('宏國服務體驗'), mode: 'standby' }, options), null);
    assert.equal(routeEvent({ ...postEvent(PILOT_PREFIX + 'owner:guide:prepare'), mode: 'standby' }, options), null);
  }
});
