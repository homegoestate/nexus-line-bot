/** Stateless test snapshots only. No case identifiers, receipts, staff authority,
 * persistence, uploads, notifications or IO. Legacy v0.3.0 catalog is unchanged.
 * Masks in postbacks are PUBLIC and untrusted; never use them as case records.
 */
import LoanCore from '../vendor/loan-line-prototype/core.js';
import config from './native-guide-config.js';
import theme from './brand-theme.js';
export const DOCUMENT_TRIGGER = '備件清單';
export const DOCUMENT_PREFIX = config.NATIVE_GUIDE_PREFIX + 'docs:';
export const LEGACY_DOCUMENT_PREFIX = config.NATIVE_TEST_PREFIX + 'docs:';
export const INCOMES = Object.freeze(['salary', 'cash', 'self', 'professional', 'retired', 'rental']);
export const INCOME_NAMES = Object.freeze(['薪資收入', '現金領薪', '自營收入', '專業接案', '退休收入', '租金收入']);
const IDS = Object.freeze(INCOMES.map(income => LoanCore.resolveItems({ incomes: [income] })[0]));
const CATALOG = new Map(LoanCore.catalog.map(item => [item.id, item]));
const NOTICE = '已交是客戶自報，需承辦核實；不代表已送件，不保存正式案件紀錄。';
const SNAPSHOT_NOTICE = '請接續最新回覆勾選；舊卡各自獨立，不合併進度。重新開啟會重設，最後請承辦確認。';
const REQUIREMENTS_NOTICE = '依自選收入建立本次清單，尚未核定銀行完整要求；月份、格式及組合由承貸銀行確認。';
const handoff = '文件與影像請走承辦指定安全管道；這裡不輸入證件號碼、帳號或金額。';
const bit = index => 1 << index;
const validMask = value => Number.isInteger(value) && value >= 0 && value <= 63;
export function validSnapshot(s) {
  return s && Object.getPrototypeOf(s) === Object.prototype && Object.keys(s).length === 3 &&
    ['incomes', 'reported', 'requested'].every(k => Object.hasOwn(s, k) && validMask(s[k])) &&
    (s.reported & ~s.incomes) === 0 && (s.requested & ~s.incomes) === 0;
}
export function initialSnapshot(income = null) {
  if (income !== null && !INCOMES.includes(income)) throw Error('Unknown income');
  return { incomes: income === null ? 0 : bit(INCOMES.indexOf(income)), reported: 0, requested: 0 };
}
export function encodeSnapshot(s, view = 'choose', op = null, index = null) {
  if (!validSnapshot(s) || !['choose', 'company', 'list', 'summary'].includes(view) ||
      (op !== null && (!['in', 'out', 'report', 'unreport', 'ask', 'withdraw'].includes(op) || !Number.isInteger(index) || index < 0 || index > 5))) throw Error('Invalid snapshot action');
  return DOCUMENT_PREFIX + [s.incomes, s.reported, s.requested].map(v => v.toString(36)).join('.') + ':' + view + (op === null ? '' : ':' + op + index);
}
export function parseSnapshot(data) {
  if (typeof data === 'string' && data.startsWith(LEGACY_DOCUMENT_PREFIX)) data = DOCUMENT_PREFIX + data.slice(LEGACY_DOCUMENT_PREFIX.length);
  if (typeof data !== 'string' || data.length > 80 || !data.startsWith(DOCUMENT_PREFIX)) return null;
  const m = /^([0-9a-z]{1,2})\.([0-9a-z]{1,2})\.([0-9a-z]{1,2}):(choose|company|list|summary)(?::(in|out|report|unreport|ask|withdraw)([0-5]))?$/.exec(data.slice(DOCUMENT_PREFIX.length));
  if (!m) return null;
  const values = m.slice(1, 4).map(x => parseInt(x, 36));
  if (values.some((value, i) => value.toString(36) !== m[i + 1])) return null;
  const s = { incomes: values[0], reported: values[1], requested: values[2] };
  if (!validSnapshot(s)) return null;
  const view = m[4], op = m[5], index = Number(m[6]);
  if (op) {
    const b = bit(index);
    if (op === 'in' || op === 'out') {
      if (view !== 'choose') return null;
      s.incomes = op === 'in' ? s.incomes | b : s.incomes & ~b;
      s.reported &= s.incomes; s.requested &= s.incomes;
    } else {
      if (view !== 'list' || !(s.incomes & b)) return null;
      if (op === 'report') s.reported |= b;
      if (op === 'unreport') s.reported &= ~b;
      if (op === 'ask') s.requested |= b;
      if (op === 'withdraw') s.requested &= ~b;
    }
  }
  return { snapshot: s, view };
}
function model(s) {
  if (!validSnapshot(s)) throw Error('Invalid snapshot');
  const selected = INCOMES.filter((_, i) => s.incomes & bit(i));
  if (!selected.length) return null;
  const state = LoanCore.createState('offline_snapshot', 'offline_reader', LoanCore.resolveItems({ incomes: selected }));
  state.items.forEach(item => {
    const i = IDS.indexOf(item.id);
    item.reported = Boolean(s.reported & bit(i));
    item.notApplicableRequested = Boolean(s.requested & bit(i));
  });
  return state;
}
export function summarizeSnapshot(s) {
  const state = model(s);
  const progress = state ? LoanCore.progress(state) : { total: 0, reported: 0, verified: 0, pending: 0 };
  return {
    scope: 'self-selected-demo', ...progress,
    reportedItems: state ? state.items.filter(i => i.reported).map(i => CATALOG.get(i.id).title) : [],
    pendingItems: state ? state.items.filter(i => !i.reported).map(i => CATALOG.get(i.id).title) : [],
    pendingNotApplicable: state ? state.items.filter(i => i.notApplicableRequested).map(i => CATALOG.get(i.id).title) : [],
    companyItems: LoanCore.companyCatalog.map(i => i.title),
    bankRequirementsVerified: false, caseSubmitted: false, registrationConfirmed: false,
  };
}
const text = (value, props = {}) => ({ type: 'text', text: value, wrap: true, size: 'sm', color: theme.ink, ...props });
const action = (label, data) => ({ type: 'postback', label, data, displayText: '更新財力自報清單（未核實）' });
function card(title, paragraphs, actions = []) {
  return { type: 'bubble', styles:{body:{backgroundColor:theme.white},footer:{backgroundColor:theme.surface}}, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
    text('宏國地政|易丞地政 · 財力備件', { size: 'xs', color: theme.accent }),
    text(title, { weight: 'bold', size: 'lg', color: theme.primary }),
    ...paragraphs.map(p => text(p, /^(已交（|缺件／|公司承辦)/.test(p) ? {weight:'bold'} : {})), text(NOTICE, { size: 'xs', color: theme.muted }),
  ] }, ...(actions.length ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: actions.map((a,i) => ({ type: 'button', height: 'sm', style:i===0?'primary':'secondary', ...(i===0?{color:theme.primary}:{}), action: a })) } } : {}) };
}
export function buildDocumentGuide(s = initialSnapshot(), view = 'choose') {
  const summary = summarizeSnapshot(s), cards = [];
  if (!['choose', 'company', 'list', 'summary'].includes(view)) throw Error('Invalid view');
  const a = (label, dest, op = null, index = null) => action(label, encodeSnapshot(s, dest, op, index));
  if (view === 'choose') {
    cards.push(card('選擇收入來源', [REQUIREMENTS_NOTICE, '可選多種實際收入；調整來源不是承辦核定不適用。公司文件另列，不重複計為客戶缺件。', SNAPSHOT_NOTICE], [a('查看勾選清單', 'list'), a('公司準備文件', 'company')]));
    INCOME_NAMES.forEach((name, i) => cards.push(card(name, [s.incomes & bit(i) ? '已選入本次清單' : '尚未選入'], [a(s.incomes & bit(i) ? '移出此收入' : '加入此收入', 'choose', s.incomes & bit(i) ? 'out' : 'in', i)])));
  }
  if (view === 'company') cards.push(card('公司準備｜送件待承辦確認', [
    ...summary.companyItems.map(title => '公司承辦提供：' + title),
    '責任歸屬不表示已送銀行；客戶不能標記公司已送件，這些項目不列入客戶已交／缺件數。',
    '客戶主要配合財力與銀行正式申請／聯徵同意。移轉核身、用印與賣方備件依原導覽及正式通知辦理。',
  ], [a('返回收入選擇', 'choose'), a('看客戶備件', 'list')]));
  if (view === 'list') {
    const state = model(s);
    cards.push(card('客戶財力｜自報勾選', [REQUIREMENTS_NOTICE, handoff, SNAPSHOT_NOTICE], [a('看已交／缺件摘要', 'summary'), a('調整收入來源', 'choose')]));
    if (!state) cards.push(card('尚未選收入來源', ['請先選擇收入，不以空清單表示文件已齊。'], [a('選擇收入來源', 'choose')]));
    else state.items.forEach(item => {
      const d = CATALOG.get(item.id), i = IDS.indexOf(item.id);
      cards.push(card(d.title, [d.note, item.reported ? '已交（客戶自報）｜承辦尚未核實' : '缺件／待補（本次清單）｜承辦尚未核實',
        ...(item.notApplicableRequested ? ['已申請不適用，仍列在本清單；未交項目仍計待補，須另請承辦核定。'] : []),
      ], [a(item.reported ? '改為待補' : '我已交（自報）', 'list', item.reported ? 'unreport' : 'report', i), a(item.notApplicableRequested ? '撤回不適用申請' : '申請不適用', 'list', item.notApplicableRequested ? 'withdraw' : 'ask', i), a('看完整摘要', 'summary')]));
    });
  }
  if (view === 'summary') cards.push(card('已交／缺件｜自報摘要', [
    summary.total ? `本次清單：${summary.total} 項收入佐證組合；已交自報 ${summary.reported} 項／缺件待補 ${summary.pending} 項。` : '尚未選收入來源，不代表文件已齊。',
    '已交（客戶自報）：' + (summary.reportedItems.join('、') || '尚無'),
    '缺件／待補（本次清單）：' + (summary.pendingItems.join('、') || (summary.total ? '暫無；仍需銀行確認完整清單' : '未建立清單')),
    '不適用申請待核定：' + (summary.pendingNotApplicable.join('、') || '尚無'),
    '承辦尚未核實，這裡沒有任何已核實收件。公司送件：待承辦確認。',
    REQUIREMENTS_NOTICE, SNAPSHOT_NOTICE, '需要人工確認，請點「請承辦協助」開啟既有專人諮詢；點選不代表已核實、已收件或已指派承辦。',
  ], [a('返回勾選', 'list'), a('看公司提供文件', 'company'), {type:'message',label:'請承辦協助',text:'預約諮詢'}]));
  return { route: 'native:documents:' + view, state: { flow: 'native-document-snapshot', step: view, snapshot: { ...s }, receiptTrusted: false }, messages: [{
    type: 'flex', altText: '宏國地政|易丞地政：財力備件清單，自報尚未核實。',
    contents: cards.length === 1 ? cards[0] : { type: 'carousel', contents: cards },
    quickReply: { items: [a('備件摘要', 'summary'), a('收入選擇', 'choose'), action('返回服務總覽', config.NATIVE_GUIDE_PREFIX + 'home')].map(action => ({ type: 'action', action })) },
  }] };
}
export function invalidDocumentGuide() {
  return { route: 'native:documents:invalid', state: { flow: 'native-document-snapshot', step: 'invalid', receiptTrusted: false }, messages: [{ type: 'flex', altText: '備件選項已失效，請重新開啟清單。', contents: card('備件選項已失效', ['不能從這張卡確認收件或案件狀態。請重新選擇收入來源。'], [action('重新開啟備件清單', encodeSnapshot(initialSnapshot()))]) }] };
}
export function routeDocumentGuide(event) {
  if (event?.type === 'message' && event.message?.type === 'text' && [DOCUMENT_TRIGGER,'測試導覽：備件勾選'].includes(event.message.text)) return buildDocumentGuide();
  const data = event?.type === 'postback' ? event.postback?.data : null;
  if (typeof data !== 'string' || (!data.startsWith(DOCUMENT_PREFIX) && !data.startsWith(LEGACY_DOCUMENT_PREFIX))) return null;
  const parsed = parseSnapshot(data);
  return parsed ? buildDocumentGuide(parsed.snapshot, parsed.view) : invalidDocumentGuide();
}
