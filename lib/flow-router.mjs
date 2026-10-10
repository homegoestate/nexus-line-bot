/**
 * Stateless service guide for the three explicitly allowlisted LINE OAs.
 * Caller verifies webhook signature and destination before invoking this module.
 * No IO, storage, registration or sending occurs here. A null result must pass
 * unchanged to the existing keyword handlers. Postbacks are public UI states.
 * Retain the v1 prefix and routes so previously sent cards remain usable.
 */
import welcomeContent from './welcome-content.js';
import { routeNativeGuide } from './native-chat-guide.mjs';
import config from './native-guide-config.js';
import theme from './brand-theme.js';
export const PILOT_PREFIX = 'hgpilot:v1:';
export const MAX_POSTBACK_LENGTH = 80;
// All authorized OAs share the existing formal registration entry and backend.
// Keep its established oa value; this is a shared destination, not source attribution.
export const OWNER_REGISTER_URI = 'https://script.google.com/macros/s/AKfycbwne31PhZ2AxkDpIbTsq4Al9kexafx7LbZEM9mBXlutDo7ls5G4hG95SkQN-E4oB6G0/exec?view=register&oa=604gpqef';
const BRAND = '宏國地政|易丞地政';
const ACCOUNT_OA_IDS = Object.freeze({
  '@604gpqef': '604gpqef',
  '@528scwxf': '528scwxf',
  '@375umdzq': '375umdzq',
});
export const TEXT_TRIGGERS = Object.freeze({
  '宏國服務體驗': 'home',
  '宏國買房導覽': 'buy',
  '宏國房貸導覽': 'loan',
  '宏國新屋主導覽': 'owner',
  '宏國賣房導覽': 'sell',
  '宏國傳承導覽': 'inherit',
  '宏國土地建商導覽': 'land',
});

const COLOR = Object.freeze({
  navy: theme.primary, gold: theme.accent, white: theme.white,
  cream: theme.surface, ink: theme.ink, muted: theme.muted, line: theme.line,
});
const CHAT_NOTICE = '按下按鈕會將摘要傳入本官方帳號聊天；尚不代表已受理，亦未承諾回覆或完成時間。';
const OWNER_NOTICE = '「前往正式登錄」會開啟既有正式登錄表單。請勿輸入虛構或示範資料；僅閱讀導覽時可返回首頁。';
const LEGACY_ACTIONS = Object.freeze({
  '買房檢查': '查看買房檢查',
  '買房費用': '查看買房費用',
  '買賣流程': '查看買賣流程',
  '貸款': '查看貸款說明',
});

const FLOWS = {
  buy: {
    title: '買房準備', label: '買房',
    stagePrompt: '目前買房進度到哪裡？',
    stages: {
      looking: { label: '還在看屋', prep: '把看屋條件、可用資金與希望入住時間列在一起。', missing: '是否已有物件及預計購屋時間' },
      selected: { label: '選定房屋，還沒簽約', prep: '整理選定物件的現況說明，以及預計簽約和付款時間。', missing: '物件基本資料及預計簽約時間' },
      signed: { label: '已經簽約', prep: '從已簽契約標出付款、申貸與交屋時點，列出待確認條款。', missing: '契約約定及下一個付款節點' },
    },
    focusPrompt: '最想先弄清楚哪件事？',
    focuses: {
      docs: { label: '房屋要查哪些資料', prep: '列出已取得的產權、現況與使用資料，標記缺件及不一致之處。', missing: '已有文件及尚未釐清的物件疑問', keyword: '買房檢查' },
      funds: { label: '自備款與支出怎麼排', prep: '分開記錄可動用資金、各期付款和待確認支出，避免只看成交價。', missing: '資金可用時間及付款安排', keyword: '買房費用' },
      process: { label: '交易下一步怎麼走', prep: '將簽約、申貸、過戶與交屋列成進度表，標出目前卡住的一步。', missing: '已完成事項及下一步待辦', keyword: '買賣流程' },
    },
    notice: '此清單依選項整理，尚未查核物件或契約。',
  },
  sell: {
    title: '賣房準備', label: '賣房',
    stagePrompt: '目前賣房進度到哪裡？',
    stages: {
      evaluating: { label: '還在評估要不要賣', prep: '先寫下出售原因、希望完成的時間，以及是否需要另外安排住處。', missing: '出售目標及預計時程' },
      listed: { label: '已經委託或刊登', prep: '整理委託文件、開價與看屋回饋，標出已有約定及待補說明。', missing: '委託約定及目前洽談情況' },
      offer: { label: '已有買方洽談', prep: '整理買方提出的條件、付款與交屋安排，逐項標明是否已有共識。', missing: '買方條件及目前書面約定' },
    },
    focusPrompt: '賣房前最想先釐清什麼？',
    focuses: {
      net: { label: '售後實拿要備哪些資料', prep: '盤點取得及持有資料、貸款清償資訊與已知支出，作為後續核對基礎。', missing: '取得資料、貸款清償及支出項目' },
      costs: { label: '哪些費用還沒確認', prep: '將仲介、登記與其他約定支出分項列出，保留報價或契約依據。', missing: '費用報價及雙方負擔約定' },
      docs: { label: '賣房文件怎麼準備', prep: '列出產權、現況及既有契約的持有情況，先確認缺件再安排取得。', missing: '持有文件及尚缺資料' },
    },
    notice: '尚未計算售後實拿或稅費，需依資料另行確認。',
  },
  loan: {
    title: '房貸準備', label: '房貸',
    stagePrompt: '這次是什麼房貸需求？',
    stages: {
      before: { label: '買房前先做準備', prep: '列出購屋預算、資金可動用時間與預計購屋時程。', missing: '購屋時程及是否已有物件' },
      selected: { label: '已選定要買的房屋', prep: '整理物件基本資料、洽談條件與各期付款時間。', missing: '物件資料及預定付款時程' },
      existing: { label: '已有房貸想再了解', prep: '先查看既有貸款契約，記錄餘額、月付、剩餘期間與限制事項。', missing: '既有貸款條件及這次資金用途' },
    },
    focusPrompt: '想先準備哪一部分？',
    focuses: {
      funds: { label: '資金需求怎麼整理', prep: '整理收入、固定支出與負債概況，列出資金用途和需要時間。', missing: '資金用途、時間及負擔概況' },
      // Keep the historical ID; this path only organizes property information.
      valuation: { label: '房屋資料怎麼備', prep: '列出房屋類型、屋齡、權利資料及現況資訊的取得情形。', missing: '物件基本資料及缺件項目' },
      docs: { label: '貸款收入證明', prep: '先列出可提供的收入與財力文件；銀行身分、房地與買賣契約資料由公司準備，不重複列為客戶備件。交付方式依承辦通知。', missing: '可提供的收入證明及尚未取得的財力資料' },
    },
    keyword: '貸款',
    notice: '本導覽未進行貸款試算；貸款條件與核准結果仍須由銀行依個案審核。',
  },
  inherit: {
    title: '傳承資料準備', label: '傳承',
    stagePrompt: '目前最接近哪一種情況？',
    stages: {
      planning: { label: '想先整理未來傳承', prep: '先記錄希望照顧的對象、資產範圍與這次想釐清的問題。', missing: '傳承目標及要討論的資產範圍' },
      inherited: { label: '家人過世，待整理事務', prep: '列出目前已知事實、收到的通知及已辦事項，保留相關文件。', missing: '已知事實、文件及已辦事項' },
      discussing: { label: '家人正在討論安排', prep: '把已有共識、仍有不同想法的事項分開記錄，供後續討論。', missing: '討論範圍及尚未有共識的事項' },
    },
    focusPrompt: '這次先整理哪一部分？',
    focuses: {
      assets: { label: '有哪些資產待整理', prep: '以資產種類與持有情況列清單，將不清楚的權利或負債另做標記。', missing: '資產種類、持有情況及待查項目' },
      docs: { label: '現有文件夠不夠', prep: '只先列出已有文件種類與缺件情形，確認需要後再安排交付。', missing: '已有文件種類及缺件情形' },
      family: { label: '家人有哪些待談事項', prep: '整理各方想確認的問題與待討論事項，先不替任何人決定安排。', missing: '關係概況及需要共同確認的問題' },
    },
    notice: '此處只整理資訊，尚未判定權利、應辦程序或傳承方案。',
  },
  land: {
    title: '土地與建案準備', label: '土地與建案',
    stagePrompt: '您目前從哪個角色了解？',
    stages: {
      owner: { label: '地主想先了解', prep: '整理土地基本資料、持有情況，以及這次希望處理的事情。', missing: '土地範圍、持有情況及目標' },
      builder: { label: '建商準備規劃專案', prep: '整理基地範圍、已取得的規劃資料與目前專案階段。', missing: '基地範圍、規劃資料及專案階段' },
      partner: { label: '正在洽談合作整合', prep: '整理合作討論的範圍、已交換的文件，以及仍待確認的條件。', missing: '合作範圍、書面資料及待談條件' },
    },
    focusPrompt: '最需要先確認哪一部分？',
    focuses: {
      rights: { label: '權利與持有資料', prep: '列出已知權利範圍、共有或使用情況，將尚待查核之處單獨標記。', missing: '權利文件及使用現況資料' },
      development: { label: '使用規劃要查什麼', prep: '整理預想用途與現有分區、計畫等資料，列出需要查證的項目。', missing: '所在地、預想用途及現有規劃資料' },
      project: { label: '專案文件與分工', prep: '列出目前專案階段、已有文件與參與單位，標出缺件及待確認分工。', missing: '專案階段、文件及分工情況' },
    },
    notice: '尚未判定可否使用、開發或合作可行性，須依基地資料查核。',
  },
};

const OWNER_STAGES = {
  prepare: {
    label: '準備登錄', title: '先確認，再進正式登錄',
    list: ['先確認建案及戶別，並確認確有登錄需求。', '進入表單後核對所選建案，再依表單要求填寫真實資料。', '若只是測試導覽，請停在此頁或返回服務主選單。'],
    request: '想先確認正式登錄的準備事項。', missing: '建案、戶別及是否確有登錄需求',
  },
  supplement: {
    label: '已登錄，想補充', title: '補充資料前，先確認方式',
    list: ['先保留原登錄紀錄，不要為補充資料重複新增。', '可先在官方聊天說明需要補充的事項類型。', '資料交付方式與對應紀錄，待人工確認後再處理。'],
    request: '想確認既有登錄資料的補充方式，尚未重新送出登錄。', missing: '原登錄紀錄及欲補充的事項類型',
  },
  missing: {
    label: '找不到建案', title: '先確認建案名稱',
    list: ['先核對建案名稱與建商提供的名稱是否一致。', '找不到時請勿改選其他建案送出。', '可送出下方需求摘要，由官方聊天接續確認。'],
    request: '正式登錄入口找不到建案，想確認應使用的建案名稱。', missing: '建商提供的建案名稱及登錄指引',
  },
};

// Exact values only: no JSON/query parsing, decoding, or user-text interpolation.
const ROUTES = new Map([
  ['home', { flow: 'home', step: 'home' }],
  ['owner', { flow: 'owner', step: 'stage' }],
]);
for (const [flow, config] of Object.entries(FLOWS)) {
  ROUTES.set(flow, { flow, step: 'stage' });
  for (const stage of Object.keys(config.stages)) {
    ROUTES.set(`${flow}:stage:${stage}`, { flow, step: 'focus', stage });
    for (const focus of Object.keys(config.focuses)) {
      ROUTES.set(`${flow}:result:${stage}:${focus}`, { flow, step: 'summary', stage, focus });
    }
  }
}
for (const stage of Object.keys(OWNER_STAGES)) ROUTES.set(`owner:guide:${stage}`, { flow: 'owner', step: 'guidance', stage });

function resolveAccount(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptor = Object.getOwnPropertyDescriptor(options, 'account');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || Reflect.ownKeys(options).length !== 1) return null;
  const account = descriptor.value;
  return typeof account === 'string' && Object.hasOwn(ACCOUNT_OA_IDS, account) ? account : null;
}
function textComponent(text, extra = {}) {
  return { type: 'text', text, size: 'sm', color: COLOR.ink, wrap: true, ...extra };
}
function postback(label, route) {
  if (!ROUTES.has(route)) throw new Error('Unknown internal guide route');
  return { type: 'postback', label, data: `${PILOT_PREFIX}${route}` };
}
function summaryAction(summary) {
  return { type: 'message', label: '請代書協助下一步', text: summary };
}
function legacyAction(keyword) {
  if (!Object.hasOwn(LEGACY_ACTIONS, keyword)) throw new Error('Unknown legacy keyword');
  return { type: 'message', label: LEGACY_ACTIONS[keyword], text: keyword };
}
function bubble({ title, eyebrow, paragraphs = [], list = [], notice, actions = [] }) {
  if (actions.length > 3) throw new Error('A guide card may have at most 3 options');
  if (actions.some(action => action.label.length > 20)) throw new Error('Guide action label is too long');
  const body = [textComponent(title, { size: 'xl', weight: 'bold', color: COLOR.navy })];
  for (const text of paragraphs) body.push(textComponent(text, { margin: 'md' }));
  list.forEach((text, index) => body.push({
    type: 'box', layout: 'horizontal', spacing: 'md', margin: 'lg',
    contents: [
      textComponent(String(index + 1).padStart(2, '0'), { flex: 0, color: COLOR.gold, weight: 'bold' }),
      textComponent(text, { flex: 1 }),
    ],
  }));
  if (notice) {
    body.push({ type: 'separator', margin: 'lg', color: COLOR.line });
    body.push(textComponent(notice, { size: 'xs', color: COLOR.muted, margin: 'md' }));
  }
  const card = {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm',
      contents: [
        textComponent(BRAND, { size: 'xs', weight: 'bold', color: COLOR.white }),
        textComponent(eyebrow, { size: 'sm', color: COLOR.white }),
      ],
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: body },
    styles: { header: { backgroundColor: COLOR.navy }, body: { backgroundColor: COLOR.white } },
  };
  if (actions.length) {
    card.footer = {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
      contents: actions.map((action, index) => ({
        type: 'button', height: 'sm', style: index === 0 ? 'primary' : 'secondary',
        ...(index === 0 ? { color: COLOR.navy } : {}), action,
      })),
    };
    card.styles.footer = { backgroundColor: COLOR.cream };
  }
  return card;
}
function response(route, state, cards, altText, previous = null) {
  const message = {
    type: 'flex', altText: `${BRAND}：${altText}`,
    contents: cards.length === 1 ? cards[0] : { type: 'carousel', contents: cards },
  };
  if (state.flow !== 'home' || state.step === 'invalid') {
    const navigation = [];
    if (previous && previous !== 'home') navigation.push(postback('回上一題', previous));
    navigation.push(postback('返回服務主選單', 'home'));
    message.quickReply = { items: navigation.map(action => ({ type: 'action', action })) };
  }
  return { messages: [message], route, state: { ...state } };
}
function home(account = '@604gpqef') {
  const formalEnabled = config.isNativePublicEnabled(account.slice(1)) && config.isNativeTestEnabled(account.slice(1));
  return response('home', { flow: 'home', step: 'home' }, [
    ...(formalEnabled ? [bubble({
      eyebrow: '交易流程、貸款備件與官方服務', title: '服務導覽',
      paragraphs: ['先看交易與備件引導，也可點選原有六項服務。'],
      actions: [
        { type: 'postback', label: '開啟服務導覽', data: config.NATIVE_GUIDE_PREFIX + 'home' },
        { type: 'postback', label: '交易流程', data: config.NATIVE_GUIDE_PREFIX + 'process' },
        { type: 'postback', label: '貸款收入證明', data: config.NATIVE_GUIDE_PREFIX + 'finance' },
      ],
    })] : []),
    bubble({
      eyebrow: '先選目前要處理的事情 · 1 / 2', title: '買賣與房貸',
      actions: [postback('買房前要注意什麼', 'buy'), postback('賣房前要準備什麼', 'sell'), postback('房貸資料怎麼準備', 'loan')],
    }),
    bubble({
      eyebrow: '先選目前要處理的事情 · 2 / 2', title: '傳承、土地與交屋',
      actions: [postback('家產傳承從哪裡開始', 'inherit'), postback('土地建案要先確認什麼', 'land'), postback('新屋主如何登錄', 'owner')],
    }),
  ], `${formalEnabled ? '服務導覽：交易流程、貸款備件與官方六項服務。' : ''}買房、賣房、房貸、傳承、土地建案或新屋主登錄，請選擇一項。`);
}
function flowPage(route, state) {
  const config = FLOWS[state.flow];
  if (state.step === 'stage') {
    return response(route, state, [bubble({
      eyebrow: `${config.title} · 1 / 2`, title: config.stagePrompt,
      actions: Object.entries(config.stages).map(([stage, value]) => postback(value.label, `${state.flow}:stage:${stage}`)),
    })], `${config.title}：${config.stagePrompt}`, 'home');
  }
  const stage = config.stages[state.stage];
  if (state.step === 'focus') {
    return response(route, state, [bubble({
      eyebrow: `${config.title} · 2 / 2`, title: config.focusPrompt,
      paragraphs: [`目前情況：${stage.label}`],
      actions: Object.entries(config.focuses).map(([focus, value]) => postback(value.label, `${state.flow}:result:${state.stage}:${focus}`)),
    })], `${config.title}：${stage.label}，請選擇想先釐清的事項。`, state.flow);
  }
  const focus = config.focuses[state.focus];
  const missing = `${stage.missing}；${focus.missing}`;
  const summary = `【需求諮詢】${config.label}\n目前情況：${stage.label}\n優先了解：${focus.label}\n還需確認：${missing}\n請協助確認準備事項與下一步，待人工確認。`;
  const keyword = focus.keyword || config.keyword;
  return response(route, state, [
    bubble({
      eyebrow: `${config.title} · 準備清單`, title: '依目前情況，先整理這些',
      paragraphs: [`${stage.label} / ${focus.label}`],
      list: [stage.prep, focus.prep, `還需確認：${missing}。`],
      notice: `${config.notice} 向左滑可確認諮詢摘要。`,
      actions: keyword ? [legacyAction(keyword)] : [],
    }),
    bubble({
      eyebrow: `${config.title} · 需求摘要`, title: '點選後，摘要會傳到聊天',
      paragraphs: [summary], notice: CHAT_NOTICE, actions: [summaryAction(summary)],
    }),
  ], `${config.title}：${stage.label} / ${focus.label}。查看準備清單，向左滑可確認需求摘要。`, `${state.flow}:stage:${state.stage}`);
}
function ownerPage(route, state) {
  if (state.step === 'stage') {
    return response(route, state, [bubble({
      eyebrow: '新屋主登錄導覽', title: '目前遇到哪一種狀況？',
      notice: '此導覽本身不會新增或更新正式登錄資料。',
      actions: Object.entries(OWNER_STAGES).map(([stage, value]) => postback(value.label, `owner:guide:${stage}`)),
    })], '新屋主登錄導覽：準備登錄、已登錄想補充，或找不到建案。', 'home');
  }
  const guide = OWNER_STAGES[state.stage];
  const summary = `【需求諮詢】新屋主登錄\n目前狀況：${guide.label}\n${guide.request}\n還需確認：${guide.missing}\n此訊息僅表達需求，待人工確認。`;
  return response(route, state, [
    bubble({
      eyebrow: '新屋主登錄 · 準備清單', title: guide.title,
      list: guide.list, paragraphs: [`還需確認：${guide.missing}。`],
      notice: state.stage === 'prepare' ? OWNER_NOTICE : '此頁僅提供指引，尚未查核原登錄紀錄。',
      actions: state.stage === 'prepare' ? [{ type: 'uri', label: '前往正式登錄', uri: OWNER_REGISTER_URI }] : [],
    }),
    bubble({
      eyebrow: '新屋主登錄 · 需求摘要', title: '點選後，摘要會傳到聊天',
      paragraphs: [summary], notice: CHAT_NOTICE, actions: [summaryAction(summary)],
    }),
  ], `新屋主登錄：${guide.label}。${state.stage === 'prepare' ? '前往正式登錄會開啟正式表單，請勿輸入虛構或示範資料。' : '請依指引確認下一步。'}`, 'owner');
}
function invalidPostback() {
  return response('invalid', { flow: 'home', step: 'invalid' }, [bubble({
    eyebrow: '服務導覽', title: '這個選項目前無法使用',
    paragraphs: ['請返回服務主選單，重新選擇需要的服務。'],
    actions: [postback('返回服務主選單', 'home')],
  })], '這個服務導覽選項無法使用，請返回服務主選單。');
}

/**
 * routeEvent(event, options) -> null | { messages, route, state }
 * An omitted options argument retains the historical @604gpqef default.
 * Supplied options must contain only an own, allowlisted account string.
 * The caller must derive account from verified configuration, not event input.
 * Match only exact reserved trigger texts and the established postback prefix.
 * Invalid own-prefix payloads receive fixed recovery. Other input, including
 * allowlisted original keywords and user-sent consultation summaries, falls
 * through unchanged to existing handlers. Event identities never enter output.
 */
export function routeEvent(event, options = { account: '@604gpqef' }) {
  const account = resolveAccount(options);
  if (!account) return null;
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  if (event.mode === 'standby') return null;
  if (event.source?.type && event.source.type !== 'user') return null;
  const nativeGuide = routeNativeGuide(event, account);
  if (nativeGuide) return nativeGuide;
  let route;
  if (event.type === 'message' && event.message?.type === 'text') {
    const text = event.message.text;
    if (typeof text !== 'string' || text.length > 32 || !Object.hasOwn(TEXT_TRIGGERS, text)) return null;
    route = TEXT_TRIGGERS[text];
  } else if (event.type === 'postback') {
    const data = event.postback?.data;
    if (typeof data !== 'string' || !data.startsWith(PILOT_PREFIX)) return null;
    if (data.length > MAX_POSTBACK_LENGTH) return invalidPostback();
    route = data.slice(PILOT_PREFIX.length);
    if (!/^[a-z]+(?::[a-z]+){0,3}$/.test(route) || !ROUTES.has(route)) return invalidPostback();
  } else {
    return null;
  }
  const state = ROUTES.get(route);
  if (state.flow === 'home') return home(account);
  if (state.flow === 'owner') return ownerPage(route, state);
  return flowPage(route, state);
}

/**
 * Build a welcome reply without handling follow events or sending anything.
 * The caller may enable this only after independently confirming that the
 * native welcome has been disabled; this builder does not assert that state.
 */
export function buildWelcomeReply(options = { account: '@604gpqef' }) {
  const account = resolveAccount(options);
  if (!account) return null;
  return {
    messages: [
      {
        type: 'text',
        text: welcomeContent.buildWelcomeText(account),
      },
      ...home(account).messages,
    ],
    route: 'welcome',
    state: { flow: 'home', step: 'welcome' },
  };
}
