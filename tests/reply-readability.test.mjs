import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildNativeGuide, PREFIX } from '../lib/native-chat-guide.mjs';
const require = createRequire(import.meta.url);
const { buildAnxinCityReply } = require('../lib/anxin-city-entry.js');
const notice = '流程說明不代表案件已送件或辦結；以本案契約、銀行及承辦通知為準。';
function nodes(value, predicate) {
  const found = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (predicate(value)) found.push(value);
    for (const child of Object.values(value)) walk(child);
  };
  walk(value); return found;
}

test('compact Anxin entrance keeps all six public destinations and scenario caution', () => {
  const reply = buildAnxinCityReply();
  const buttons = nodes(reply, node => node.type === 'button');
  assert.deepEqual(buttons.map(button => button.action.uri), [
    ...['first-home', 'move-home', 'seller', 'legacy-family', 'tainan'].map(start => `https://homegoestate.github.io/anxin-city/?start=${start}`),
    'https://homegoestate.github.io/',
  ]);
  assert.ok(buttons.every(button => button.action.label.length <= 10));
  assert.match(JSON.stringify(reply), /故事中的金額為情境示例/);
  assert.equal(reply.messages.length, 1);
});

test('all eight overview stages retain navigation and one common notice per carousel', () => {
  for (const route of ['process', 'process:buyer', 'process:seller']) {
    const reply = buildNativeGuide(route);
    const cards = reply.messages[0].contents.contents;
    assert.equal(cards.length, 8);
    assert.equal(nodes(reply, node => node.text === notice).length, 1);
    for (let i = 0; i < cards.length; i++) {
      const destination = route === 'process' ? `step:${i + 1}` : `${route.slice(8)}:step:${i + 1}`;
      assert.ok(nodes(cards[i], node => node.type === 'postback').some(action => action.data === PREFIX + destination));
    }
  }
  const process = JSON.stringify(buildNativeGuide('process'));
  assert.match(process, /非保證期限/);
  const seller = JSON.stringify(buildNativeGuide('process:seller'));
  assert.match(seller, /履保公司依約辦理/);
  assert.match(seller, /不動產登記或不限定用途/);
});

test('standalone stage and detail cards keep the full common notice', () => {
  for (const prefix of ['', 'buyer:', 'seller:']) for (const view of ['step:', 'detail:']) for (let n = 1; n <= 8; n++) {
    const reply = buildNativeGuide(prefix + view + n);
    assert.ok(nodes(reply, node => node.text === notice).length > 0);
  }
});
