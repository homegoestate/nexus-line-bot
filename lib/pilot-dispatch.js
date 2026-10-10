// Additive pilot: no database writes and no interception of legacy keywords.
const { DEFAULT_ACCOUNT, SERVICE_ACCOUNTS, getServiceAccount, isAccountEnabled } = require('./service-accounts');
const { isNativeTestEvent, isNativeTestEnabled, isPublicNativeEvent, isNativePublicEnabled, isSharedPublicGuideEvent } = require('./native-guide-config');
const PILOT_DESTINATION = SERVICE_ACCOUNTS[DEFAULT_ACCOUNT].destination;
const PILOT_VERSION = 'hgservice-20261010-v9-original-media-entry';
let router;
const TRIGGERS = new Set(['宏國服務體驗', '宏國買房導覽', '宏國房貸導覽', '宏國新屋主導覽', '宏國賣房導覽', '宏國傳承導覽', '宏國土地建商導覽']);

async function getPilotReply(event, destination, options = { account: DEFAULT_ACCOUNT }) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptor = Object.getOwnPropertyDescriptor(options, 'account');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || Reflect.ownKeys(options).length !== 1) return null;
  const account = getServiceAccount(descriptor.value);
  if (!account || !isAccountEnabled(account.key)) return null;
  if (destination !== account.destination || !event ||
      event.mode !== 'active' || (event.source?.type !== 'user' && !isSharedPublicGuideEvent(event)) ||
      typeof event.replyToken !== 'string' || !event.replyToken || event.replyToken.length > 256) return null;
  const isNative = isNativeTestEvent(event);
  if (isNative && !isNativeTestEnabled(account.key)) return null;
  if (isPublicNativeEvent(event) && !isNativePublicEnabled(account.key)) return null;
  if (isSharedPublicGuideEvent(event) && !isNativePublicEnabled(account.key)) return null;
  const isWelcome = event.type === 'follow';
  if (isWelcome) {
    if (process.env.HG_SERVICE_WELCOME_ENABLED === 'false') return null;
    try {
      // This local release policy is confirmed separately from the incoming event.
      const policy = require('../welcome-policy.json');
      if (policy?.accounts?.[account.account]?.nativeGreetingDisabledConfirmed !== true) return null;
    } catch {
      console.error('Service welcome policy unavailable');
      return null;
    }
  }
  const matches = isNative || isWelcome || (event.type === 'message' && event.message?.type === 'text' && TRIGGERS.has(event.message.text)) ||
    (event.type === 'postback' && typeof event.postback?.data === 'string' && event.postback.data.startsWith('hgpilot:v1:'));
  if (!matches) return null;
  try {
    router ||= import('./flow-router.mjs');
    const loaded = await router;
    return isWelcome ? loaded.buildWelcomeReply({ account: account.account }) : loaded.routeEvent(event, { account: account.account });
  } catch {
    router = null;
    console.error('Service pilot unavailable');
    return { messages: [{ type: 'text', text: '服務導覽暫時無法使用，您可以直接在這裡留言說明需求，待人工確認。' }], route: 'unavailable' };
  }
}

module.exports = { getPilotReply, PILOT_DESTINATION, PILOT_VERSION };
