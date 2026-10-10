/** Pure native LINE guide. Caller authenticates signature, account and destination.
 * Stateless navigation: no IO, user tracking, registration, receipt, storage or send.
 * Actions remain in chat; existing message actions keep native OA responses.
 * The established service trigger connects back to the historical hgpilot menu.
 */
import config from './native-guide-config.js';
import theme from './brand-theme.js';
import { DOCUMENT_TRIGGER, DOCUMENT_PREFIX, LEGACY_DOCUMENT_PREFIX, encodeSnapshot, initialSnapshot, routeDocumentGuide } from './native-document-guide.mjs';
export const PREFIX = config.NATIVE_GUIDE_PREFIX;
export const LEGACY_PREFIX = config.NATIVE_TEST_PREFIX;
const BRAND = '宏國地政|易丞地政';
const ACCOUNTS = new Set(['@604gpqef', '@528scwxf', '@375umdzq']);
const NOTICE = '流程說明不代表案件已送件或辦結；以本案契約、銀行及承辦通知為準。';
const TAX_CHECK = '稅單四欄先核對：①建案／戶別或買賣標的 ②納稅義務人 ③稅費名稱與金額 ④繳納期限及指定方式。資料不一致，先向承辦或相關單位確認，再依正式通知辦理。';
const BANK_SIGNING = '對保時核對核貸金額、利率、年限、寬限期、提前清償違約金，以及撥款條件與日期；與原約定不同，先向承辦確認再簽。公司送件與對保當日核身分開，依銀行正式通知配合。';
export const PROCESS_SOURCE_STATUS = 'owner-confirmed-eight-stages-amended-20261008';
export const PROCESS_SOURCE = Object.freeze({ libraryFileId: 'libfile_a8ce364601148191b533464f098b1ad7', version: 1, confirmedOn: '2026-10-07', amendment: 'owner-instructions-and-official-research-20261008' });
// Owner-confirmed original content with the October 8 stage-name amendments.
// Only approved workflow content is consumed; source's older external media and
// OA-manager keyword scheme are superseded by this native-chat-only namespace.
const STEPS = Object.freeze([
  { title:'簽約',overview:'把價格、各期付款與交屋條件說清楚。',
    buyer:'確認付款安排、約定用途及特殊要求；貸款不足由誰補款、補款期限與未補足時怎麼處理。',
    seller:'確認買賣金額、收款節點、搬遷時間與交付範圍。',time:'依契約各期款及交屋日期。',
    focus:'重點｜價格與各期付款、貸款不足責任與期限。',notice:'雙方同意配合事項，請寫清楚。',
    details:['契約確認總價、各期金額與付款時間、交屋日期、屋況設備、買方特殊要求及約定用途。','貸款不足時的補款責任、期限與未能補足的處理，依本案契約確認。','本案適用履保時，核對契約上的履保公司、正式專戶戶名與帳號、每期付款及撥款條件；不符先聯繫承辦。'],
    faq:['有履保就可以直接付款？','仍要依本案契約核對專戶、付款時間及撥款條件。'] },
  { title:'備證用印',overview:'公司備妥本案文件，再安排確認與用印。',
    buyer:'依承辦通知確認文件、核身及用印；買方已準備的銀行資料不重複交。',
    seller:'依承辦通知準備印鑑章、印鑑證明。',time:'依文件齊備與雙方約定。',
    focus:'核發日期｜公契立契日前一年以後。',notice:'用途為不動產登記或不限定用途；特殊核身方式另確認。',
    details:['請依承辦通知準備印鑑章與印鑑證明；公司會核對證明日期、用途及用印資料。','核發日期須為公契立契日前一年以後，由承辦協助核對。','用途可用不動產登記；需要不限定用途時，申請時向戶所說明登載於其他欄。','特殊身分或核身方式，請依承辦通知配合。','銀行所需身分、房地與買賣契約資料由公司提供；移轉核身及用印另依本案通知。'],
    faq:['公司提供銀行資料，就不用本人核身？','銀行備件與移轉核身不同，依本案正式通知配合。'] },
  { title:'申報稅費與貸款',overview:'公司申報稅費；有貸款者配合銀行審核。',
    buyer:'依銀行通知備收入證明、辦核貸與對保；核對貸款條件。',
    seller:'依承辦通知確認稅費資料及需配合事項。',time:'稅費與貸款可依本案並行。',
    focus:'重點｜對保確認金額、利率、年限與還款方式。',notice:'貸款不足依契約處理，核貸不等於已撥款。',
    details:['公司辦理土地增值稅與契稅申報；客戶依承辦通知配合，不把公司申報作業當成客戶待辦。',BANK_SIGNING,'銀行所需身分、房地與買賣契約資料由公司提供；客戶主要配合貸款收入證明及銀行正式申請／聯徵同意。'],
    faq:['收入資料備齊就會核准？','仍須銀行審核，額度與撥款條件以核定為準。'] },
  { title:'完稅',overview:'核對本案款項與正式付款通知。',
    buyer:'按通知支付本案預收款、服務費與貸款差額。',
    seller:'確認本案應負擔稅費與收款安排。',time:'依契約與稅單期限辦理。',
    focus:'依本公司一般流程，核貸／對保確認後通知備款。',notice:'銀行延遲應提前聯繫承辦，不自行逾稅單期限。',
    details:['本公司一般流程：銀行核貸及對保條件確認後，於繳稅前通知買方預收款、服務費與貸款差額，分項核對。','依契約期限與本案正式繳款通知付款，核對金額、戶名、帳號；有疑問先聯繫承辦。此處不提供通用匯款帳號。',TAX_CHECK,'銀行作業延遲不表示可以逾稅單期限；預期無法如期付款，請提前聯繫承辦安排。','繳清後依指定安全管道交付收據，由承辦核對文件與付款條件，確認後續送件；繳款或閱讀不等於已送地政。'],
    faq:['按下一步就是已完稅或送件？','不是；以實際繳款、承辦核對與正式受理資料為準。'] },
  { title:'過戶',overview:'完稅及文件齊備後，由公司送地政辦理移轉。',
    buyer:'接收承辦進度通知；必要時配合確認登記資料或補件。',
    seller:'配合必要補件，完成約定的搬遷與交付準備。',time:'一般預估約 3–5 個工作天，依地政審查及案件調整。',
    focus:'一般估時｜過戶約 3–5 工作天。',notice:'先驗屋須由仲介協調，仍不是正式交屋。',
    details:['公司在完稅及文件齊備後送件，辦理所有權移轉；有貸款時配合抵押權設定。','一般估時約 3–5 個工作天，實際依地政審查、文件齊備、銀行與個案安排調整，非保證期限。','公司追蹤地政進度並通知雙方；如需補件，再依承辦通知配合。','過戶或代償期間，賣方搬遷完成後可由仲介協調先行驗屋；確認屋況不代表可提前入住、施工或履保提前付款。'],
    faq:['這張卡表示我的案件已送件？','沒有；請以承辦送件通知及正式受理資料確認。'] },
  { title:'代償',overview:'賣方有原貸時，依銀行安排清償。',
    buyer:'接收撥款與代償進度通知，依承辦通知配合必要事項。',
    seller:'接收清償進度通知；必要時配合補件，搬遷後由仲介協調驗屋。',time:'代償另預估約 3–5 個工作天，依銀行與本案安排。',
    focus:'另估時｜代償另約 3–5 工作天。',notice:'無原貸可依本案略過；先行驗屋不等於正式交屋。',
    details:['賣方仍有貸款時，依銀行撥款安排代償；此階段另估約 3–5 個工作天，依文件、銀行及個案調整，非保證期限。','公司與銀行依授權辦理代償及後續文件銜接；客戶接收進度通知，必要時依承辦通知配合補件或核身。','過戶或代償期間，賣方搬遷後可由仲介協調買方驗屋；不代表可以提前入住、施工、正式交屋或履保提前付款。','無原貸或不需代償時依本案銜接交屋；清償、塗銷時點與前階段可能交錯。'],
    faq:['每個案件都要代償？','沒有原貸或不需代償的案件，依本案安排銜接交屋。'] },
  { title:'塗銷',overview:'代償後，接續處理賣方原抵押權。',
    buyer:'確認後續尾款與交屋安排。',
    seller:'依原貸分行通知準備清償及塗銷文件，確認領取與交付。',time:'依清償文件、銀行及承辦安排。',
    focus:'重點｜原抵押權處理完成後銜接交屋。',notice:'無原貸或不需代償者，依本案另行銜接。',
    details:['代償後取得清償文件，由承辦接續辦理賣方原抵押權塗銷。','向原貸款分行確認清償與塗銷文件、核身、印章與委託領件需求；依承辦指定安全管道交付，保留正本交付及返還紀錄。','是否完成以銀行文件、正式登記與承辦核對為準，不以閱讀或勾選代替。'],
    faq:['代償完成就表示原抵押權已塗銷？','還要接續清償文件與塗銷作業，由承辦確認。'] },
  { title:'交屋結案',overview:'依約核對尾款、分算與屋況，完成點交。',
    buyer:'核對屋況、鑰匙、設備、文件與費用分算。',
    seller:'依約搬遷交付，核對收款、鑰匙與設備點交及費用結算。',time:'依契約、條件及雙方約定。',
    focus:'重點｜先行驗屋非正式交屋。',notice:'交屋前，請依承辦通知核對應備資料與注意事項。',
    details:['依約確認尾款、稅費分算、屋況、鑰匙與設備點交，再完成交屋。','交屋前核對應備資料與注意事項；差異的處理方式、期限與交付紀錄保留清楚。','保存契約、付款與稅費憑證、取得成本與交易費用；適用的移轉後申報事項由承辦確認，不以交屋代替法定起算日。'],
    faq:['看完八段就代表結案？','不是；是否完成以實際辦理、交付與承辦核對為準。'] },
].map(Object.freeze));
export const CLOSING_SOURCE = Object.freeze({status:'verified-general-reminders',account:'@528scwxf',responseId:'81524093',keyword:'交屋',observedOn:'2026-10-08',roleSpecificChecklistsVerified:false});
export const PROCESS_STEP_TITLES = Object.freeze(STEPS.map(step => step.title));
const FINANCE = Object.freeze({
  salary:['受薪',['最新年度扣繳憑單或所得清單','薪資入帳明細、薪資單','剛換工作、含獎金或領現金，銀行可能補要說明。']],
  business:['自營／接案',['最新年度所得或報稅資料','營業／接案報酬入帳明細','適用營業稅申報資料或銀行指定的收入佐證；401／403／405依稅制適用，不是人人全交。']],
  pension:['退休',['退休金、退休俸或年金給付證明','定期給付入帳明細','一次領取與每月給付不同，由銀行評估。']],
  rental:['租金',['有效租約、租金入帳明細','租賃所得申報資料或所得清單','是否採認與組合，以承貸銀行個案通知為準。']],
  other:['其他／混合',['最新年度所得或報稅資料','各收入入帳明細','對應的利息、股利、分紅或其他收入證明；來源與金流需對應。']],
});
const FINANCE_NOTICE='以上是常見資料，不代表每項都要提供；期間、文件格式與組合依承貸銀行通知。';
export const ROUTES = Object.freeze(['home','services','process','process:buyer','process:seller',...STEPS.map((_,i)=>`step:${i+1}`),...STEPS.map((_,i)=>`detail:${i+1}`),'buyer','seller','finance',...Object.keys(FINANCE).map(key=>`finance:${key}`),'finance:conditions','finance:options','documents:contract',...['buyer','seller'].flatMap(role=>STEPS.flatMap((_,i)=>[`${role}:step:${i+1}`,`${role}:detail:${i+1}`])),'closing','closing:inspection','closing:warranty']);
const labelFor=route=>/^(buyer|seller):(step|detail):/.test(route)?`${route.startsWith('buyer:')?'買方':'賣方'}第${route.split(':')[2]}步${route.includes(':detail:')?'詳情':''}`:route==='documents:contract'?'簽約文件':route==='finance:options'?'貸款選項':route==='home'?'總覽':route==='process'?'交易流程':route==='process:buyer'?'買方八階段':route==='process:seller'?'賣方八階段':route.startsWith('step:')?`流程第${route.slice(5)}步`:route.startsWith('detail:')?`第${route.slice(7)}步詳情`:route==='buyer'?'買方備件':route==='seller'?'賣方備件':route==='finance'?'貸款收入證明':route==='finance:conditions'?'對保與付款提醒':route==='closing'?'交屋注意事項':route==='closing:inspection'?'交屋點交核對':route==='closing:warranty'?'屋況與保固':FINANCE[route.slice(8)][0];
const texts=Object.fromEntries(ROUTES.map(route=>['服務導覽：'+(route==='services'?'官方六項服務':labelFor(route)),route]));
Object.assign(texts,{'服務導覽：交屋清單':'closing','服務導覽：交屋清單買方':'closing','服務導覽：交屋清單賣方':'closing','服務導覽：官方服務':'services','服務導覽':'home',});
export const TEXT_ACTIONS=Object.freeze(texts);
const oldLabels={'home':'總覽','process':'買賣流程','buyer':'買方備件','seller':'賣方備件','finance':'貸款財力','finance:salary':'受薪收入','finance:business':'自營收入','finance:pension':'退休收入','finance:rental':'租金收入'};
for(let n=1;n<=8;n++)oldLabels['step:'+n]='流程第'+n+'步';
export function migrateLegacyRoute(route) { return route==='step:7'||route==='step:8'?'step:8':migrateClosingRoute(route); }
function migrateClosingRoute(route) { return ['closing:buyer','closing:seller'].includes(route)?'closing':route; }
export const LEGACY_TEXT_ACTIONS=Object.freeze({...Object.fromEntries(Object.entries(oldLabels).map(([route,label])=>['測試導覽：'+label,migrateLegacyRoute(route)])),[config.NATIVE_TEST_TRIGGER]:'home'});
function action(label, route) { return { type: 'postback', label, data: PREFIX + route, displayText: /^(查看|下一步|返回|更換)/.test(label) ? label : `查看${label}` }; }
function bubble(title, paragraphs, actions, color = theme.primary, faq = null) {
  const contents = [
    { type: 'text', text: '宏國地政|易丞地政 · 服務導覽', size: 'xs', color: theme.accent, wrap: true },
    { type: 'text', text: title, size: 'xl', weight: 'bold', color: theme.primary, wrap: true },
    {type:'separator',color:theme.gold,margin:'sm'},
    ...paragraphs.filter(Boolean).map(text => ({ type: 'text', size: 'sm', color: theme.ink, wrap: true, margin: 'md', ...(typeof text==='string'?{text,...(/^(重點|核發日期|付款依據|一般估時|另估時|公司準備|客戶準備)｜/.test(text)?{weight:'bold'}:{})}:text) })),
  ];
  if (faq) contents.push({ type: 'separator', margin: 'lg' }, { type: 'text', text: '常見問題｜' + faq[0], size: 'sm', weight: 'bold', wrap: true, margin: 'md' }, { type: 'text', text: faq[1], size: 'sm', wrap: true, margin: 'sm' });
  contents.push({ type: 'text', text: NOTICE, size: 'xs', color: theme.muted, wrap: true, margin: 'lg' });
  return { type: 'bubble', styles: {body:{backgroundColor:theme.white},footer:{backgroundColor:theme.surface}}, body: { type: 'box', layout: 'vertical', spacing: 'sm', contents }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: actions.map((a, i) => ({ type: 'button', height: 'sm', style: i < 2 ? 'primary' : 'secondary', ...(i < 2 ? { color:i===0?theme.primary:theme.accent } : {}), action: a })) } };
}
function response(route, cards, previous = null) {
  const nav = [];
  if (route === 'home') nav.push(action('官方六項服務', 'services'), { type: 'message', label: '其他需求與屋主登錄', text: '宏國服務體驗' });
  if (previous) nav.push(action('返回上一層', previous));
  if (['step:2','step:8'].includes(route)) nav.unshift(action('查看雙方詳情',route.replace('step:','detail:')));
  if (route === 'finance') nav.unshift(action('貸款選項','finance:options'));
  if (route !== 'home') nav.push(action('返回服務總覽', 'home'));
  return { route: 'native:' + route, state: { flow: 'native-test', step: route }, messages: [{ type: 'flex', altText: `${BRAND}：交易流程與貸款收入證明，請在聊天室選擇。`, contents: cards.length === 1 ? cards[0] : { type: 'carousel', contents: cards }, ...(nav.length ? { quickReply: { items: nav.map(a => ({ type: 'action', action: a })) } } : {}) }] };
}

const contactAction = () => ({type:'message',label:'請承辦協助',text:'預約諮詢'});
const keywordAction = (label,text) => ({type:'message',label,text});
const SELLER_USE = '印鑑證明用途為不動產登記或不限定用途。';
const HANDOVER_NOTICE = '先前驗屋非正式交屋；依本案約定，交屋結案當天方為正式交屋。';
const SELLER_PAYMENTS = [
  '本公司通知流程｜有履保者，由履保公司依約辦理款項撥付。',
  '一般買賣｜依承辦通知，將本階段應繳款項匯入地政士指定帳戶；實際款項與帳戶依本案正式通知核對。',
];
export const EXISTING_CONTENT_KEYWORDS = Object.freeze({natural:'簽約文件－自然人',company:'簽約文件－公司法人',qingan:'新青安'});
// Exact native OA actions observed on 2026-10-10. Do not intercept these texts
// in the webhook or duplicate the OA-specific content, service pages or prices.
const commonServiceKeywords = ['買賣', '簽約', '貸款規定', '公司簽約', '收支比', '申請加入 宏國地政 | 易丞地政 VIP社群'];
export const EXISTING_SERVICE_KEYWORDS = Object.freeze({
  '@604gpqef': Object.freeze([...commonServiceKeywords]),
  '@528scwxf': Object.freeze(commonServiceKeywords.map((text, index) => index === 2 ? '貸款' : text)),
  '@375umdzq': Object.freeze([...commonServiceKeywords]),
});
export const EXISTING_LOAN_KEYWORDS = Object.freeze({'@604gpqef':'貸款應備','@528scwxf':'新青安','@375umdzq':'新青安'});
export const LOAN_POLICY_SOURCE = Object.freeze({verifiedOn:'2026-10-09',url:'https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=482aa9c142b34abc83750cb64c15cb11',principles:'https://www.nta.gov.tw/htmlList/71'});
function roleNotice(role,n) {
  if(n===2) return role==='buyer'?'僅賣方需檢付印鑑章與印鑑證明，用來確認賣方出售意思並核對用印；特殊核身方式另確認。':{text:SELLER_USE,weight:'bold',color:theme.warning};
  if(n===8&&role==='buyer')return null;
  return STEPS[n-1].notice;
}
function roleFocus(role,n) {
  if(n===2&&role==='buyer')return '用印｜僅賣方需檢付印鑑章與印鑑證明。';
  if(n===8)return HANDOVER_NOTICE;
  return STEPS[n-1].focus;
}
function roleCard(role,n,detailed=false) {
  const step=STEPS[n-1],name=role==='buyer'?'買方':'賣方';
  let paragraphs;
  if(detailed) {
    if(n===2&&role==='buyer') paragraphs=['僅賣方需檢付印鑑章與印鑑證明。','用來確認賣方出售意思，並核對用印。','買方已準備的銀行資料不重複交。','特殊核身方式另確認。'];
    else if(n===2) paragraphs=[{text:SELLER_USE,weight:'bold',color:theme.warning},...step.details];
    else paragraphs=[...step.details.filter((_,i)=>!(n===8&&role==='buyer'&&i===1)),...(n===4&&role==='seller'?SELLER_PAYMENTS:[]),...(n===8?[HANDOVER_NOTICE]:[])];
  } else paragraphs=[...(n===2&&role==='seller'?[roleNotice(role,n)]:[]),`${name}｜${step[role]}`,...(n===4&&role==='seller'?SELLER_PAYMENTS:[]),roleFocus(role,n),...(n===2&&role==='seller'?['特殊核身方式另確認。']:[roleNotice(role,n)])];
  const actions=detailed?[action('返回本階段',`${role}:step:${n}`),...(n===1?[action('簽約應備文件','documents:contract')]:[]),action('返回角色流程',`process:${role}`)]:[action(n<8?'下一步：'+STEPS[n].title:'查看交屋注意事項',n<8?`${role}:step:${n+1}`:'closing'),action('查看重點詳情',`${role}:detail:${n}`),action(n===1?'簽約應備文件':'返回角色流程',n===1?'documents:contract':`process:${role}`)];
  const ordered=n===2&&role==='seller'?[paragraphs[0],`時間｜${step.time}`,...paragraphs.slice(1)]:[`時間｜${step.time}`,...paragraphs];
  const faq=n===2&&role==='buyer'?['買方需檢付印鑑證明嗎？','本公司導覽由賣方檢付印鑑章與印鑑證明；買方核身依承辦通知配合。']:step.faq;
  return bubble(`${String(n).padStart(2,'0')} ${step.title}｜${name}${detailed?'詳情':''}`,ordered,actions,theme.primary,detailed?faq:null);
}

export function buildNativeGuide(route, options = {}) {
  route=migrateClosingRoute(route);

  if(!ROUTES.includes(route))return response('invalid',[bubble('選項已失效',['請返回服務總覽重新選擇。'],[action('返回服務總覽','home')])]);
  if(route==='home')return response(route,[bubble('服務導覽｜交易流程',['從簽約到交屋，這裡整理各階段的重要事項。','付款與交屋安排，依本案契約及承辦人通知辦理。'],[action('我是買方','buyer'),action('我是賣方','seller'),action('交易流程總覽','process')]),bubble('貸款收入證明',['依主要收入來源，查看銀行常見收入證明。','公司提供銀行身分、房地與契約；客戶主要配合財力。'],[action('貸款收入證明','finance'),action('貸款選項','finance:options'),action('官方六項服務','services')],theme.primary)]);
  if(route==='services') {
    const account = options.account ?? '@604gpqef';
    const keywords = Object.hasOwn(EXISTING_SERVICE_KEYWORDS, account) ? EXISTING_SERVICE_KEYWORDS[account] : null;
    if (!keywords) return buildNativeGuide('invalid');
    const actions = [
      action('買賣過戶', 'process'),
      keywordAction('貸款規劃', keywords[2]),
      keywordAction('收支比試算', keywords[4]),
      keywordAction('法人簽約', keywords[3]),
      keywordAction('自然人簽約', keywords[1]),
      keywordAction('加入社群', keywords[5]),
    ];
    return response(route, [
      bubble('官方六項服務｜交易與貸款', ['買賣過戶：查看交易流程總覽。','貸款與收支比，沿用本帳號原有服務；向左滑可選簽約與社群。'], actions.slice(0, 3)),
      bubble('官方六項服務｜簽約與社群', ['依簽約身分選擇服務；簽約與社群申請，沿用本帳號原有回覆。'], actions.slice(3)),
    ], 'home');
  }
  if(route==='process:buyer'||route==='process:seller'){
    const buyer=route==='process:buyer',name=buyer?'買方':'賣方';
    return response(route,STEPS.map((step,i)=>bubble(`${String(i+1).padStart(2,'0')} ${step.title}`,[...(i===1&&!buyer?[roleNotice('seller',2)]:[]),`${name}｜${step[buyer?'buyer':'seller']}`,`時間｜${step.time}`,...(i===3&&!buyer?SELLER_PAYMENTS:[]),...(i===7?[HANDOVER_NOTICE]:[]),...(i===1&&!buyer?['特殊核身方式另確認。']:[roleNotice(buyer?'buyer':'seller',i+1)])],[action('查看本階段',`${buyer?'buyer':'seller'}:step:${i+1}`)])),buyer?'buyer':'seller');
  }
  if(/^(buyer|seller):(step|detail):[1-8]$/.test(route)){const [role,view,number]=route.split(':');return response(route,[roleCard(role,Number(number),view==='detail')],`process:${role}`);}
  if(route==='documents:contract')return response(route,[bubble('簽約應備文件',['依簽約身分查看原有買賣雙方文件圖卡，個案需補文件由承辦確認。'],[keywordAction('自然人簽約文件',EXISTING_CONTENT_KEYWORDS.natural),keywordAction('公司法人簽約文件',EXISTING_CONTENT_KEYWORDS.company),contactAction()])],'buyer');
  if(route==='finance:options')return response(route,[bubble('新青安3.0與貸款說明',['查看原有新青安方案與額度／核貸說明。','青安3.0一般最高1,000萬元；新婚家庭最高1,200萬元；育有未成年子女家庭最高1,500萬元。','最長40年仍受年齡及核貸限制；前3年利息補貼後逐年調整，機動利率依承貸銀行公告。','資格、所得及房價限制須核對，最高額度不是保證核貸。'],[keywordAction('新青安3.0',EXISTING_LOAN_KEYWORDS[options.account]||EXISTING_CONTENT_KEYWORDS.qingan),contactAction()])],'finance');
  if(route==='process')return response(route,STEPS.map((step,i)=>bubble(`${String(i+1).padStart(2,'0')} ${step.title}`,[step.overview,...(i===4||i===5?[step.focus,'實際依本案調整，非保證期限。']:[])],[action('查看本階段',`step:${i+1}`)])),'home');
  if(route.startsWith('step:')){
    const n=Number(route.slice(5)),step=STEPS[n-1];
    if(n===2||n===8)return response(route,['buyer','seller'].map(role=>roleCard(role,n)),n===1?'process':'step:'+(n-1));
    const actions=[action(n<8?'下一步：'+STEPS[n].title:'查看交屋注意事項',n<8?'step:'+(n+1):'closing'),action('查看重點詳情','detail:'+n),action('交易流程總覽','process')];
    return response(route,[bubble(`${String(n).padStart(2,'0')} ${step.title}`,[`買方｜${step.buyer}`,`賣方｜${step.seller}`,...(n===4?SELLER_PAYMENTS:[]),step.focus,step.notice],actions)],n===1?'process':'step:'+(n-1));
  }
  if(route.startsWith('detail:')){
    const n=Number(route.slice(7)),step=STEPS[n-1];
    if(n===2||n===8)return response(route,['buyer','seller'].map(role=>roleCard(role,n,true)),'step:'+n);
    return response(route,[bubble(step.title+'｜重點詳情',[`時間｜${step.time}`,...step.details],[action('返回本階段','step:'+n),action('交易流程總覽','process')],theme.primary,step.faq)],'step:'+n);
  }
  if(route==='buyer')return response(route,[bubble('買方流程與備件',['公司準備｜銀行所需身分、房地與買賣契約資料由公司提供。','客戶準備｜依銀行通知提供收入證明、申請與聯徵同意。','移轉核身與用印，依本案另行通知。'],[action('買方八階段','process:buyer'),action('貸款收入證明','finance'),action('簽約應備文件','documents:contract')],theme.primary)],'home');
  if(route==='seller')return response(route,[bubble('賣方流程與備件',[{text:SELLER_USE,weight:'bold',color:theme.warning},'依承辦通知備印鑑章、印鑑證明，核對印文。','核發日期請看備證用印詳情；特殊核身方式另確認。','有原貸時另確認清償、塗銷與銀行窗口，不混入買方財力清單。'],[action('賣方八階段','process:seller'),action('備證用印詳情','seller:detail:2'),action('清償與塗銷','seller:step:7')],theme.primary)],'home');
  if(route==='finance')return response(route,[bubble('貸款收入證明',['依主要收入來源，準備銀行通知需要的資料。',FINANCE_NOTICE,'公司已準備的身分、房地與買賣契約，不重複列為客戶財力文件。'],Object.entries(FINANCE).slice(0,3).map(([key,[name]])=>action(name,'finance:'+key)),theme.primary),bubble('租金、其他與混合收入',['依實際收入來源與金流準備；不把所有分支都列為必交。'],[action('租金','finance:rental'),action('其他／混合','finance:other'),action('對保與付款提醒','finance:conditions')],theme.primary)],'home');
  if(route==='finance:conditions')return response(route,[bubble('對保與付款提醒',[BANK_SIGNING,'備齊仍須銀行審核；額度與撥款條件以核定為準。','貸款不足或延遲仍依契約，預期無法如期付款應提前聯繫承辦。','期間、文件格式與組合待承辦銀行確認；不預設配偶或保證人。'],[action('返回收入證明','finance'),action('本案付款通知','step:4')],theme.primary)],'finance');
  if(route.startsWith('finance:')){
    const [name,items]=FINANCE[route.slice(8)];
    return response(route,[bubble(name+'｜常見收入證明',[...items,FINANCE_NOTICE,'文件依承辦指定管道提供；交付與需求請直接向承辦確認。'],[action('更換收入類型','finance'),action('對保與付款提醒','finance:conditions'),contactAction()],theme.primary)],'finance');
  }
  // These are verified general handover reminders, not role-specific document lists.
  // Never route the OA's actual completion/disbursement announcement from navigation.
  if(route.startsWith('closing') && options.closingSourceAvailable===false)
    return response('closing',[bubble('交屋前確認',['請依承辦通知核對本案應備資料、尾款與交付安排。'],[action('返回交屋階段','step:8')])],'step:8');
  if(route==='closing')return response(route,[bubble('交屋注意事項',['簽約前先確認屋況，交屋當天再複查一次。','核對本案尾款與費用分算；先行驗屋不等於正式交屋。'],[action('交屋點交核對','closing:inspection'),action('屋況與保固','closing:warranty')])],'step:8');
  if(route==='closing:inspection')return response(route,[bubble('交屋點交核對',[
    '□ 房屋現況','□ 水電瓦斯是否正常','□ 設備是否可使用','□ 管理費是否分算','□ 鑰匙、磁扣、遙控器是否交接','□ 必要時是否拍照或錄影留存',
    '交屋當天的照片、影片、點交確認紀錄，日後都可能成為釐清爭議的重要資料。',
  ],[action('屋況與保固','closing:warranty'),action('返回交屋注意事項','closing')])],'closing');
  return response(route,[bubble('屋況與保固',[
    '簽約前，請先確認房屋目前是否有滲漏水、壁癌、修繕痕跡或修繕紀錄。',
    '確認不動產現況說明書如實揭露；如約定保固，請確認：',
    '□ 保固範圍是哪些地方','□ 保固期間多久','□ 發生問題時由誰處理','□ 修繕費用由誰負擔','□ 是否需要拍照、通知或報修紀錄',
  ],[action('交屋點交核對','closing:inspection'),action('返回交屋注意事項','closing')])],'closing');
}
export function routeNativeGuide(event, account) {
  if(!ACCOUNTS.has(account)||!event||typeof event!=='object'||Array.isArray(event)||event.mode!=='active'||event.source?.type!=='user')return null;
  const documentsEnabled=config.isNativeDocumentEnabled(account.slice(1));
  if(config.isPublicNativeEvent(event)&&!config.isNativePublicEnabled(account.slice(1)))return null;
  if((event.type==='message'&&event.message?.type==='text'&&[DOCUMENT_TRIGGER,'測試導覽：備件勾選'].includes(event.message.text))||(event.type==='postback'&&typeof event.postback?.data==='string'&&(event.postback.data.startsWith(DOCUMENT_PREFIX)||event.postback.data.startsWith(LEGACY_DOCUMENT_PREFIX))))return documentsEnabled?routeDocumentGuide(event):buildNativeGuide('finance');
  if(event.type==='message'&&event.message?.type==='text'){
    const value=event.message.text;if(typeof value!=='string'||value.length>32)return null;
    const route=Object.hasOwn(TEXT_ACTIONS,value)?TEXT_ACTIONS[value]:Object.hasOwn(LEGACY_TEXT_ACTIONS,value)?LEGACY_TEXT_ACTIONS[value]:null;
    return route?buildNativeGuide(route,{documentsEnabled,account}):null;
  }
  const data=event.type==='postback'?event.postback?.data:null;
  if(typeof data!=='string')return null;
  const prefix=data.startsWith(PREFIX)?PREFIX:data.startsWith(LEGACY_PREFIX)?LEGACY_PREFIX:null;if(!prefix)return null;
  const route=data.length<=80?data.slice(prefix.length):'invalid';
  return buildNativeGuide(prefix===LEGACY_PREFIX?migrateLegacyRoute(route):route,{documentsEnabled,account});
}
