const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = require('../welcome-messages.json');
const { buildWelcomeText, welcomeContentRevision, validateWelcomeMessages } = require('../lib/welcome-content');
const ids = ['@604gpqef', '@528scwxf', '@375umdzq'];
const clone = value => JSON.parse(JSON.stringify(value));

test('all three independent welcome texts match the editable JSON exactly', () => {
  assert.equal(validateWelcomeMessages(config), true);
  assert.equal(welcomeContentRevision(), config.version);
  const texts = ids.map(id => buildWelcomeText(id));
  assert.equal(new Set(texts).size, 3);
  for (const id of ids) assert.equal(buildWelcomeText(id), config.accounts[id].paragraphs.join('\n\n'));
  assert.match(buildWelcomeText(ids[0]), /團隊|買賣過戶/);
  assert.match(buildWelcomeText(ids[1]), /我是楊翊晟地政士/);
  assert.match(buildWelcomeText(ids[1]), /上班時間撥打 06-258-2589/);
  assert.match(buildWelcomeText(ids[2]), /建案服務中心/);
  assert.match(buildWelcomeText(ids[2]), /已登錄者請勿重複送出/);
});

test('public copy has usable navigation and no unsupported placeholders or promises', () => {
  for (const id of ids) {
    const text = buildWelcomeText(id);
    assert.ok(text.length <= 500);
    assert.match(text, /宏國地政\|易丞地政/);
    assert.match(text, /請代書協助下一步/);
    assert.match(text, /請先勿傳送身分證、帳戶或完整契約/);
    assert.doesNotMatch(text, /\{Nickname\}|案件進度|完全看不到|VIP|優先處理|免費通話|保證|右下角|服務項目一覽/);
  }
});

test('invalid schemas, empty copy, wrong account keys and placeholders are rejected', () => {
  const invalid = [null, [], {}, { ...config, extra: true }];
  const mutate = fn => { const value = clone(config); fn(value); invalid.push(value); };
  mutate(v => { v.accounts['@wrong'] = v.accounts['@604gpqef']; });
  mutate(v => { delete v.accounts['@375umdzq']; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = []; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = ['']; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = [null]; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = ['宏國地政|易丞地政 {Nickname}您好']; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = ['宏國地政|易丞地政\u0000']; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = ['x'.repeat(401)]; });
  mutate(v => { v.accounts['@604gpqef'].paragraphs = ['宏國地政|易丞地政', ...Array(3).fill('x'.repeat(350))]; });
  mutate(v => { v.version = ''; });
  for (const value of invalid) assert.throws(() => validateWelcomeMessages(value), /INVALID_WELCOME_COPY/);
  for (const id of ['604gpqef', '@unknown', null, {}, '__proto__']) assert.equal(buildWelcomeText(id), null);
});

test('malformed or missing copy file safely falls back without breaking guide import', () => {
  const code = fs.readFileSync(require.resolve('../lib/welcome-content'), 'utf8');
  for (const mode of ['missing', 'invalid']) {
    const context = { module: { exports: {} }, require: name => {
      assert.equal(name, '../welcome-messages.json');
      if (mode === 'missing') throw new Error('test-file-unavailable');
      return {};
    } };
    vm.runInNewContext(code, context);
    assert.equal(context.module.exports.welcomeContentRevision(), null);
    for (const id of ids) assert.match(context.module.exports.buildWelcomeText(id), /宏國地政\|易丞地政/);
  }
});

test('returned texts are immutable snapshots, not shared mutable config references', () => {
  const previous = config.accounts[ids[0]].paragraphs[0];
  const expected = buildWelcomeText(ids[0]);
  try {
    config.accounts[ids[0]].paragraphs[0] = 'temporary-test-marker';
    assert.equal(buildWelcomeText(ids[0]), expected);
    assert.doesNotMatch(buildWelcomeText(ids[1]), /temporary-test-marker/);
  } finally { config.accounts[ids[0]].paragraphs[0] = previous; }
});
