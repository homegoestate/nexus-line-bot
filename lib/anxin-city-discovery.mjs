import theme from './brand-theme.js';

// Presentation only: this URI does not send a message or change keyword routing.
export const ANXIN_DISCOVERY_URI = 'https://homegoestate.github.io/anxin-city/';
export const ANXIN_DISCOVERY_LABEL = '房產選擇先試試';
export const ANXIN_DISCOVERY_COPY = '首購、換屋、賣屋、傳承，先做選擇，再看差別';

export function buildAnxinDiscoveryPanel(account, sharedContext = false) {
  if (account !== '@604gpqef' || sharedContext) return [];
  return [{
    type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
    paddingAll: '12px', backgroundColor: theme.surface, cornerRadius: '8px',
    contents: [
      { type: 'text', text: '安心城｜從你的選擇開始', size: 'sm', weight: 'bold', color: theme.primary, wrap: true },
      { type: 'text', text: ANXIN_DISCOVERY_COPY, size: 'sm', color: theme.ink, wrap: true },
      { type: 'button', style: 'primary', color: theme.accent, height: 'sm',
        action: { type: 'uri', label: ANXIN_DISCOVERY_LABEL, uri: ANXIN_DISCOVERY_URI } },
    ],
  }];
}
