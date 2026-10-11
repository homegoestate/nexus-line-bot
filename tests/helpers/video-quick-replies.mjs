import { isVideoQuickReplyAction } from '../../lib/video-playlists.mjs';

// Old assertions still cover the complete original payload. Only exact newly
// authorized quick replies are removed; unexpected URLs/actions remain visible.
export function stripVideoQuickReplies(value) {
  const copy = structuredClone(value);
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.quickReply) {
      node.quickReply.items = node.quickReply.items.filter(item => !isVideoQuickReplyAction(item.action));
      if (!node.quickReply.items.length) delete node.quickReply;
    }
    Object.values(node).forEach(visit);
  }
  visit(copy);
  return copy;
}

export const originalPayload = fn => (...args) => {
  const result = fn(...args);
  return result?.then ? result.then(stripVideoQuickReplies) : stripVideoQuickReplies(result);
};
