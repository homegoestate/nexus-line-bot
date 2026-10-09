// Trusted server configuration only. No incoming event can enable this feature.
const NATIVE_TEST_PREFIX = 'hgchat-test:v1:';
const NATIVE_TEST_TRIGGER = '測試服務導覽';
const NATIVE_GUIDE_PREFIX = 'hgchat:v2:';
const PUBLIC_TEXT_TRIGGERS = Object.freeze(['服務導覽','備件清單']);
const NATIVE_PUBLIC_FLAGS = Object.freeze({
  '604gpqef':'HG_NATIVE_PUBLIC_604GPQEF_ENABLED',
  '528scwxf':'HG_NATIVE_PUBLIC_528SCWXF_ENABLED',
  '375umdzq':'HG_NATIVE_PUBLIC_375UMDZQ_ENABLED',
});
function isNativePublicEnabled(key) { return Object.hasOwn(NATIVE_PUBLIC_FLAGS,key) && process.env[NATIVE_PUBLIC_FLAGS[key]] === 'true'; }
function isPublicNativeEvent(event) {
  return event?.type === 'message' && event.message?.type === 'text' && typeof event.message.text === 'string' &&
    (PUBLIC_TEXT_TRIGGERS.includes(event.message.text) || event.message.text.startsWith('服務導覽：'));
}
const NATIVE_DOCUMENT_FLAGS = Object.freeze({
  '604gpqef': 'HG_NATIVE_DOCS_604GPQEF_ENABLED',
  '528scwxf': 'HG_NATIVE_DOCS_528SCWXF_ENABLED',
  '375umdzq': 'HG_NATIVE_DOCS_375UMDZQ_ENABLED',
});
function isNativeDocumentEnabled(key) {
  return Object.hasOwn(NATIVE_DOCUMENT_FLAGS, key) && process.env[NATIVE_DOCUMENT_FLAGS[key]] === 'true';
}
const NATIVE_TEST_FLAGS = Object.freeze({
  '604gpqef': 'HG_NATIVE_TEST_604GPQEF_ENABLED',
  '528scwxf': 'HG_NATIVE_TEST_528SCWXF_ENABLED',
  '375umdzq': 'HG_NATIVE_TEST_375UMDZQ_ENABLED',
});
function isNativeTestEnabled(key) {
  return Object.hasOwn(NATIVE_TEST_FLAGS, key) && process.env[NATIVE_TEST_FLAGS[key]] === 'true';
}
function isNativeTestEvent(event) {
  if (event?.type === 'postback') return typeof event.postback?.data === 'string' && (event.postback.data.startsWith(NATIVE_TEST_PREFIX) || event.postback.data.startsWith(NATIVE_GUIDE_PREFIX));
  return event?.type === 'message' && event.message?.type === 'text' &&
    (event.message.text === NATIVE_TEST_TRIGGER || (typeof event.message.text === 'string' && event.message.text.startsWith('測試導覽：')) || isPublicNativeEvent(event));
}
module.exports = { NATIVE_TEST_PREFIX, NATIVE_TEST_TRIGGER, NATIVE_GUIDE_PREFIX, NATIVE_TEST_FLAGS, NATIVE_PUBLIC_FLAGS, PUBLIC_TEXT_TRIGGERS, isNativePublicEnabled, isPublicNativeEvent, NATIVE_DOCUMENT_FLAGS, isNativeDocumentEnabled, isNativeTestEnabled, isNativeTestEvent };
