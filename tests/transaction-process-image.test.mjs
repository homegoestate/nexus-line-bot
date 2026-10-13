import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import dispatch from '../lib/pilot-dispatch.js';
import { buildNativeGuide, PREFIX } from '../lib/native-chat-guide.mjs';
import { buildServiceEntryPreview, buildTransactionEntryCandidate, CANDIDATE_ENTRY_TEXTS, CANDIDATE_ENTRY_PREFIX } from '../lib/service-entry-candidate.mjs';
import { TRANSACTION_PROCESS_IMAGE, buildTransactionProcessImageMessage } from '../lib/transaction-process-image.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const event = { mode: 'active', replyToken: 'offline-image', source: { type: 'user' }, type: 'message', message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } };
function enable(t, account) {
  for (const [key, value] of [['HG_SERVICE_PILOT_ENABLED', 'true'], [account.enabledEnv, 'true'], [config.NATIVE_TEST_FLAGS[account.key], 'true'], [config.NATIVE_PUBLIC_FLAGS[account.key], 'true']].filter(([key]) => key)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => old === undefined ? delete process.env[key] : process.env[key] = old);
  }
}

test('image payload plans one HTTPS JPEG for original and preview with no crop or rewrite parameters', () => {
  const message = buildTransactionProcessImageMessage();
  assert.deepEqual(Object.keys(message).sort(), ['originalContentUrl', 'previewImageUrl', 'type']);
  assert.equal(message.type, 'image'); assert.equal(message.originalContentUrl, message.previewImageUrl);
  const uri = new URL(message.originalContentUrl);
  assert.equal(uri.protocol, 'https:'); assert.equal(uri.hostname, 'nexus-line-bot.vercel.app');
  assert.equal(uri.pathname, '/images/transaction-process-responsibilities-20261013.jpg');
  assert.equal(uri.search, ''); assert.equal(uri.hash, '');
  // Expected values from the parent's verified corrected JPEG, not the old file.
  assert.deepEqual([TRANSACTION_PROCESS_IMAGE.width, TRANSACTION_PROCESS_IMAGE.height, TRANSACTION_PROCESS_IMAGE.byteLength], [1536, 1024, 776323]);
  assert.equal(TRANSACTION_PROCESS_IMAGE.sha256, '05302c9b976f6cb253e5d2587f380dfbded63d0b010e7efd083b533aea885136');
  assert.ok(TRANSACTION_PROCESS_IMAGE.byteLength < 1024 * 1024, 'one unmodified JPEG fits the preview size limit');
  assert.equal(TRANSACTION_PROCESS_IMAGE.width / TRANSACTION_PROCESS_IMAGE.height, 1.5);
});

for (const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
  test(`${account.account}: first guide, second complete image, third unchanged eight stages on both exact A entrances`, async t => {
    enable(t, account);
    const options = { account: account.account };
    const overview = buildNativeGuide('process', options).messages[0];
    const entrance = buildServiceEntryPreview('buy', options).messages[0];
    const expected = buildTransactionEntryCandidate(options);
    assert.deepEqual(expected.messages.map(message => message.type), ['flex', 'image', 'flex']);
    assert.deepEqual(expected.messages[0], entrance);
    assert.deepEqual(expected.messages[1], buildTransactionProcessImageMessage());
    assert.equal(hash(expected.messages[2]), hash(overview), 'entire eight-stage message including old/video quick replies is unchanged');
    assert.match(JSON.stringify(expected.messages[0]), /以本案契約、銀行及承辦通知為準/);
    for (const type of ['user', 'group', 'room']) for (const input of [
      { message: { type: 'text', text: CANDIDATE_ENTRY_TEXTS.buy } },
      { type: 'postback', postback: { data: CANDIDATE_ENTRY_PREFIX + 'buy' } },
    ]) {
      const changed = { ...event, ...input, source: { type }, deliveryContext: { isRedelivery: true } };
      const result = await dispatch.getPilotReply(changed, account.destination, { account: account.key });
      assert.deepEqual(result.messages, expected.messages);
      assert.equal(result.messages.length, 3); assert.equal(result.messages[2].contents.contents.length, 8);
      assert.deepEqual((await dispatch.getPilotReply(changed, account.destination, { account: account.key })).messages, expected.messages);
    }
  });
  test(`${account.account}: old process callbacks and original native keywords do not enter the new image reply`, async t => {
    enable(t, account);
    for (const sourceType of ['user', 'group', 'room']) {
      const base = { ...event, source: { type: sourceType } };
      const process = await dispatch.getPilotReply({ ...base, type: 'postback', postback: { data: PREFIX + 'process' } }, account.destination, { account: account.key });
      assert.equal(process.messages.length, 1); assert.equal(process.messages[0].type, 'flex');
      const loan = await dispatch.getPilotReply({ ...base, message: { type: 'text', text: '服務導覽：貸款選項' } }, account.destination, { account: account.key });
      assert.equal(loan.messages[0].contents.footer.contents[0].action.text, '新青安');
      for (const text of ['買賣', '買賣流程', '新青安', '收支比', '官方服務'])
        assert.equal(await dispatch.getPilotReply({ ...base, message: { type: 'text', text } }, account.destination, { account: account.key }), null);
    }
  });
}
