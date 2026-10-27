// Pure candidate entrance. The caller authenticates the webhook and destination.
// Exact private entrance for the three approved OAs; brand group has one public CTA.
const ANXIN_CITY_TRIGGER = '安心城';
const ANXIN_CITY_ACCOUNTS = Object.freeze(['604gpqef', '375umdzq', '528scwxf']);
const ANXIN_CITY_LINKS = Object.freeze([
  Object.freeze({ label: '首購第一間家', uri: 'https://homegoestate.github.io/anxin-city/?start=first-home' }),
  Object.freeze({ label: '換屋下一站', uri: 'https://homegoestate.github.io/anxin-city/?start=move-home' }),
  Object.freeze({ label: '賣屋下一步', uri: 'https://homegoestate.github.io/anxin-city/?start=seller' }),
  Object.freeze({ label: '傳承為家人', uri: 'https://homegoestate.github.io/anxin-city/?start=legacy-family' }),
  Object.freeze({ label: '台南37區', uri: 'https://homegoestate.github.io/anxin-city/?start=tainan' }),
  Object.freeze({ label: '宏國地政官網', uri: 'https://homegoestate.github.io/' }),
]);

function buildAnxinCityReply() {
  return {
    route: 'anxin-city:home',
    state: { flow: 'anxin-city', step: 'home' },
    messages: [{
      type: 'flex',
      altText: '安心城｜選擇首購、換屋、賣屋、傳承或台南探索，也可回宏國地政官網。',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
          contents: [
            { type: 'text', text: '宏國地政｜易丞地政', size: 'xs', color: '#D8BF88', weight: 'bold', wrap: true },
            { type: 'text', text: '歡迎來到安心城', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
          contents: [
            { type: 'text', text: '買房、換屋、賣屋或傳承，選個故事先試試。', size: 'sm', color: '#314052', wrap: true },
            { type: 'text', text: '故事中的金額為情境示例。', size: 'xs', color: '#586471', wrap: true },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
          contents: [0, 2, 4].map(start => ({
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: ANXIN_CITY_LINKS.slice(start, start + 2).map(link => ({
              type: 'button', flex: 1, height: 'sm', style: start < 4 ? 'primary' : 'secondary',
              ...(start < 4 ? { color: '#172E4A' } : {}),
              action: { type: 'uri', label: link.label, uri: link.uri },
            })),
          })),
        },
        styles: {
          header: { backgroundColor: '#172E4A' },
          body: { backgroundColor: '#FFFFFF' },
          footer: { backgroundColor: '#F8F5EE' },
        },
      },
    }],
  };
}

function isAnxinCityGroupEvent(event, account) {
  return account === '604gpqef' && event?.mode === 'active' &&
    event.source?.type === 'group' && event.type === 'message' &&
    event.message?.type === 'text' && event.message.text === ANXIN_CITY_TRIGGER;
}

function buildAnxinCityGroupReply() {
  return {
    route: 'anxin-city:group-home', state: { flow: 'anxin-city', step: 'group-home' },
    messages: [{
      type: 'flex', altText: '安心城｜買房、換屋、賣屋與傳承，先做選擇，再看差別。',
      contents: {
        type: 'bubble', size: 'kilo',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md',
          contents: [
            { type: 'text', text: '安心城｜房產選擇先試試', size: 'lg', weight: 'bold', color: '#172E4A', wrap: true },
            { type: 'text', text: '買房、換屋、賣屋與傳承，先做選擇，再看差別。', size: 'sm', color: '#314052', wrap: true },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          contents: [{ type: 'button', height: 'sm', style: 'primary', color: '#172E4A',
            action: { type: 'uri', label: '開始體驗安心城', uri: 'https://homegoestate.github.io/anxin-city/' } }],
        },
        styles: { body: { backgroundColor: '#FFFFFF' }, footer: { backgroundColor: '#F8F5EE' } },
      },
    }],
  };
}

function routeAnxinCityEntry(event, account) {
  if (!ANXIN_CITY_ACCOUNTS.includes(account) || !event || event.mode !== 'active' ||
      event.type !== 'message' ||
      event.message?.type !== 'text' || event.message.text !== ANXIN_CITY_TRIGGER) return null;
  if (event.source?.type === 'user') return buildAnxinCityReply();
  return isAnxinCityGroupEvent(event, account) ? buildAnxinCityGroupReply() : null;
}

module.exports = { ANXIN_CITY_TRIGGER, ANXIN_CITY_ACCOUNTS, ANXIN_CITY_LINKS, buildAnxinCityReply, buildAnxinCityGroupReply, isAnxinCityGroupEvent, routeAnxinCityEntry };
