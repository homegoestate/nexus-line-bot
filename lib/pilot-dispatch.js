// Additive pilot: no database writes and no interception of legacy keywords.
const PILOT_DESTINATION = 'U8b81ef7675293ace19bffe31ca3c701f';
const PILOT_VERSION = 'hgservice-20260930-v3';
let router;
const TRIGGERS = new Set(['宏國服務體驗', '宏國買房導覽', '宏國房貸導覽', '宏國新屋主導覽', '宏國賣房導覽', '宏國傳承導覽', '宏國土地建商導覽']);

async function getPilotReply(event, destination) {
  if (process.env.HG_SERVICE_PILOT_ENABLED === 'false') return null;
  if (destination !== PILOT_DESTINATION || !event ||
      event.mode !== 'active' || event.source?.type !== 'user' ||
      typeof event.replyToken !== 'string' || !event.replyToken || event.replyToken.length > 256) return null;
  const matches = (event.type === 'message' && event.message?.type === 'text' && TRIGGERS.has(event.message.text)) ||
    (event.type === 'postback' && typeof event.postback?.data === 'string' && event.postback.data.startsWith('hgpilot:v1:'));
  if (!matches) return null;
  try {
    router ||= import('./flow-router.mjs');
    return (await router).routeEvent(event);
  } catch {
    router = null;
    console.error('Service pilot unavailable');
    return { messages: [{ type: 'text', text: '服務導覽暫時無法使用，您可以直接在這裡留言說明需求，待人工確認。' }], route: 'unavailable' };
  }
}

module.exports = { getPilotReply, PILOT_DESTINATION, PILOT_VERSION };
