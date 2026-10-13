import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeGuide, PREFIX, TEXT_ACTIONS, EXISTING_SERVICE_KEYWORDS } from '../lib/native-chat-guide.mjs';
import { buildServiceEntryPreview, buildTransactionEntryCandidate, routeServiceEntryPreview, routeServiceEntryCandidate, CANDIDATE_ENTRY_TEXTS, CANDIDATE_ENTRY_PREFIX } from '../lib/service-entry-candidate.mjs';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import { buildTransactionProcessImageMessage } from '../lib/transaction-process-image.mjs';

function enable(t, account) {
  for (const key of [account.enabledEnv, config.NATIVE_TEST_FLAGS[account.key], config.NATIVE_PUBLIC_FLAGS[account.key]].filter(Boolean)) {
    const old = process.env[key]; process.env[key] = 'true';
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
}

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  test(`${account.account}: A candidate prepends one reused entrance and preserves the complete original eight-stage reply`, () => {
    const candidate = buildTransactionEntryCandidate({ account: account.account });
    const oldOverview = buildNativeGuide('process', { account: account.account });
    assert.equal(candidate.messages.length, 3);
    assert.deepEqual(candidate.messages[0], buildServiceEntryPreview('buy', { account: account.account }).messages[0]);
    assert.deepEqual(candidate.messages[1], buildTransactionProcessImageMessage());
    assert.deepEqual(candidate.messages.slice(2), oldOverview.messages);
    assert.equal(candidate.messages[2].contents.contents.length, 8);
    const overviewAction = candidate.messages[0].contents.footer.contents.find(x => x.action.label === '交易流程總覽').action;
    assert.equal(overviewAction.data, PREFIX + 'process', 'old overview callback, never the new entrance itself');
    assert.equal(candidate.liveReady, false);
    for (const sourceType of ['user', 'group', 'room']) {
      const event = { type: 'message', mode: 'active', source: { type: sourceType }, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } };
      assert.deepEqual(routeServiceEntryCandidate(event, account.account), candidate);
      assert.deepEqual(routeServiceEntryCandidate({ ...event, type: 'postback', postback: { data: CANDIDATE_ENTRY_PREFIX + 'buy' } }, account.account), candidate);
      assert.deepEqual(routeServiceEntryCandidate(event, account.account), candidate, 'repeated rendering is deterministic and adds nothing');
      assert.equal(routeServiceEntryCandidate({ ...event, type: 'postback', postback: { data: PREFIX + 'process' } }, account.account), null, 'existing route stays outside the new candidate');
      assert.equal(routeServiceEntryCandidate({ ...event, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy + ' ' } }, account.account), null);
    }
    assert.equal(routeServiceEntryCandidate({ type: 'message', mode: 'active', source: { type: 'user' }, message: { type: 'text', text: '服務導覽：貸款規劃入口' } }, account.account), null, 'B remains in the existing native rule; no new loan route');
  });
  for (const [kind, index, labels] of [
    ['buy', 0, ['我是買方', '我是賣方', '交易流程總覽']],
    ['loan', 1, ['貸款收入證明', '貸款選項', '官方六項服務']],
  ]) {
    test(`${account.account} ${kind}: reuse the existing home bubble exactly; retain its old callbacks`, () => {
      const home = buildNativeGuide('home', { account: account.account });
      const preview = buildServiceEntryPreview(kind, { account: account.account });
      assert.equal(preview.candidateOnly, true);
      assert.equal(preview.liveReady, false);
      assert.equal(preview.messages.length, 1);
      assert.deepEqual(preview.messages[0].contents, home.messages[0].contents.contents[index]);
      assert.deepEqual(preview.messages[0].contents.footer.contents.map(x => x.action.label), labels);
      assert.ok(preview.messages[0].contents.footer.contents.every(x => x.action.data.startsWith(PREFIX)));
      assert.equal(preview.messages[0].quickReply, undefined);
      preview.messages[0].contents.body.contents[1].text = 'Mutated preview';
      assert.notEqual(buildNativeGuide('home', { account: account.account }).messages[0].contents.contents[index].body.contents[1].text, 'Mutated preview');
    });
    test(`${account.account} ${kind}: isolated exact text and postback route to the same reused card`, () => {
      if (kind === 'loan') {
        const actions = buildServiceEntryPreview('loan', { account: account.account }).messages[0].contents.footer.contents.map(x => x.action);
        assert.deepEqual(actions.slice(0, 2).map(x => ({ label: x.label, type: x.type, data: x.data })), [
          { label: '貸款收入證明', type: 'postback', data: PREFIX + 'finance' },
          { label: '貸款選項', type: 'postback', data: PREFIX + 'finance:options' },
        ]);
        assert.equal(TEXT_ACTIONS['服務導覽：貸款收入證明'], 'finance');
        assert.equal(TEXT_ACTIONS['服務導覽：貸款選項'], 'finance:options');
        assert.equal(actions[2].data, PREFIX + 'services', 'third original home action remains');
        assert.equal(routeServiceEntryPreview({ type: 'postback', mode: 'active', source: { type: 'user' }, postback: { data: CANDIDATE_ENTRY_PREFIX + 'loan' } }, account.account), null);
        return;
      }
      for (const sourceType of ['user', 'group', 'room']) {
        const event = { type: 'message', mode: 'active', source: { type: sourceType }, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS[kind] } };
        const expected = buildServiceEntryPreview(kind, { account: account.account });
        assert.deepEqual(routeServiceEntryPreview(event, account.account), expected);
        assert.deepEqual(routeServiceEntryPreview({ ...event, type: 'postback', postback: { data: CANDIDATE_ENTRY_PREFIX + kind } }, account.account), expected);
        assert.equal(routeServiceEntryPreview({ ...event, message: { type: 'text', text: event.message.text + ' ' } }, account.account), null);
        assert.equal(routeServiceEntryPreview({ ...event, mode: 'standby' }, account.account), null);
        assert.equal(routeServiceEntryPreview({ ...event, type: 'postback', postback: { data: PREFIX + 'process' } }, account.account), null);
        assert.equal(routeServiceEntryPreview({ ...event, type: 'postback', postback: { data: CANDIDATE_ENTRY_PREFIX + kind + ':unknown' } }, account.account), null);
      }
    });
  }
  test(`${account.account}: additive A entry uses the existing dispatcher; original keywords, group guards and A/B remain unchanged`, async t => {
    enable(t, account);
    const event = { type: 'message', mode: 'active', source: { type: 'user' }, replyToken: 'offline-only', message: { type: 'text', text: 'unused' } };
    const send = changed => dispatch.getPilotReply({ ...event, ...changed }, account.destination, { account: account.key });
    for (const sourceType of ['user', 'group', 'room']) {
      for (const text of ['服務導覽：貸款規劃入口', '買賣', '貸款', '貸款規定', '收支比']) {
        assert.equal(await send({ source: { type: sourceType }, message: { type: 'text', text } }), null);
      }
      const a = await send({ source: { type: sourceType }, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } });
      assert.equal(a.route, 'native:entry:buy');
      assert.deepEqual(a.messages, buildTransactionEntryCandidate({ account: account.account }).messages);
      assert.equal(a.messages.length, 3);
      const callback = await send({ source: { type: sourceType }, type: 'postback', postback: { data: CANDIDATE_ENTRY_PREFIX + 'buy' } });
      assert.deepEqual(callback, a);
      assert.equal(await send({ source: { type: sourceType }, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy + ' ' } }), null);
      const process = await send({ source: { type: sourceType }, message: { type: 'text', text: '服務導覽：交易流程' } });
      assert.equal(process.route, 'native:process');
      assert.equal(process.messages[0].contents.contents.length, 8);
      assert.ok(process.messages[0].quickReply.items.some(x => x.action.text === '買賣' && x.action.label === '原買賣影片／說明'));
    }
    const services = buildNativeGuide('services', { account: account.account }).messages[0].contents.contents[0].footer.contents;
    assert.equal(services[0].action.data, PREFIX + 'process');
    assert.equal(services[1].action.type, 'message');
    assert.equal(services[1].action.text, EXISTING_SERVICE_KEYWORDS[account.account][2]);
    assert.equal(services[2].action.text, '收支比');
    assert.equal(await dispatch.getPilotReply({ ...event, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } }, 'wrong-destination', { account: account.key }), null);
    assert.equal(await send({ mode: 'standby', message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } }), null);
    process.env[config.NATIVE_PUBLIC_FLAGS[account.key]] = 'false';
    assert.equal(await send({ message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } }), null);
  });
}

test('candidate rejects unknown entry/account and malformed events; B original material is never invented', () => {
  const account = '@604gpqef';
  assert.throws(() => buildServiceEntryPreview('ratio', { account }), /Unknown candidate entry/);
  assert.throws(() => buildServiceEntryPreview('__proto__', { account }), /Unknown candidate entry/);
  assert.throws(() => buildServiceEntryPreview('buy', { account: '@unknown' }), /Unknown service account/);
  for (const text of Object.values(CANDIDATE_ENTRY_TEXTS)) assert.equal(Object.hasOwn(TEXT_ACTIONS, text), false);
  assert.equal(routeServiceEntryPreview(null, account), null);
  assert.equal(routeServiceEntryPreview({ type: 'follow', mode: 'active', source: { type: 'user' } }, account), null);
  assert.equal(routeServiceEntryPreview({ type: 'message', mode: 'active', source: { type: 'unknown' }, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } }, account), null);
});
