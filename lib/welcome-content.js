// Public copy only. Never put credentials or customer data in this file or JSON.
const ACCOUNT_IDS = Object.freeze(['@604gpqef', '@528scwxf', '@375umdzq']);
const BRAND = '宏國地政|易丞地政';
const FALLBACK = `您好，歡迎加入${BRAND}。\n可從下方選擇目前的需求，先整理準備事項。\n需要進一步協助時，可送出需求摘要；個案內容與下一步由人工另行確認。`;

function validateWelcomeMessages(value) {
  const fail = () => { throw new Error('INVALID_WELCOME_COPY'); };
  const plain = item => item && typeof item === 'object' && !Array.isArray(item) && Object.getPrototypeOf(item) === Object.prototype;
  if (!plain(value) || Object.keys(value).sort().join(',') !== 'accounts,version' ||
      typeof value.version !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.version) || !plain(value.accounts)) fail();
  if (Object.keys(value.accounts).sort().join(',') !== [...ACCOUNT_IDS].sort().join(',')) fail();
  for (const id of ACCOUNT_IDS) {
    const copy = value.accounts[id];
    if (!plain(copy) || Object.keys(copy).sort().join(',') !== 'label,paragraphs' ||
        typeof copy.label !== 'string' || !copy.label.trim() || copy.label.length > 60 ||
        !Array.isArray(copy.paragraphs) || copy.paragraphs.length < 1 || copy.paragraphs.length > 8) fail();
    for (const paragraph of copy.paragraphs) {
      if (typeof paragraph !== 'string' || !paragraph.trim() || paragraph.length > 400 ||
          /\{Nickname\}|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/i.test(paragraph)) fail();
    }
    const text = copy.paragraphs.join('\n\n');
    if (text.length > 900 || !text.includes(BRAND)) fail();
  }
  return true;
}

let snapshot = null;
try {
  const data = require('../welcome-messages.json');
  validateWelcomeMessages(data);
  // Snapshot strings so returned content cannot mutate a different account.
  snapshot = Object.freeze({ version: data.version, texts: Object.freeze(Object.fromEntries(
    ACCOUNT_IDS.map(id => [id, data.accounts[id].paragraphs.join('\n\n')])
  )) });
} catch {
  // A damaged copy file must not take down the existing six-service guide.
  snapshot = null;
}

function buildWelcomeText(account) {
  if (!ACCOUNT_IDS.includes(account)) return null;
  return snapshot ? snapshot.texts[account] : FALLBACK;
}
function welcomeContentRevision() { return snapshot?.version || null; }
module.exports = { buildWelcomeText, welcomeContentRevision, validateWelcomeMessages };
