import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import dispatch from '../lib/pilot-dispatch.js';
import { buildNativeGuide, ROUTES, PREFIX, LEGACY_PREFIX } from '../lib/native-chat-guide.mjs';
import { buildWelcomeReply, routeEvent, TEXT_TRIGGERS, PILOT_PREFIX, OWNER_REGISTER_URI } from '../lib/flow-router.mjs';
import { buildTransactionEntryCandidate, buildServiceEntryPreview, CANDIDATE_ENTRY_TEXTS } from '../lib/service-entry-candidate.mjs';
import { VIDEO_PLAYLISTS, VIDEO_NATIVE_ALIASES, VIDEO_HUB_ACTION, videoQuickReplyActions, appendVideoQuickReplies, isVideoQuickReplyAction } from '../lib/video-playlists.mjs';
import { stripVideoQuickReplies } from './helpers/video-quick-replies.mjs';
import { stripAnxinDiscovery } from './helpers/anxin-discovery.mjs';
import { buildTransactionProcessImageMessage } from '../lib/transaction-process-image.mjs';

function originalImageFreePayload(view, account) {
  const copy = stripAnxinDiscovery(view);
  // Restore only the A action for historical snapshots. B and finance remain
  // identical to production; native already owns the income entry and media.
  if (copy.route === 'native:services') {
    const buttons = copy.messages[0].contents.contents[0].footer.contents;
    assert.deepEqual(buttons[0].action, { type: 'postback', label: '買賣過戶', data: PREFIX + 'entry:buy', displayText: '查看買賣過戶' });
    assert.deepEqual(buttons[1].action, { type: 'message', label: '貸款規劃', text: account === '@528scwxf' ? '貸款' : '貸款規定' });
    buttons[0].action.data = PREFIX + 'process';
  }
  if (['candidate:entry:buy', 'native:entry:buy'].includes(copy.route)) {
    assert.deepEqual(copy.messages[1], buildTransactionProcessImageMessage());
    copy.messages.splice(1, 1);
  }
  return copy;
}

const expected = {
  loan: ['房貸主題影片', 'PLUuw-6j7Az84n9XshPwadjGTzPxFEovlJ'],
  safety: ['交易安全影片', 'PLUuw-6j7Az84D2zp0INmi9ymLvFQ6v08V'],
  sellerTax: ['賣房稅務影片', 'PLUuw-6j7Az84SCV4e0nOTkoJeL2kGJLTm'],
  holdingTax: ['持有稅影片', 'PLUuw-6j7Az86RvmdRtm_ZvINpJulPcw-B'],
  inheritance: ['繼承贈與影片', 'PLUuw-6j7Az84ohd1y17s3iF1eUjTXcB8J'],
  policy: ['市場政策影片', 'PLUuw-6j7Az861hBh7MnHvJlu_IuvC39jc'],
  buyer: ['買房注意與AI試算', 'PLUuw-6j7Az84GHZMSuoAWiY2HSEHU8xcX'],
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base = { mode: 'active', replyToken: 'offline-only', source: { type: 'user' }, type: 'message', message: { type: 'text', text: '服務導覽' } };
function enable(t, account) {
  for (const [key, value] of [['HG_SERVICE_PILOT_ENABLED', 'true'], [account.enabledEnv, 'true'], [config.NATIVE_TEST_FLAGS[account.key], 'true'], [config.NATIVE_PUBLIC_FLAGS[account.key], 'true'], [config.NATIVE_DOCUMENT_FLAGS[account.key], 'false']].filter(([key]) => key)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
}
function walk(value, fn) { if (!value || typeof value !== 'object') return; fn(value); Object.values(value).forEach(child => walk(child, fn)); }
function viewsFor(account) {
  const options = { account };
  const views = { welcome: buildWelcomeReply(options) };
  const queue = Object.keys(TEXT_TRIGGERS).map(text => routeEvent({ ...base, message: { type: 'text', text } }, options));
  while (queue.length) {
    const view = queue.shift(); if (!view || views[view.route]) continue;
    views[view.route] = view;
    walk(view, node => { if (node.type === 'postback' && node.data.startsWith(PILOT_PREFIX)) queue.push(routeEvent({ ...base, type: 'postback', postback: { data: node.data } }, options)); });
  }
  for (const route of ROUTES) views['native:' + route] = buildNativeGuide(route, options);
  views['candidate:entry:buy'] = buildTransactionEntryCandidate(options);
  views['candidate:entry:loan'] = buildServiceEntryPreview('loan', options);
  return views;
}
const videoActions = message => (message.quickReply?.items || []).map(item => item.action).filter(isVideoQuickReplyAction);

test('seven URI actions match the exact approved public playlists and semantic labels', () => {
  assert.deepEqual(Object.keys(VIDEO_PLAYLISTS).sort(), Object.keys(expected).sort());
  for (const [key, [label, id]] of Object.entries(expected)) {
    assert.deepEqual(VIDEO_PLAYLISTS[key], { label, uri: 'https://www.youtube.com/playlist?list=' + id });
    assert.ok(Object.isFrozen(VIDEO_PLAYLISTS[key]));
    assert.ok(label.length <= 20); assert.doesNotMatch(label, /\d+部|%|保證|核准|固定利率/);
  }
  assert.equal(new Set(Object.values(VIDEO_PLAYLISTS).map(x => x.uri)).size, 7);
  assert.deepEqual(VIDEO_NATIVE_ALIASES, ['主題影片', '影片清單', '影音導覽']);
});

test('all 420 payloads restore historical SHA after exact discovery, image, video and A-entry additions are normalized', t => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/video-baseline-hashes.json', import.meta.url)));
  assert.equal(fixture.baselineCommit, '3617f088b2c42fa1a95562190343fc3dc0f80bd3');
  let checked = 0;
  for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
    enable(t, account);
    const views = viewsFor(account.account), baseline = fixture.views[account.account];
    assert.deepEqual(Object.keys(views).sort(), Object.keys(baseline).sort());
    for (const [route, view] of Object.entries(views)) {
      const original = originalImageFreePayload(view, account.account);
      assert.equal(hash(stripVideoQuickReplies(original)), baseline[route].payloadSha256, account.account + ' ' + route);
      assert.equal(hash(original.messages.map(message => message.contents ?? message.text)), baseline[route].contentsSha256, 'cards and texts are unchanged');
      checked++;
    }
  }
  assert.equal(checked, 420);
});

test('topic mappings cover loan, safety, both roles, inheritance, policy and holding tax without unknown-route links', () => {
  for (const [namespace, routes, keys] of [
    ['native', ['finance', 'finance:options', 'finance:salary', 'finance:conditions'], ['loan']],
    ['native', ['process', 'step:3', 'detail:4', 'closing', 'documents:contract'], ['safety']],
    ['native', ['buyer', 'process:buyer', 'buyer:step:2'], ['buyer', 'safety']],
    ['native', ['seller', 'process:seller', 'seller:detail:8'], ['sellerTax', 'safety']],
    ['pilot', ['buy'], ['buyer', 'safety']], ['pilot', ['sell'], ['sellerTax', 'safety']],
    ['pilot', ['loan'], ['loan']], ['pilot', ['inherit'], ['inheritance']],
    ['pilot', ['land'], ['policy']], ['pilot', ['owner'], ['holdingTax']],
  ]) for (const route of routes) assert.deepEqual(videoQuickReplyActions({ namespace, route }), keys.map(key => ({ type: 'uri', ...VIDEO_PLAYLISTS[key] })));
  for (const route of ['invalid', 'secret', 'finance:unknown', 'docs:choose', 'buyer:step:9']) assert.deepEqual(videoQuickReplyActions({ namespace: 'native', route }), []);
});

test('all group and room public routes preserve the baseline payload and card hashes without exposing the private native video hub', async t => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/video-baseline-hashes.json', import.meta.url)));
  let checked = 0;
  for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
    enable(t, account);
    for (const sourceType of ['group', 'room']) for (const route of [...ROUTES, 'entry:buy']) {
      const result = await dispatch.getPilotReply({ ...base, source: { type: sourceType }, type: 'postback', postback: { data: PREFIX + route } }, account.destination, { account: account.key });
      const prior = fixture.sharedViews[account.account][sourceType + ':native:' + route];
      const original = originalImageFreePayload(result, account.account);
      assert.equal(hash(stripVideoQuickReplies(original)), prior.payloadSha256);
      assert.equal(hash(original.messages.map(message => message.contents ?? message.text)), prior.contentsSha256);
      for (const message of result.messages) {
        assert.ok((message.quickReply?.items.length || 0) <= 13);
        assert.ok(!videoActions(message).some(action => action.type === 'message'));
      }
      checked++;
    }
  }
  assert.equal(checked, 408);
});

test('every real quick reply preserves LINE bounds and admits only the exact authorized URI or native handoff', t => {
  let maximum = 0;
  for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
    enable(t, account);
    for (const view of Object.values(viewsFor(account.account))) for (const message of view.messages) {
      const items = message.quickReply?.items || []; maximum = Math.max(maximum, items.length);
      assert.ok(items.length <= 13);
      for (const item of items) {
        assert.equal(item.type, 'action'); assert.ok(item.action.label.length > 0 && item.action.label.length <= 20);
        if (item.action.type === 'uri') { assert.ok(isVideoQuickReplyAction(item.action)); assert.ok(item.action.uri.length <= 1000); }
      }
      assert.equal(new Set(videoActions(message).map(action => JSON.stringify(action))).size, videoActions(message).length);
    }
  }
  assert.ok(maximum > 0);
});

test('appending is pure, repeatable, preserves original items and never exceeds thirteen quick replies', () => {
  const make = count => ({ type: 'flex', quickReply: { items: Array.from({ length: count }, (_, i) => ({ type: 'action', action: { type: 'postback', label: '原按鈕' + i, data: 'hgchat:v2:home' } })) } });
  for (const count of [0, 11, 12, 13]) {
    const input = make(count), saved = structuredClone(input), context = { namespace: 'pilot', route: 'buy' };
    const result = appendVideoQuickReplies(input, context);
    assert.deepEqual(input, saved); assert.deepEqual(result.quickReply.items.slice(0, count), input.quickReply.items);
    assert.equal(result.quickReply.items.length, Math.min(13, count + 2));
    assert.deepEqual(appendVideoQuickReplies(result, context), result);
  }
  const foreign = { type: 'uri', label: '交易安全影片', uri: 'https://evil.example' };
  assert.equal(isVideoQuickReplyAction(foreign), false);
  const result = stripVideoQuickReplies({ quickReply: { items: [{ type: 'action', action: foreign }] } });
  assert.deepEqual(result.quickReply.items[0].action, foreign, 'baseline stripping cannot hide unapproved links');
});

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  test(`${account.account}: native 返回服務導覽 text is valid; private hub and shared public topic links remain separate`, async t => {
    enable(t, account);
    const send = event => dispatch.getPilotReply({ ...base, ...event }, account.destination, { account: account.key });
    for (const sourceType of ['user', 'group', 'room']) {
      const source = { type: sourceType };
      const home = await send({ source }); assert.equal(home.route, 'native:home');
      assert.deepEqual(videoActions(home.messages[0]), sourceType === 'user' ? [VIDEO_HUB_ACTION] : []);
      for (const input of [
        { message: { type: 'text', text: '服務導覽：貸款選項' } },
        { type: 'postback', postback: { data: PREFIX + 'finance:options' } },
      ]) {
        const event = { ...input, source, deliveryContext: { isRedelivery: true } };
        const first = await send(event); assert.equal(first.route, 'native:finance:options');
        assert.deepEqual(first.messages[0].contents.footer.contents[0].action, { type: 'message', label: '新青安3.0', text: '新青安' });
        assert.deepEqual(videoActions(first.messages[0]), [{ type: 'uri', ...VIDEO_PLAYLISTS.loan }]);
        assert.deepEqual(await send(event), first);
        first.messages[0].quickReply.items.at(-1).action.label = 'mutated';
        assert.equal((await send(event)).messages[0].quickReply.items.at(-1).action.label, '房貸主題影片');
      }
      const a = await send({ source, message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } });
      assert.equal(a.messages.length, 3); assert.equal(a.messages[2].contents.contents.length, 8);
      assert.deepEqual(a.messages[1], buildTransactionProcessImageMessage());
      assert.deepEqual(videoActions(a.messages[2]), [{ type: 'uri', ...VIDEO_PLAYLISTS.safety }]);
    }
    assert.deepEqual(videoActions(buildWelcomeReply({ account: account.account }).messages[1]), [VIDEO_HUB_ACTION]);
    assert.deepEqual(videoActions((await send({ type: 'postback', postback: { data: PREFIX + 'services' } })).messages[0]), [VIDEO_HUB_ACTION]);
    const legacy = await send({ type: 'postback', postback: { data: LEGACY_PREFIX + 'finance:options' } });
    assert.equal(legacy.messages[0].contents.footer.contents[0].action.text, '新青安');
    const registration = await send({ type: 'postback', postback: { data: PILOT_PREFIX + 'owner:guide:prepare' } });
    assert.equal(registration.messages[0].contents.contents[0].footer.contents[0].action.uri, OWNER_REGISTER_URI);
  });
  test(`${account.account}: all native video aliases, unknown texts and invalid contexts produce no webhook reply`, async t => {
    enable(t, account);
    for (const type of ['user', 'group', 'room']) for (const text of [...VIDEO_NATIVE_ALIASES, '服務導覽：主題影片', '主題影片 ', '新青安', '官方', '官方服務'])
      assert.equal(await dispatch.getPilotReply({ ...base, source: { type }, message: { type: 'text', text } }, account.destination, { account: account.key }), null);
    for (const changes of [{ mode: 'standby' }, { replyToken: '' }, { type: 'join' }, { type: 'message', message: { type: 'image' } }])
      assert.equal(await dispatch.getPilotReply({ ...base, ...changes }, account.destination, { account: account.key }), null);
    assert.equal(await dispatch.getPilotReply(base, 'wrong-destination', { account: account.key }), null);
    const flag = config.NATIVE_PUBLIC_FLAGS[account.key]; process.env[flag] = 'false';
    assert.equal(await dispatch.getPilotReply(base, account.destination, { account: account.key }), null);
    const welcome = buildWelcomeReply({ account: account.account });
    assert.deepEqual(videoActions(welcome.messages[1]), []);
  });
}
