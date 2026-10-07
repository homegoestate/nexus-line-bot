/** Pure native LINE guide. Caller authenticates signature, account and destination.
 * Stateless navigation: no IO, user tracking, registration, receipt, storage or send.
 * All new actions remain in chat. Historical hgpilot routes are separate.
 */
import config from './native-guide-config.js';
export const PREFIX = config.NATIVE_TEST_PREFIX;
const BRAND = '宏國地政|易丞地政';
const ACCOUNTS = new Set(['@604gpqef', '@528scwxf', '@375umdzq']);
const NOTICE = '測試導覽，尚未連線收件或個案後台。閱讀不代表已辦理；實際依承辦與銀行通知。';
export const PROCESS_SOURCE_STATUS = 'owner-confirmed-eight-steps-20261007';
export const PROCESS_SOURCE = Object.freeze({ libraryFileId: 'libfile_a8ce364601148191b533464f098b1ad7', version: 1, confirmedOn: '2026-10-07' });
// Owner-confirmed original eight names, supplemented by buyer/seller tasks.
// Only approved workflow content is consumed; source's older external media and
// OA-manager keyword scheme are superseded by this native-chat-only namespace.
const STEPS = Object.freeze([
  { title: '簽約', overview: '先看契約、付款與交屋約定，確認貸款不足時怎麼處理。',
    buyer: '核對房屋、價金、付款日期、交屋條件，以及貸款不足時的處理方式。',
    seller: '說明屋況、租約及原有抵押權，確認收款、稅費與交屋約定。',
    time: '依雙方約定；各期款以契約為準。',
    notice: '需要房貸可先評估，簽約後與文件、稅務作業並行。',
    faq: ['簽約就一定核貸？', '不是。核貸及撥款條件仍由銀行審核。'] },
  { title: '用印', overview: '依承辦清單備妥文件，確認內容和授權後再用印。',
    buyer: '依通知準備移轉核身、印章、簽章與授權，核對申請書及契約內容。',
    seller: '依通知準備身分證明與權狀，確認印章、核身方式及是否需要印鑑證明。',
    time: '依文件齊備及雙方約定時間。',
    notice: '銀行所需身分、房地與契約資料由公司提供；移轉核身獨立。印章依通知自備，不預設代刻授權或一律附印鑑證明。貸款審核可同步。',
    faq: ['銀行資料還要再交一份？', '銀行所需身分、房地及契約資料由公司提供；客戶主要配合財力，移轉核身另依正式通知配合。'] },
  { title: '核發稅單', overview: '確認申報資料，由稅務機關核定；銀行作業可同步。',
    buyer: '配合土地移轉現值申報，核對房屋契稅資料。',
    seller: '配合土地移轉現值申報，提供適用優惠或減免所需資料。',
    time: '依稅務機關審核與補件情況。',
    notice: '申報期限與核發稅單所需工作天分開確認。貸款審核、對保可與稅務作業並行。',
    faq: ['按下一步表示已申報或核稅？', '不是。核稅以稅務機關結果為準；本導覽未接個案或申報後台。'] },
  { title: '完稅', overview: '依稅單繳費，並確認核貸、對保與自備款安排。',
    buyer: '核對契稅等應付費用，依稅單期限繳納；有房貸者確認核貸條件、對保與自備款差額。',
    seller: '核對土地增值稅等應付稅費，依期限繳清，確認原貸款清償資料。',
    time: '以稅單、契約及銀行安排為準。',
    notice: '貸款核准不等於已撥款；是否具備過戶條件由承辦確認。',
    faq: ['閱讀完成就是已繳稅？', '不是。以正式通知、繳款與承辦核對結果為準。'] },
  { title: '過戶', overview: '辦理過戶與登記，配合必要簽章、授權與補正。',
    buyer: '核對登記名義、持分及成交資訊，配合簽章、授權與貸款設定文件。',
    seller: '共同確認申報資料，配合送件與必要補正。',
    time: '公司確認：預估 3–5 個工作天，依文件齊備與機關作業，並配合銀行設定安排；實際由承辦確認，非保證期限。',
    notice: '登記、設定、實價登錄及適用的移轉後申報事項由承辦確認；法定申報期限不是保證辦結工作天。',
    faq: ['核貸表示過戶完成？', '不是。登記與設定須核對正式辦理結果。'] },
  { title: '代償', overview: '安排舊貸清償與塗銷，核對銀行撥款及價款安排。',
    buyer: '依約補足價款，確認銀行撥款與代償安排。',
    seller: '向原貸銀行確認清償金額、清償文件與抵押權塗銷方式。',
    time: '公司確認：預估 3–5 個工作天，依文件齊備、銀行作業及相關機關安排；實際由承辦確認，非保證期限。',
    notice: '清償與塗銷時點可能與前面程序交錯，不是一律過戶後才做。',
    faq: ['沒有舊貸也要代償？', '無舊貸可依個案略過代償；清償、塗銷及款項順序依個案確認。'] },
  { title: '點交', overview: '核對屋況、鑰匙、設備、費用分算及交付內容。',
    buyer: '核對屋況、設備、鑰匙與交付文件，確認費用分算。',
    seller: '依約騰空並交付鑰匙、文件，核對價款及費用結算。',
    time: '依契約及雙方約定。',
    notice: '差異的處理方式與期限留存清楚；價金撥付依契約條件辦理。',
    faq: ['按下一步會確認點交或額外通知承辦？', '不會確認點交。本導覽只回傳說明，沒有額外案件通知；聊天互動仍會進入原有 OA／客服系統。'] },
  { title: '結案', overview: '確認收付款、保存交易文件，留意適用的移轉後申報事項。',
    buyer: '確認權狀與貸款資料，保存契約、付款及稅費憑證。',
    seller: '核對實際收款與費用明細，保存取得成本、出售費用及交易憑證。',
    time: '依收付款、文件及個案事項確認。',
    notice: '適用稅務申報事項由承辦確認，不以交屋或收齊尾款代替法定起算日。',
    faq: ['看完八段表示結案？', '不是。是否完成以正式辦理、交付及承辦核對為準。'] },
].map(Object.freeze));
export const PROCESS_STEP_TITLES = Object.freeze(STEPS.map(step => step.title));
const FINANCE = Object.freeze({
  salary: ['受薪收入', '薪轉紀錄、薪資單、扣繳或所得清單、在職或勞保等，依銀行對該客群指定的組合準備，不是任意擇一。'],
  business: ['自營收入', '營業與報稅資料依稅制及銀行要求；401／403／405 按實際稅制適用，不要求一律全交。'],
  pension: ['退休收入', '退休金或年金資料與入帳佐證，可否作為替代財力由銀行確認。'],
  rental: ['租金收入', '租約及租金入帳佐證，採認方式及期間依銀行通知。'],
});
const PAGES = Object.freeze({
  buyer: ['買方備件', '#168D96', [
    '銀行所需身分、房地及買賣契約資料由公司提供；客戶主要配合財力資料與銀行正式申請／聯徵同意。',
    '移轉核身、第二證件、戶籍資料及用印依個案另行通知；不預設完整記事戶籍或初次全量財產資料。',
  ], ['公司提供就不用本人核身？', '銀行備件與移轉核身是不同事項，依正式通知配合。']],
  seller: ['賣方備件', '#168D96', [
    '賣方移轉資料獨立整理：權利、核身、申請與授權事項依承辦通知確認。',
    '印章、印鑑證明及戶籍需求逐案確認；有舊貸時另外確認清償及塗銷，勿混入買方房貸清單。',
  ], ['印鑑證明每人都必須交？', '不預設一律必要，依案件、機關與承辦通知確認。']],
});
export const ROUTES = Object.freeze(['home', 'process', ...STEPS.map((_, i) => `step:${i + 1}`), 'buyer', 'seller', 'finance', ...Object.keys(FINANCE).map(key => `finance:${key}`)]);
const texts = Object.fromEntries(ROUTES.map(route => [`測試導覽：${route === 'home' ? '總覽' : route === 'process' ? '買賣流程' : route.startsWith('step:') ? `流程第${route.slice(5)}步` : route === 'buyer' ? '買方備件' : route === 'seller' ? '賣方備件' : route === 'finance' ? '貸款財力' : FINANCE[route.slice(8)][0]}`, route]));
texts[config.NATIVE_TEST_TRIGGER] = 'home';
export const TEXT_ACTIONS = Object.freeze(texts);
function action(label, route) { return { type: 'postback', label, data: PREFIX + route, displayText: `查看${label}` }; }
function bubble(title, paragraphs, actions, color = '#6854A0', faq = null) {
  const contents = [
    { type: 'text', text: '宏國地政|易丞地政 · 測試導覽', size: 'xs', color, wrap: true },
    { type: 'text', text: title, size: 'xl', weight: 'bold', color: '#172E4A', wrap: true },
    ...paragraphs.map(text => ({ type: 'text', text, size: 'sm', color: '#334155', wrap: true, margin: 'md' })),
  ];
  if (faq) contents.push({ type: 'separator', margin: 'lg' }, { type: 'text', text: '常見問題｜' + faq[0], size: 'sm', weight: 'bold', wrap: true, margin: 'md' }, { type: 'text', text: faq[1], size: 'sm', wrap: true, margin: 'sm' });
  contents.push({ type: 'text', text: NOTICE, size: 'xs', color: '#64748B', wrap: true, margin: 'lg' });
  return { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: actions.map((a, i) => ({ type: 'button', height: 'sm', style: i === 0 ? 'primary' : 'secondary', ...(i === 0 ? { color } : {}), action: a })) } };
}
function response(route, cards, previous = null) {
  const nav = [];
  if (previous) nav.push(action('返回上一層', previous));
  if (route !== 'home') nav.push(action('返回測試總覽', 'home'));
  return { route: 'native:' + route, state: { flow: 'native-test', step: route }, messages: [{ type: 'flex', altText: `${BRAND}：測試服務導覽，請在聊天室選擇。`, contents: cards.length === 1 ? cards[0] : { type: 'carousel', contents: cards }, ...(nav.length ? { quickReply: { items: nav.map(a => ({ type: 'action', action: a })) } } : {}) }] };
}
export function buildNativeGuide(route) {
  if (!ROUTES.includes(route)) return response('invalid', [bubble('選項已失效', ['請返回測試總覽重新選擇。'], [action('返回測試總覽', 'home')])]);
  if (route === 'home') return response(route, [bubble('買賣流程與備件', ['在聊天室逐段閱讀；舊卡仍可點選，會回傳新版導覽，不會原地修改。', '沿用已核對的第一建經八步名稱，分列買、賣雙方待辦；實際作業可並行，由承辦確認。'], [action('買賣流程', 'process'), action('買方備件', 'buyer'), action('賣方備件', 'seller')]), bubble('貸款財力', ['依您的收入類型查看適用資料；不蒐集證件、帳號、金額或文件影像。'], [action('貸款財力', 'finance')], '#C76F35')]);
  if (route === 'process') return response(route, STEPS.map((step, i) => bubble(`${String(i + 1).padStart(2, '0')} ${step.title}`, [step.overview, `時間｜${step.time}`], [action('查看這一段', `step:${i + 1}`)])), 'home');
  if (route.startsWith('step:')) {
    const n = Number(route.slice(5)), step = STEPS[n - 1];
    const actions = [];
    if (n < 8) actions.push(action(`下一步：${STEPS[n].title}`, `step:${n + 1}`));
    else actions.push(action('重新看簽約', 'step:1'));
    actions.push(action('看流程總覽', 'process'));
    const content = [`流程導覽 ${n} / 8`, `買方｜${step.buyer}`, `賣方｜${step.seller}`, `時間｜${step.time}`, `提醒｜${step.notice}`, '這是閱讀順序，實際辦理及並行安排由承辦確認。'];
    return response(route, [bubble(`${String(n).padStart(2, '0')} ${step.title}`, content, actions, '#6854A0', step.faq)], n === 1 ? 'process' : `step:${n - 1}`);
  }
  if (Object.hasOwn(PAGES, route)) {
    const [title, color, body, faq] = PAGES[route];
    return response(route, [bubble(title, body, [action(route === 'buyer' ? '查看貸款財力' : '看流程總覽', route === 'buyer' ? 'finance' : 'process')], color, faq)], 'home');
  }
  if (route === 'finance') return response(route, [bubble('貸款財力｜先選適用類型', ['只查看適用清單。不同收入可分別參考，採認組合與近幾個月期間皆由銀行確認。', '自報不等於承辦收件確認，實際依承辦銀行要求。'], Object.entries(FINANCE).slice(0, 3).map(([key, [title]]) => action(title, `finance:${key}`)), '#C76F35'), bubble('租金及其他收入', ['其他收入請向承辦確認適用資料；未核實處待銀行確認。'], [action('租金收入', 'finance:rental')], '#C76F35')], 'home');
  const [title, detail] = FINANCE[route.slice(8)];
  return response(route, [bubble(title + '｜資料指引', [detail, '期間、文件格式與組合待承辦銀行確認。保證人非一律必要，不默認配偶為保證人。', '自報不等於承辦收件確認，實際依承辦銀行要求。'], [action('更換收入類型', 'finance')], '#C76F35', ['在這裡可以交證件或標記已收件？', '本輪只提供閱讀導覽，未做上傳、自報或承辦收件；文件走銀行與承辦正式管道。'])], 'finance');
}
export function routeNativeGuide(event, account) {
  if (!ACCOUNTS.has(account) || !event || typeof event !== 'object' || Array.isArray(event) || event.mode !== 'active' || event.source?.type !== 'user') return null;
  if (event.type === 'message' && event.message?.type === 'text') {
    const text = event.message.text;
    return typeof text === 'string' && text.length <= 32 && Object.hasOwn(TEXT_ACTIONS, text) ? buildNativeGuide(TEXT_ACTIONS[text]) : null;
  }
  const data = event.type === 'postback' ? event.postback?.data : null;
  if (typeof data !== 'string' || !data.startsWith(PREFIX)) return null;
  return buildNativeGuide(data.length <= 80 ? data.slice(PREFIX.length) : 'invalid');
}
