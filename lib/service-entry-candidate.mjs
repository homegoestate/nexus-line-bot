// Isolated candidate: flow-router wires A only; native B stays unchanged.
// Loan preview is a reference for the existing card's postbacks and aliases.
// No LINE client, network call, copied native material or guessed payload here.
import { buildNativeGuide, EXISTING_SERVICE_KEYWORDS } from './native-chat-guide.mjs';
import { buildTransactionProcessImageMessage } from './transaction-process-image.mjs';

export const CANDIDATE_ENTRY_TEXTS = Object.freeze({
  buy: '服務導覽：買賣過戶入口',
});
export const CANDIDATE_ENTRY_PREFIX = 'hgchat:v2:entry:';
const ENTRY_CARD_INDEX = Object.freeze({ buy: 0, loan: 1 });

function requireEntry(kind, account) {
  if (!Object.hasOwn(ENTRY_CARD_INDEX, kind)) throw new Error('Unknown candidate entry');
  if (!Object.hasOwn(EXISTING_SERVICE_KEYWORDS, account)) throw new Error('Unknown service account');
}

export function buildServiceEntryPreview(kind, { account } = {}) {
  requireEntry(kind, account);
  const homeMessage = buildNativeGuide('home', { account }).messages[0];
  return {
    candidateOnly: true,
    liveReady: false,
    route: 'candidate:entry:' + kind,
    // Reuse the actual home bubble, including its existing postbacks and theme.
    // Home-level quick replies are not part of this single entrance card.
    messages: [{
      type: homeMessage.type,
      altText: homeMessage.altText,
      contents: structuredClone(homeMessage.contents.contents[ENTRY_CARD_INDEX[kind]]),
    }],
  };
}

export function routeServiceEntryPreview(event, account) {
  if (!Object.hasOwn(EXISTING_SERVICE_KEYWORDS, account) || !event || event.mode !== 'active' ||
      !['user', 'group', 'room'].includes(event.source?.type)) return null;
  let kind;
  if (event.type === 'message' && event.message?.type === 'text') {
    kind = Object.keys(CANDIDATE_ENTRY_TEXTS).find(key => CANDIDATE_ENTRY_TEXTS[key] === event.message.text);
  } else if (event.type === 'postback' && typeof event.postback?.data === 'string') {
    kind = Object.keys(CANDIDATE_ENTRY_TEXTS).find(key => event.postback.data === CANDIDATE_ENTRY_PREFIX + key);
  }
  return kind ? buildServiceEntryPreview(kind, { account }) : null;
}

export function buildTransactionEntryCandidate({ account } = {}) {
  const entrance = buildServiceEntryPreview('buy', { account });
  const overview = buildNativeGuide('process', { account });
  // A currently calls this program-owned eight-stage route. Preserve its
  // entire message, carousel, navigation and original-media quick reply.
  return { ...entrance, messages: [...entrance.messages, buildTransactionProcessImageMessage(), ...structuredClone(overview.messages)] };
}

export function routeServiceEntryCandidate(event, account) {
  const entrance = routeServiceEntryPreview(event, account);
  if (!entrance) return null;
  return buildTransactionEntryCandidate({ account });
}
