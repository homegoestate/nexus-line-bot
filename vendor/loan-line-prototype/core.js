(function (root) {
  'use strict';
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const colors = { identity: '#167D8D', income: '#B8692B', closing: '#72539C' };
  const sources = { checkedOn: '2026-10-06', workflowUpdatedOn: '2026-10-06', workflowEvidence: 'Sentinel_f5d309ea63708191a1b5167236d7e520', urls: ['https://service.ctbcbank.com/FAQ/Page01?kmid=4679', 'https://bank.sinopac.com/sinopacBT/webevents/mortgage/index.html'] };
  const doc = (id, group, title, note, tone = 'identity', stage = 'initial', responsibility = 'customer') => Object.freeze({ id, group, title, note, color: colors[tone], stage, responsibility });
  const catalog = Object.freeze([
    doc('A01', '公司承辦提供', '借款人身分證明', '由公司承辦提供給銀行，不要求客戶再提供；實際送件須另確認。', 'identity', 'company', 'company'),
    doc('A02', '基本身分', '銀行指定第二證件', '只有銀行要求才列入；證件種類待銀行確認。'),
    doc('A03', '基本身分', '戶籍／家庭關係資料', '依銀行需求提供；不預設要求記事完整戶籍。'),
    doc('A04', '財力分類', '所得或收入證明', '分類標題，不重複計為另一項文件；以實際收入分支顯示。', 'income', 'category', 'category'),
    doc('A05', '財力', '工作／投保證明', '只有銀行要求才列入；文件種類待銀行確認。', 'income'),
    doc('A06', '公司承辦提供', '本次房地資料', '由公司承辦提供給銀行，不要求客戶再提供；實際送件須另確認。', 'identity', 'company', 'company'),
    doc('A07', '公司承辦提供', '買賣契約', '購屋個案由公司承辦提供給銀行；責任歸屬不代表已送件。', 'identity', 'company', 'company'),
    doc('A08', '轉貸', '原貸繳息／還款資料', '轉貸個案適用；期間與格式待銀行確認。'),
    doc('A11', '依參與角色', '共同借款人資料', '僅有共同借款人且銀行要求時出現；不預設配偶角色。'),
    doc('A12', '依參與角色', '保證人資料', '僅實際需要且承辦確認時出現；不預設保證人或配偶保證人。'),
    doc('A13', '依參與角色', '抵押物提供人資料', '僅有該角色且銀行要求時出現。'),
    doc('A14', '補充資產分類', '其他資產佐證', '分類標題；存款、定存、股票、基金、保單按需選取，非全部交。', 'income', 'category', 'category'),
    doc('I01', '薪資收入', '薪資收入佐證', '薪轉、薪資單、扣繳、所得等依銀行指定；非通用任意擇一。', 'income'),
    doc('I02', '現金領薪', '現金領薪佐證', '薪資、雇主或其他替代佐證由銀行確認；不預設單一通用文件。', 'income'),
    doc('I03', '自營收入', '自營收入佐證', '401／403／405依適用稅制配置，非全部繳交；期間待銀行確認。', 'income'),
    doc('T401', '自營收入・已確認適用表單', '401 自營收入佐證', '僅在承辦確認適用此表單時配置，不同時要求403／405；期間待銀行確認。', 'income'),
    doc('T403', '自營收入・已確認適用表單', '403 自營收入佐證', '僅在承辦確認適用此表單時配置，不同時要求401／405；期間待銀行確認。', 'income'),
    doc('T405', '自營收入・已確認適用表單', '405 自營收入佐證', '僅在承辦確認適用此表單時配置，不同時要求401／403；期間待銀行確認。', 'income'),
    doc('I04', '專業接案', '專業／接案收入佐證', '報酬、扣繳、所得或契約等由銀行確認所需組合與期間。', 'income'),
    doc('I05', '退休收入', '退休金收入佐證', '退休金可依銀行要求作適用收入佐證；替代證明待確認。', 'income'),
    doc('I06', '租金收入', '租約與入帳佐證', '租金收入依銀行需求提供租約及入帳佐證；期間待確認。', 'income'),
    doc('I07', '混合收入分類', '混合收入整理', '分類標題；以實際薪資、租金等收入分支顯示，不重複計一項。', 'income', 'category', 'category'),
    doc('S01', '按需補充資產', '存款佐證', '僅承辦確認此個案需要時選取；不在此頁輸入金額或帳號。', 'income', 'supplemental'),
    doc('S02', '按需補充資產', '定存佐證', '僅承辦確認此個案需要時選取；期間與格式由銀行確認。', 'income', 'supplemental'),
    doc('S03', '按需補充資產', '股票資產佐證', '按需補充，非每人必交；提供管道由承辦銀行確認。', 'income', 'supplemental'),
    doc('S04', '按需補充資產', '基金資產佐證', '按需補充，非每人必交；提供管道由承辦銀行確認。', 'income', 'supplemental'),
    doc('S05', '按需補充資產', '保單資產佐證', '僅按需作資產佐證，不代表須購買房貸壽險。', 'income', 'supplemental'),
    doc('C01', '後段通知', '用印／電子簽約', '依銀行通知辦理；印章自備方式依通知，不預設代刻授權。', 'closing', 'closing'),
    doc('C02', '後段通知', '設定正本契約', '設定階段依銀行及承辦通知辦理，不算初次缺件。', 'closing', 'closing'),
    doc('C03', '後段通知', '撥款／還款帳戶確認', '透過銀行正式管道確認；此原型不輸入或保存帳號。', 'closing', 'closing'),
    doc('C04', '後段通知', '原抵押塗銷資料', '僅涉及原抵押塗銷時適用，依個案通知。', 'closing', 'closing'),
    doc('C05', '後段通知', '火險／地震險安排', '依銀行及個案通知辦理；房貸壽險不列普遍必需。', 'closing', 'closing')
  ]);
  const byId = new Map(catalog.map(x => [x.id, x]));
  const customerCatalog = Object.freeze(catalog.filter(d => d.responsibility === 'customer'));
  const companyCatalog = Object.freeze(catalog.filter(d => d.responsibility === 'company'));
  const actions = ['report', 'unreport', 'requestNotApplicable', 'withdrawNotApplicable', 'verify', 'unverify', 'approveNotApplicable', 'rejectNotApplicable', 'applicable', 'companySubmit', 'companyUnsubmit'];
  const customerActions = actions.slice(0, 4);
  const validId = x => typeof x === 'string' && ID.test(x);
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const keysAre = (x, keys) => plain(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
  const copy = x => JSON.parse(JSON.stringify(x));
  function resolveItems(config = {}) {
    if (!plain(config) || Object.keys(config).some(k => !['purpose', 'incomes', 'bankRequired', 'bankConfirmed', 'assets', 'closing', 'taxForm'].includes(k))) throw Error('invalid configuration');
    const { purpose = 'purchase', incomes = ['salary'], bankRequired = [], bankConfirmed = false, assets = [], closing = [], taxForm = null } = config;
    const branches = { salary: 'I01', cash: 'I02', self: 'I03', professional: 'I04', retired: 'I05', rental: 'I06' };
    if (!['purchase', 'refinance', 'other'].includes(purpose) || !Array.isArray(incomes) || incomes.length < 1 || incomes.some(i => !Object.hasOwn(branches, i)) || new Set(incomes).size !== incomes.length || !Array.isArray(bankRequired) || bankRequired.some(i => !['A02', 'A03', 'A05', 'A08', 'A11', 'A12', 'A13'].includes(i)) || !Array.isArray(assets) || assets.some(i => !['S01', 'S02', 'S03', 'S04', 'S05'].includes(i)) || !Array.isArray(closing) || closing.some(i => !['C01', 'C02', 'C03', 'C04', 'C05'].includes(i)) || typeof bankConfirmed !== 'boolean' || ![null,'401','403','405'].includes(taxForm) || (taxForm !== null && !incomes.includes('self')) || ((bankRequired.length + assets.length + closing.length > 0 || taxForm !== null) && !bankConfirmed)) throw Error('invalid configuration');
    return [...new Set([...incomes.map(i => i === 'self' && taxForm !== null ? 'T'+taxForm : branches[i]), ...bankRequired, ...assets, ...closing])];
  }
  function resolveCompanyItems(purpose = 'purchase') {
    if (!['purchase', 'refinance', 'other'].includes(purpose)) throw Error('invalid purpose');
    return ['A01', 'A06', ...(purpose === 'purchase' ? ['A07'] : [])];
  }
  function createState(caseId = 'case_demo', userId = 'user_demo', items = resolveItems(), companyItems = resolveCompanyItems()) {
    if (!validId(caseId) || !validId(userId) || !Array.isArray(items) || items.length < 1 || items.length > customerCatalog.length || new Set(items).size !== items.length || items.some(id => !byId.has(id) || byId.get(id).responsibility !== 'customer') || !Array.isArray(companyItems) || companyItems.length > companyCatalog.length || new Set(companyItems).size !== companyItems.length || companyItems.some(id => !byId.has(id) || byId.get(id).responsibility !== 'company')) throw Error('invalid state input');
    return { caseId, userId, version: 1, items: items.map(id => ({ id, reported: false, verified: false, applicable: true, notApplicableRequested: false })), companyItems: companyItems.map(id => ({ id, submitted: false })), events: [] };
  }
  function validState(s) {
    return keysAre(s, ['caseId', 'userId', 'version', 'items', 'companyItems', 'events']) && validId(s.caseId) && validId(s.userId) && Number.isSafeInteger(s.version) && s.version >= 1 && Array.isArray(s.items) && s.items.length > 0 && s.items.length <= customerCatalog.length && new Set(s.items.map(i => i && i.id)).size === s.items.length && s.items.every(i => keysAre(i, ['id', 'reported', 'verified', 'applicable', 'notApplicableRequested']) && byId.has(i.id) && byId.get(i.id).responsibility === 'customer' && ['reported', 'verified', 'applicable', 'notApplicableRequested'].every(k => typeof i[k] === 'boolean') && (i.applicable || (!i.reported && !i.verified && !i.notApplicableRequested))) && Array.isArray(s.companyItems) && s.companyItems.length <= companyCatalog.length && new Set(s.companyItems.map(i => i && i.id)).size === s.companyItems.length && s.companyItems.every(i => keysAre(i, ['id', 'submitted']) && byId.has(i.id) && byId.get(i.id).responsibility === 'company' && typeof i.submitted === 'boolean') && Array.isArray(s.events) && new Set(s.events).size === s.events.length && s.events.every(validId);
  }
  function validEvent(e) {
    return keysAre(e, ['eventId', 'caseId', 'itemId', 'version', 'action']) && validId(e.eventId) && validId(e.caseId) && validId(e.itemId) && Number.isSafeInteger(e.version) && e.version >= 1 && actions.includes(e.action);
  }
  function transition(state, event, principal) {
    const fail = code => ({ state, code, changed: false });
    if (!validState(state)) return fail('INVALID_STATE');
    if (!principal || principal.authenticated !== true || !validId(principal.userId) || !Array.isArray(principal.caseIds) || !principal.caseIds.every(validId) || !principal.caseIds.includes(state.caseId)) return fail('AUTH_REQUIRED');
    if (!validEvent(event)) return fail('INVALID_INPUT');
    if (event.caseId !== state.caseId) return fail('CASE_MISMATCH');
    if (!['customer', 'staff'].includes(principal.role) || principal.role === 'customer' && principal.userId !== state.userId) return fail('USER_MISMATCH');
    if (!customerActions.includes(event.action) && principal.role !== 'staff') return fail('STAFF_REQUIRED');
    if (customerActions.includes(event.action) && principal.role !== 'customer') return fail('CUSTOMER_REQUIRED');
    if (state.events.includes(event.eventId)) return fail('DUPLICATE_EVENT');
    if (event.version !== state.version) return fail('STALE_VERSION');
    if (['companySubmit', 'companyUnsubmit'].includes(event.action)) {
      if (!state.companyItems.some(i => i.id === event.itemId)) return fail('UNKNOWN_COMPANY_ITEM');
      if (state.version === Number.MAX_SAFE_INTEGER) return fail('VERSION_EXHAUSTED');
      const next = copy(state);
      next.companyItems.find(i => i.id === event.itemId).submitted = event.action === 'companySubmit';
      next.version++; next.events.push(event.eventId);
      return { state: next, code: 'UPDATED', changed: true };
    }
    if (state.companyItems.some(i => i.id === event.itemId)) return fail('COMPANY_ITEM');
    const item = state.items.find(x => x.id === event.itemId);
    if (!item) return fail('UNKNOWN_ITEM');
    if (event.action !== 'applicable' && !item.applicable) return fail('NOT_APPLICABLE');
    if (['approveNotApplicable', 'rejectNotApplicable', 'withdrawNotApplicable'].includes(event.action) && !item.notApplicableRequested) return fail('NO_PENDING_REQUEST');
    if (state.version === Number.MAX_SAFE_INTEGER) return fail('VERSION_EXHAUSTED');
    const next = copy(state), n = next.items.find(x => x.id === event.itemId);
    if (event.action === 'report') n.reported = true;
    if (event.action === 'unreport') n.reported = false;
    if (event.action === 'verify') n.verified = true;
    if (event.action === 'unverify') n.verified = false;
    if (event.action === 'requestNotApplicable') n.notApplicableRequested = true;
    if (['withdrawNotApplicable', 'rejectNotApplicable'].includes(event.action)) n.notApplicableRequested = false;
    if (event.action === 'approveNotApplicable') { n.applicable = false; n.reported = false; n.verified = false; n.notApplicableRequested = false; }
    if (event.action === 'applicable') n.applicable = true;
    next.version++; next.events.push(event.eventId);
    return { state: next, code: 'UPDATED', changed: true };
  }
  function status(item) {
    if (!item.applicable) return '不適用（承辦已核定）';
    if (item.verified) return '承辦已核對';
    return item.reported ? '已提供（您自行標記）／專員尚未確認' : '尚待提供／專員尚未確認';
  }
  function progress(state) {
    if (!validState(state)) throw Error('invalid state');
    const initial = state.items.filter(i => i.applicable && byId.get(i.id).stage === 'initial');
    return { total: initial.length, reported: initial.filter(i => i.reported).length, verified: initial.filter(i => i.verified).length, pending: initial.filter(i => !i.reported && !i.verified).length };
  }
  function postback(state, item, action) {
    if (!validState(state) || !item || !state.items.some(i => i.id === item.id) || !actions.includes(action)) throw Error('invalid postback input');
    const data = new URLSearchParams({ c: state.caseId, i: item.id, a: action, v: String(state.version) }).toString();
    if (data.length > 300) throw Error('postback too long');
    return data;
  }
  function parsePostback(data, eventId) {
    if (typeof data !== 'string' || data.length > 300 || data.length === 0) throw Error('invalid postback');
    const p = new URLSearchParams(data);
    if ([...p.keys()].length !== 4 || ['c', 'i', 'a', 'v'].some(k => p.getAll(k).length !== 1) || !/^[1-9][0-9]*$/.test(p.get('v') || '')) throw Error('invalid postback');
    const e = { caseId: p.get('c'), itemId: p.get('i'), action: p.get('a'), version: Number(p.get('v')), eventId };
    if (!validEvent(e)) throw Error('invalid postback');
    return e;
  }
  function flex(state) {
    if (!validState(state)) throw Error('invalid state');
    const pages = [], perPage = 4, pageCount = Math.ceil(state.items.length / perPage);
    const text = (value, props = {}) => ({ type: 'text', text: value, wrap: true, ...props });
    for (let offset = 0; offset < state.items.length; offset += perPage) {
      const rows = state.items.slice(offset, offset + perPage).map(item => {
        const d = byId.get(item.id), contents = [text(d.id + ' ' + d.title, { weight: 'bold', size: 'sm', color: d.color }), text(d.group + (d.stage === 'closing' ? ' · 後段通知，不算初次缺件' : d.stage === 'supplemental' ? ' · 補充選用' : ''), { size: 'xs', color: '#586E75' }), text(status(item), { size: 'sm' })];
        if (item.notApplicableRequested) contents.push(text('已申請不適用／待承辦核定；仍列適用清單', { size: 'xs', color: '#72539C' }));
        if (item.applicable) {
          contents.push({ type: 'button', height: 'sm', action: { type: 'postback', label: item.reported ? '改為待提供' : '我已提供', data: postback(state, item, item.reported ? 'unreport' : 'report') } });
          contents.push({ type: 'button', height: 'sm', action: { type: 'postback', label: item.notApplicableRequested ? '撤回不適用申請' : '申請不適用', data: postback(state, item, item.notApplicableRequested ? 'withdrawNotApplicable' : 'requestNotApplicable') } });
        }
        return { type: 'box', layout: 'vertical', margin: 'lg', contents };
      });
      const bubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [text('房貸財力資料 · v' + state.version + ' · ' + (offset / perPage + 1) + '/' + pageCount, { weight: 'bold' }), ...rows, text('自報不等於承辦收件確認，實際依承辦銀行要求', { size: 'xs', margin: 'lg' })] } };
      if (new TextEncoder().encode(JSON.stringify(bubble)).length > 30000) throw Error('bubble too long');
      pages.push(bubble);
    }
    const message = { type: 'flex', altText: '房貸財力資料進度更新，請查看最新適用清單', contents: pages.length === 1 ? pages[0] : { type: 'carousel', contents: pages } };
    if (pages.length > 12 || message.altText.length > 400 || new TextEncoder().encode(JSON.stringify(message.contents)).length > 50000) throw Error('message too long');
    return message;
  }
  async function backend(state, event, verifyPrincipal) {
    const denied = { state, changed: false, code: 'AUTH_REQUIRED' };
    if (typeof verifyPrincipal !== 'function') return denied;
    try { return transition(state, event, await verifyPrincipal(event)); } catch { return denied; }
  }
  const api = { catalog, customerCatalog, companyCatalog, sources, resolveItems, resolveCompanyItems, createState, validState, transition, status, progress, postback, parsePostback, flex, backend };
  if (typeof module !== 'undefined') module.exports = api;
  root.LoanCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
