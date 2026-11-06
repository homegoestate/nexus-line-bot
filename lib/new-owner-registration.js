// Acknowledge the 【新屋主登錄】 summary that the 建案服務中心 web form asks the buyer to send.
// Only @375umdzq private chats, only messages that start with the marker; everything else stays silent.
const NEW_OWNER_MARKER = '【新屋主登錄】';
const NEW_OWNER_ACCOUNTS = Object.freeze(['375umdzq']);
const NEW_OWNER_REPLY_TEXT = [
  '感謝您完成新屋主登錄，資料已收到！',
  '承辦人員確認後續行程後，會再與您聯繫，請稍候。',
  '',
  '等待期間，建議您先：',
  '1️⃣ 輸入「官方」→ 點「交易流程」：了解簽約、用印、完稅、過戶到交屋的完整程序',
  '2️⃣ 輸入「官方」→ 點「貸款收入證明」：依您的收入類型準備貸款資料，備妥後可直接傳到這個聊天室',
  '',
  '資料齊全能讓後續進度更順利，謝謝您的配合！',
].join('\n');

function isNewOwnerRegistrationEvent(event, account) {
  return NEW_OWNER_ACCOUNTS.includes(account) && !!event && event.mode === 'active' &&
    event.type === 'message' && event.source?.type === 'user' &&
    event.message?.type === 'text' && typeof event.message.text === 'string' &&
    event.message.text.trimStart().startsWith(NEW_OWNER_MARKER);
}

function routeNewOwnerRegistration(event, account) {
  if (!isNewOwnerRegistrationEvent(event, account)) return null;
  return {
    route: 'new-owner-registration:ack',
    state: { flow: 'new-owner-registration', step: 'ack' },
    messages: [{ type: 'text', text: NEW_OWNER_REPLY_TEXT }],
  };
}

module.exports = { NEW_OWNER_MARKER, NEW_OWNER_ACCOUNTS, NEW_OWNER_REPLY_TEXT, isNewOwnerRegistrationEvent, routeNewOwnerRegistration };
