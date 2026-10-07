// Trusted server configuration only. No incoming event can enable this feature.
const NATIVE_TEST_PREFIX = 'hgchat-test:v1:';
const NATIVE_TEST_TRIGGER = '測試服務導覽';
const NATIVE_TEST_FLAGS = Object.freeze({
  '604gpqef': 'HG_NATIVE_TEST_604GPQEF_ENABLED',
  '528scwxf': 'HG_NATIVE_TEST_528SCWXF_ENABLED',
  '375umdzq': 'HG_NATIVE_TEST_375UMDZQ_ENABLED',
});
function isNativeTestEnabled(key) {
  return Object.hasOwn(NATIVE_TEST_FLAGS, key) && process.env[NATIVE_TEST_FLAGS[key]] === 'true';
}
function isNativeTestEvent(event) {
  if (event?.type === 'postback') return typeof event.postback?.data === 'string' && event.postback.data.startsWith(NATIVE_TEST_PREFIX);
  return event?.type === 'message' && event.message?.type === 'text' &&
    (event.message.text === NATIVE_TEST_TRIGGER || (typeof event.message.text === 'string' && event.message.text.startsWith('測試導覽：')));
}
module.exports = { NATIVE_TEST_PREFIX, NATIVE_TEST_TRIGGER, NATIVE_TEST_FLAGS, isNativeTestEnabled, isNativeTestEvent };
