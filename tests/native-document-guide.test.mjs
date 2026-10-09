import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSnapshot, encodeSnapshot, parseSnapshot, buildDocumentGuide, summarizeSnapshot, routeDocumentGuide, DOCUMENT_PREFIX, LEGACY_DOCUMENT_PREFIX, DOCUMENT_TRIGGER, INCOMES } from '../lib/native-document-guide.mjs';
import { buildNativeGuide, routeNativeGuide } from '../lib/native-chat-guide.mjs';
import { routeEvent } from '../lib/flow-router.mjs';
import config from '../lib/native-guide-config.js';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
const base = { type: 'message', mode: 'active', source: { type: 'user', userId: 'synthetic-only' }, replyToken: 'synthetic-reply', message: { type: 'text', text: DOCUMENT_TRIGGER } };
function walk(x, fn) { if (!x || typeof x !== 'object') return; fn(x); Object.values(x).forEach(c => walk(c, fn)); }
function actions(result) { const out = []; walk(result, n => { if (n.type === 'postback') out.push(n); }); return out; }
function apply(s, op, index, view = 'list') { return parseSnapshot(encodeSnapshot(s, view, op, index)).snapshot; }
test('all public snapshot combinations round-trip and never gain verified or submission authority', () => {
  let count = 0;
  for (let incomes = 0; incomes < 64; incomes++) for (let reported = 0; reported < 64; reported++) for (let requested = 0; requested < 64; requested++) {
    if ((reported & ~incomes) || (requested & ~incomes)) continue;
    const s = { incomes, reported, requested };
    assert.deepEqual(parseSnapshot(encodeSnapshot(s, 'summary')), { snapshot: s, view: 'summary' });
    const summary = summarizeSnapshot(s);
    assert.equal(summary.total, incomes.toString(2).replaceAll('0', '').length);
    assert.equal(summary.reported + summary.pending, summary.total);
    assert.equal(summary.verified, 0); assert.equal(summary.bankRequirementsVerified, false);
    assert.equal(summary.caseSubmitted, false); assert.equal(summary.registrationConfirmed, false);
    count++;
  }
  assert.equal(count, 15625);
});
test('multi-income uses original v0.3.0 classification and never includes company or category rows in customer totals', () => {
  const s = { incomes: 63, reported: 0, requested: 0 }, summary = summarizeSnapshot(s);
  assert.equal(summary.total, 6);
  assert.deepEqual(summary.companyItems, ['借款人身分證明', '本次房地資料', '買賣契約']);
  assert.doesNotMatch(summary.pendingItems.join(','), /身分|契約|混合收入整理|其他資產|401|403|405/);
  assert.match(JSON.stringify(buildDocumentGuide(s, 'company')), /責任歸屬不表示已送銀行/);
  assert.match(JSON.stringify(buildDocumentGuide(s, 'list')), /401／403／405依適用稅制配置，非全部繳交/);
});
test('report and reversal are explicit idempotent snapshot actions; no receipt or case completion', () => {
  const start = initialSnapshot('salary');
  const submitted = apply(start, 'report', 0);
  assert.equal(summarizeSnapshot(submitted).reported, 1);
  assert.equal(summarizeSnapshot(submitted).pending, 0);
  assert.deepEqual(apply(submitted, 'report', 0), submitted);
  const undone = apply(submitted, 'unreport', 0);
  assert.deepEqual(undone, start);
  assert.match(JSON.stringify(buildDocumentGuide(submitted, 'summary')), /已交（客戶自報）/);
  assert.match(JSON.stringify(buildDocumentGuide(submitted, 'summary')), /暫無；仍需銀行確認完整清單/);
  assert.match(JSON.stringify(buildDocumentGuide(submitted, 'summary')), /沒有任何已核實收件/);
});
test('customer not-applicable requests remain counted and cannot approve their own removal', () => {
  const s = apply(initialSnapshot('salary'), 'ask', 0), summary = summarizeSnapshot(s);
  assert.equal(summary.pending, 1); assert.equal(summary.total, 1);
  assert.equal(summary.pendingNotApplicable.length, 1);
  assert.match(JSON.stringify(buildDocumentGuide(s, 'list')), /仍列在本清單/);
  assert.deepEqual(apply(s, 'withdraw', 0), initialSnapshot('salary'));
  for (const command of ['verify0', 'approve0', 'companySubmit0', 'submitted0']) assert.equal(parseSnapshot(DOCUMENT_PREFIX + '1.0.0:list:' + command), null);
});
test('changing incomes clears only removed branch flags; no resurrection or empty-list completion', () => {
  let s = apply(initialSnapshot('salary'), 'in', 5, 'choose');
  s = apply(s, 'report', 0); s = apply(s, 'ask', 5);
  s = apply(s, 'out', 0, 'choose');
  assert.deepEqual(s, { incomes: 32, reported: 0, requested: 32 });
  s = apply(s, 'in', 0, 'choose');
  assert.equal(s.reported, 0);
  assert.match(JSON.stringify(buildDocumentGuide(initialSnapshot(), 'summary')), /不代表文件已齊/);
});
test('malformed or forged public inputs fail closed without echoing personal data or adding authority', () => {
  const bad = ['01.0.0:list', 'zz.0.0:list', '0.1.0:list', '0.0.1:list', '1.0.0:list:report5', '1.0.0:company:report0', '1.0.0:list:in0', '1.0.0:list:report6', '1.0.0:list?caseId=secret', '1.0.0:list:verify0', '1.0.0:summary:report0', 'x'.repeat(100)];
  for (const suffix of bad) {
    const result = routeDocumentGuide({ type: 'postback', postback: { data: DOCUMENT_PREFIX + suffix } });
    assert.equal(result.route, 'native:documents:invalid');
    assert.doesNotMatch(JSON.stringify(result), /secret|caseId|userId/);
  }
  assert.throws(() => encodeSnapshot({ incomes: 1, reported: 0, requested: 0, verified: 1 }));
});
test('all 64 selections and views fit native LINE Flex bounds and offer working navigation', () => {
  for (let incomes = 0; incomes < 64; incomes++) for (const view of ['choose', 'list', 'company', 'summary']) {
    const output = buildDocumentGuide({ incomes, reported: incomes, requested: incomes }, view), message = output.messages[0];
    assert.equal(message.type, 'flex'); assert.ok(message.altText.length <= 400);
    const cards = message.contents.type === 'carousel' ? message.contents.contents : [message.contents];
    assert.ok(cards.length <= 12); assert.ok(Buffer.byteLength(JSON.stringify(message.contents)) < 50000);
    for (const card of cards) { assert.ok(Buffer.byteLength(JSON.stringify(card)) < 30000); assert.ok((card.footer?.contents.length || 0) <= 3); }
    assert.ok(message.quickReply.items.length <= 13);
    walk(message, n => {
      if (n.type === 'text') assert.ok(n.text.length > 0 && n.text.length <= 2000);
      if (n.type === 'postback') { assert.ok(n.label.length <= 20); assert.ok(n.data.length <= 80); if (n.data.startsWith(DOCUMENT_PREFIX)) assert.ok(parseSnapshot(n.data)); }
      assert.ok(!['video', 'image', 'uri'].includes(n.type));
    });
    assert.doesNotMatch(JSON.stringify(message), /https?:\/\/|offline_snapshot|offline_reader|caseId|userId|synthetic/);
  }
});
test('old cards and rapid taps are explicitly independent snapshots; no persistence, merges or cross-user state', () => {
  const data = encodeSnapshot(initialSnapshot('salary'), 'list', 'report', 0), event = { ...base, type: 'postback', postback: { data, staff: true, verified: true, caseId: 'secret-case' } };
  const first = routeDocumentGuide(event);
  for (let i = 0; i < 30; i++) assert.deepEqual(routeDocumentGuide({ ...event, webhookEventId: 'test-' + i }), first);
  assert.match(JSON.stringify(first), /舊卡各自獨立/);
  first.messages[0].altText = 'mutated';
  assert.notEqual(routeDocumentGuide(event).messages[0].altText, 'mutated');
  assert.equal(summarizeSnapshot(initialSnapshot('salary')).reported, 0);
});
test('new flags fail closed per account and preserve exact old guide while disabled', async t => {
  for (const [key, flag] of Object.entries(config.NATIVE_DOCUMENT_FLAGS)) {
    const previous = process.env[flag]; delete process.env[flag];
    t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
    const publicFlag = config.NATIVE_PUBLIC_FLAGS[key], publicOld = process.env[publicFlag]; process.env[publicFlag] = 'true';
    t.after(() => { if (publicOld === undefined) delete process.env[publicFlag]; else process.env[publicFlag] = publicOld; });
    const oldEvent = { ...base, message: { type: 'text', text: '測試服務導覽' } };
    assert.deepEqual(routeNativeGuide(oldEvent, '@' + key), buildNativeGuide('home'));
    assert.equal(routeNativeGuide(base, '@' + key), null);
    for (const bad of ['TRUE', '1', 'false', '']) { process.env[flag] = bad; assert.equal(routeNativeGuide(base, '@' + key), null); }
    process.env[flag] = 'true';
    assert.equal(routeNativeGuide(base, '@' + key).route, 'native:documents:choose');
    const account = accounts.getServiceAccount(key), nativeFlag = config.NATIVE_TEST_FLAGS[key], pilotFlag = account.enabledEnv;
    const nativeOld = process.env[nativeFlag], pilotOld = pilotFlag ? process.env[pilotFlag] : undefined;
    process.env[nativeFlag] = 'true'; if (pilotFlag) process.env[pilotFlag] = 'true';
    t.after(() => { if (nativeOld === undefined) delete process.env[nativeFlag]; else process.env[nativeFlag] = nativeOld; if (pilotFlag) { if (pilotOld === undefined) delete process.env[pilotFlag]; else process.env[pilotFlag] = pilotOld; } });
    assert.equal((await dispatch.getPilotReply(base, account.destination, { account: key })).route, 'native:documents:choose');
    assert.equal(await dispatch.getPilotReply(base, 'wrong-destination', { account: key }), null);
    const entry = routeNativeGuide(oldEvent, '@' + key);
    assert.ok(actions(entry).some(a => a.data.startsWith(DOCUMENT_PREFIX)));
    const finance = routeNativeGuide({ ...oldEvent, type: 'postback', postback: { data: config.NATIVE_TEST_PREFIX + 'finance:business' } }, '@' + key);
    const seeded = actions(finance).find(a => a.data.startsWith(DOCUMENT_PREFIX));
    assert.equal(parseSnapshot(seeded.data).snapshot.incomes, 4);
    for (const other of Object.keys(config.NATIVE_DOCUMENT_FLAGS).filter(x => x !== key)) assert.equal(config.isNativeDocumentEnabled(other), false);
    delete process.env[flag];
  }
});
test('source context and trusted account restrictions still reject groups, standby and legacy keywords', () => {
  for (const type of ['group', 'room']) assert.equal(routeNativeGuide({ ...base, source: { type } }, '@604gpqef'), null);
  assert.equal(routeNativeGuide({ ...base, mode: 'standby' }, '@604gpqef'), null);
  assert.equal(routeNativeGuide(base, '@unknown'), null);
  for (const text of ['買賣流程', '貸款', '估價', DOCUMENT_TRIGGER + ' ']) assert.equal(routeEvent({ ...base, message: { type: 'text', text } }), null);
});

test('historical document postbacks and text aliases retain snapshot meaning with current customer labels',()=>{
  const s={incomes:5,reported:1,requested:4};
  for(const view of ['choose','list','company','summary']){
    const data=encodeSnapshot(s,view),legacy=LEGACY_DOCUMENT_PREFIX+data.slice(DOCUMENT_PREFIX.length);
    assert.deepEqual(parseSnapshot(legacy),parseSnapshot(data));assert.deepEqual(routeDocumentGuide({type:'postback',postback:{data:legacy}}),buildDocumentGuide(s,view));assert.doesNotMatch(JSON.stringify(buildDocumentGuide(s,view)),/測試導覽|備件勾選測試|備件測試快照/);
  }
  assert.deepEqual(routeDocumentGuide({type:'message',message:{type:'text',text:'測試導覽：備件勾選'}}),buildDocumentGuide());
});
