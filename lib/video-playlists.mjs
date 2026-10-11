// Public playlists supplied and verified by the owner's YouTube worker.
// Native OA rules own the three short aliases; this module adds no text router.
export const VIDEO_NATIVE_ALIASES = Object.freeze(['主題影片', '影片清單', '影音導覽']);
export const VIDEO_HUB_ACTION = Object.freeze({ type: 'message', label: '主題影片', text: '主題影片' });
export const VIDEO_PLAYLISTS = Object.freeze({
  loan: Object.freeze({ label: '房貸主題影片', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az84n9XshPwadjGTzPxFEovlJ' }),
  safety: Object.freeze({ label: '交易安全影片', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az84D2zp0INmi9ymLvFQ6v08V' }),
  sellerTax: Object.freeze({ label: '賣房稅務影片', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az84SCV4e0nOTkoJeL2kGJLTm' }),
  holdingTax: Object.freeze({ label: '持有稅影片', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az86RvmdRtm_ZvINpJulPcw-B' }),
  inheritance: Object.freeze({ label: '繼承贈與影片', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az84ohd1y17s3iF1eUjTXcB8J' }),
  policy: Object.freeze({ label: '市場政策影片', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az861hBh7MnHvJlu_IuvC39jc' }),
  buyer: Object.freeze({ label: '買房注意與AI試算', uri: 'https://www.youtube.com/playlist?list=PLUuw-6j7Az84GHZMSuoAWiY2HSEHU8xcX' }),
});

export function videoQuickReplyActions({ namespace, route, sharedContext = false, hubEnabled = true } = {}) {
  if (['native', 'pilot'].includes(namespace) && ['home', 'services'].includes(route))
    return hubEnabled && !sharedContext ? [{ ...VIDEO_HUB_ACTION }] : [];
  let keys = [];
  if (namespace === 'pilot') {
    keys = ({ buy: ['buyer', 'safety'], sell: ['sellerTax', 'safety'], loan: ['loan'], inherit: ['inheritance'], land: ['policy'], owner: ['holdingTax'] })[route] || [];
  } else if (namespace === 'native') {
    if (/^(buyer|process:buyer|buyer:(step|detail):[1-8])$/.test(route)) keys = ['buyer', 'safety'];
    else if (/^(seller|process:seller|seller:(step|detail):[1-8])$/.test(route)) keys = ['sellerTax', 'safety'];
    else if (/^finance(:salary|:business|:pension|:rental|:other|:conditions|:options)?$/.test(route)) keys = ['loan'];
    else if (/^(process|(step|detail):[1-8]|documents:contract|closing(:inspection|:warranty)?)$/.test(route)) keys = ['safety'];
  }
  return keys.map(key => ({ type: 'uri', ...VIDEO_PLAYLISTS[key] }));
}

const sameAction = (a, b) => a?.type === b.type && a.label === b.label && (b.type === 'uri' ? a.uri === b.uri : a.text === b.text);
export function isVideoQuickReplyAction(action) {
  return sameAction(action, VIDEO_HUB_ACTION) || Object.values(VIDEO_PLAYLISTS).some(playlist => sameAction(action, { type: 'uri', ...playlist }));
}

export function appendVideoQuickReplies(message, context) {
  const existing = message.quickReply?.items || [];
  const additions = videoQuickReplyActions(context)
    .filter(action => !existing.some(item => sameAction(item.action, action)))
    .slice(0, Math.max(0, 13 - existing.length));
  if (!additions.length) return message;
  return { ...message, quickReply: { ...message.quickReply, items: [...existing, ...additions.map(action => ({ type: 'action', action }))] } };
}
