const STATELESS_TOKEN_URL = 'https://api.line.me/oauth2/v3/token';
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const REQUEST_TIMEOUT_MS = 10000;
const TOKEN_REFRESH_SKEW_MS = 60000;

function safeError(code, status) {
  const error = new Error(code);
  error.name = 'LineServiceError';
  error.code = code;
  if (Number.isInteger(status) && status >= 100 && status <= 599) error.status = status;
  return error;
}

function createStatelessLineClient({ channelId, channelSecret,
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof channelId !== 'string' || !/^\d+$/.test(channelId) ||
      typeof channelSecret !== 'string' || !channelSecret.trim() ||
      typeof fetchImpl !== 'function' || typeof now !== 'function' ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw safeError('LINE_CLIENT_CONFIG_INVALID');

  // One closure per account. Credentials and ephemeral tokens never leave it.
  let cachedToken = null;
  let pendingToken = null;

  async function request(url, options, stage, consume) {
    const controller = new AbortController();
    let timeout;
    const timedOut = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(safeError(`LINE_${stage}_TIMEOUT`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { ...options, signal: controller.signal });
          if (!response || response.ok !== true) throw safeError(`LINE_${stage}_HTTP_ERROR`, response?.status);
          return await consume(response);
        })(),
        timedOut,
      ]);
    } catch (error) {
      // Do not retain provider error bodies, request headers or network exceptions.
      if (error?.name === 'LineServiceError' && /^LINE_(TOKEN|REPLY)_(TIMEOUT|HTTP_ERROR|RESPONSE_INVALID)$/.test(error.code)) {
        throw safeError(error.code, error.status);
      }
      throw safeError(`LINE_${stage}_REQUEST_FAILED`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getAccessToken() {
    if (cachedToken && now() < cachedToken.expiresAt) return cachedToken.value;
    if (!pendingToken) {
      pendingToken = request(STATELESS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: channelId, client_secret: channelSecret }).toString(),
      }, 'TOKEN', async response => {
        const payload = await response.json();
        if (typeof payload?.access_token !== 'string' || !payload.access_token.trim() ||
            typeof payload.expires_in !== 'number' || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
          throw safeError('LINE_TOKEN_RESPONSE_INVALID');
        }
        const expiresAt = now() + Math.max(0, payload.expires_in * 1000 - TOKEN_REFRESH_SKEW_MS);
        if (!Number.isFinite(expiresAt)) throw safeError('LINE_TOKEN_RESPONSE_INVALID');
        return { value: payload.access_token, expiresAt };
      }).then(token => {
        // A response that arrives after the timeout must not populate the cache.
        cachedToken = token;
        return token.value;
      }).finally(() => { pendingToken = null; });
    }
    return pendingToken;
  }

  async function replyMessage(replyToken, messages) {
    if (typeof replyToken !== 'string' || !replyToken || !Array.isArray(messages) || !messages.length) {
      throw safeError('LINE_REPLY_INPUT_INVALID');
    }
    const accessToken = await getAccessToken();
    // Exactly one attempt: a retry after an ambiguous timeout could duplicate a reply.
    return request(REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ replyToken, messages }),
    }, 'REPLY', response => ({ status: response.status }));
  }

  return Object.freeze({ replyMessage });
}

module.exports = { createStatelessLineClient, STATELESS_TOKEN_URL, REPLY_URL,
  REQUEST_TIMEOUT_MS, TOKEN_REFRESH_SKEW_MS };
