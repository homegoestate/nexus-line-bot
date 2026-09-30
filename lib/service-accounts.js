// These are server-owned account identities, never values from a LINE event.
const DEFAULT_ACCOUNT = '604gpqef';
const SERVICE_ACCOUNTS = Object.freeze({
  '604gpqef': Object.freeze({
    key: '604gpqef', account: '@604gpqef', legacy: true,
    destination: 'U8b81ef7675293ace19bffe31ca3c701f', channelId: null,
    secretEnv: 'CHANNEL_SECRET', enabledEnv: null,
  }),
  '528scwxf': Object.freeze({
    key: '528scwxf', account: '@528scwxf', legacy: false,
    destination: 'U84b618fe443161f9044ddf51334f58f1', channelId: '2009777750',
    secretEnv: 'CHANNEL_SECRET_528SCWXF', enabledEnv: 'HG_SERVICE_PILOT_528SCWXF_ENABLED',
  }),
  '375umdzq': Object.freeze({
    key: '375umdzq', account: '@375umdzq', legacy: false,
    destination: 'U61e64edf2fdbe4903d535367212ebc6e', channelId: '2009791946',
    secretEnv: 'CHANNEL_SECRET_375UMDZQ', enabledEnv: 'HG_SERVICE_PILOT_375UMDZQ_ENABLED',
  }),
});

function getServiceAccount(id = DEFAULT_ACCOUNT) {
  if (typeof id !== 'string') return null;
  const key = id.startsWith('@') ? id.slice(1) : id;
  return Object.hasOwn(SERVICE_ACCOUNTS, key) ? SERVICE_ACCOUNTS[key] : null;
}

function invalidSelector() {
  const error = new Error('Invalid account selector');
  error.status = 400;
  error.code = 'INVALID_ACCOUNT_SELECTOR';
  return error;
}

function resolveRequestAccount(query = {}, rawUrl) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw invalidSelector();
  const prototype = Object.getPrototypeOf(query);
  if (prototype !== Object.prototype && prototype !== null) throw invalidSelector();
  const descriptor = Object.getOwnPropertyDescriptor(query, 'account');
  // Check both parsed and raw parameters, including qs object/array syntax.
  const isStructuredSelector = key => key.startsWith('account[') || key.startsWith('account.');
  if (Object.keys(query).some(isStructuredSelector)) throw invalidSelector();
  if (rawUrl !== undefined) {
    if (typeof rawUrl !== 'string') throw invalidSelector();
    let params;
    try { params = new URL(rawUrl, 'https://webhook.invalid').searchParams; }
    catch { throw invalidSelector(); }
    if (params.getAll('account').length > 1 || [...params.keys()].some(isStructuredSelector)) throw invalidSelector();
    // Never turn an invalid raw selector into the default through parser differences.
    if (params.has('account') && (!descriptor || !Object.hasOwn(descriptor, 'value') ||
        params.get('account') !== descriptor.value || !Object.hasOwn(SERVICE_ACCOUNTS, params.get('account')))) throw invalidSelector();
  }
  if (!descriptor) return SERVICE_ACCOUNTS[DEFAULT_ACCOUNT];
  if (!Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' ||
      !Object.hasOwn(SERVICE_ACCOUNTS, descriptor.value)) throw invalidSelector();
  return SERVICE_ACCOUNTS[descriptor.value];
}

function isAccountEnabled(id, env = process.env) {
  const account = getServiceAccount(id);
  return !!account && env.HG_SERVICE_PILOT_ENABLED !== 'false' &&
    (account.legacy || env[account.enabledEnv] === 'true');
}

function isAccountConfigReady(id, env = process.env) {
  const account = getServiceAccount(id);
  const present = value => typeof value === 'string' && value.trim().length > 0;
  return !!account && present(env[account.secretEnv]) &&
    (!account.legacy || present(env.CHANNEL_ACCESS_TOKEN));
}

module.exports = { DEFAULT_ACCOUNT, SERVICE_ACCOUNTS, getServiceAccount,
  resolveRequestAccount, isAccountEnabled, isAccountConfigReady };
