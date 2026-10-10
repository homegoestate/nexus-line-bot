// Offline review only: build the actual public Flex payloads without LINE/API IO.
// Usage: node scripts/service-guide-preview.mjs /absolute/output/directory
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../lib/native-guide-config.js';
import { routeEvent, buildWelcomeReply, TEXT_TRIGGERS, PILOT_PREFIX } from '../lib/flow-router.mjs';
import { ROUTES, buildNativeGuide } from '../lib/native-chat-guide.mjs';

const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw Error('Supply an absolute output directory');
fs.mkdirSync(output, { recursive: true });
const accounts = ['@604gpqef', '@528scwxf', '@375umdzq'];
for (const key of Object.keys(config.NATIVE_PUBLIC_FLAGS)) {
  process.env[config.NATIVE_PUBLIC_FLAGS[key]] = 'true';
  process.env[config.NATIVE_TEST_FLAGS[key]] = 'true';
  process.env[config.NATIVE_DOCUMENT_FLAGS[key]] = 'false';
}
function actions(value) {
  const out = [];
  function walk(x) {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'postback') out.push(x);
    Object.values(x).forEach(walk);
  }
  walk(value);
  return out;
}
const data = {};
for (const account of accounts) {
  const options = { account };
  const queue = Object.keys(TEXT_TRIGGERS).map(text => routeEvent({ type: 'message', mode: 'active', source: { type: 'user' }, message: { type: 'text', text } }, options));
  const views = { welcome: buildWelcomeReply(options) };
  while (queue.length) {
    const view = queue.shift();
    if (!view || views[view.route]) continue;
    views[view.route] = view;
    for (const action of actions(view)) {
      if (action.data.startsWith(PILOT_PREFIX)) queue.push(routeEvent({ type: 'postback', mode: 'active', source: { type: 'user' }, postback: { data: action.data } }, options));
    }
  }
  for (const route of ROUTES) views['native:' + route] = buildNativeGuide(route, options);
  data[account] = views;
}
fs.writeFileSync(path.join(output, 'payloads.json'), JSON.stringify(data, null, 2) + '\n');
const hashes = Object.fromEntries(accounts.map(account => [account, {
  welcomeTextSha256: crypto.createHash('sha256').update(data[account].welcome.messages[0].text).digest('hex'),
  welcomeMenuSha256: crypto.createHash('sha256').update(JSON.stringify(data[account].welcome.messages[1])).digest('hex'),
  nativeGuideContentSha256: crypto.createHash('sha256').update(JSON.stringify(data[account]['native:home'].messages)).digest('hex'),
  officialServiceContentSha256: crypto.createHash('sha256').update(JSON.stringify(data[account]['native:services'].messages)).digest('hex'),
  processOverviewContentSha256: crypto.createHash('sha256').update(JSON.stringify(data[account]['native:process'].messages)).digest('hex'),
}]));
fs.writeFileSync(path.join(output, 'expected-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
const serialized = JSON.stringify(data).replace(/</g, '\\u003c');
fs.writeFileSync(path.join(output, 'preview.html'), `<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>服務導覽卡片預覽</title><style>
*{box-sizing:border-box}body{margin:0;color:#203C51;background:#e7eff4;font-family:Arial,"Noto Sans CJK TC",sans-serif}header{background:#124F7A;color:white;padding:12px 16px}header strong{display:block;font-size:18px}header small{display:block;margin-top:6px;line-height:1.5}nav{padding:12px;display:flex;gap:8px;flex-wrap:wrap}select{max-width:100%;min-width:0;height:40px;border:1px solid #D6E7EE;border-radius:6px;background:white;padding:6px}#route{flex:1}main{padding:0 0 20px}p.greeting{margin:8px 16px 16px;padding:14px;border-radius:8px;background:white;font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.carousel{display:flex;align-items:flex-start;gap:10px;padding:4px 16px 10px;overflow-x:auto;width:100%;scroll-snap-type:x mandatory}.card{width:320px;max-width:calc(100vw - 32px);flex:0 0 auto;border-radius:12px;overflow:hidden;background:white;scroll-snap-align:start;border:1px solid #D6E7EE}.box{display:flex;min-width:0;flex-direction:column}.button{display:flex;align-items:center;justify-content:center;width:100%;min-height:40px;flex-shrink:0;border:0;border-radius:6px;font-family:inherit;font-size:14px;font-weight:600;padding:8px 4px;white-space:nowrap;background:#e3edf2;color:#124F7A;cursor:pointer}.txt{margin:0;min-width:0;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.separator{height:1px;width:100%;flex-shrink:0}.quick{display:flex;gap:8px;padding:0 16px;overflow-x:auto;max-width:100%;margin-top:8px}.quick .button{width:auto;flex:0 0 auto;padding:8px 12px}.status{margin:0 16px 12px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
</style><header><strong>服務導覽卡片預覽</strong><small>程式 Flex 模擬預覽，未連線 LINE。實際原生回覆與建案 fallback 需於非客戶聊天確認。</small></header><nav><select id="account"><option>@604gpqef</option><option>@528scwxf</option><option>@375umdzq</option></select><select id="route"></select></nav><p class="status" id="status"></p><main id="chat"></main><script>
const data=${serialized};
const account=document.getElementById('account'), route=document.getElementById('route'), chat=document.getElementById('chat'), status=document.getElementById('status');
const sizes={xxs:10,xs:12,sm:14,md:16,lg:18,xl:22,xxl:26};
const spacing={none:0,xs:2,sm:4,md:8,lg:16,xl:20,xxl:24};
function action(a){if(a.type==='postback'){const next=a.data.startsWith('hgpilot:v1:')?a.data.slice(11):'native:'+a.data.slice(10);if(data[account.value][next])show(next);return;}if(a.type==='message'&&a.text==='宏國服務體驗'){show('home');return;}status.textContent=a.type==='message'?'原文字動作：'+a.text+'\\n此預覽不送訊息。':'原登錄 URI：'+a.uri+'\\n此預覽不開啟正式表單。';}
function element(n){let e;
 if(n.type==='text'){e=document.createElement('p');e.className='txt';e.textContent=n.text;e.style.fontSize=(sizes[n.size]||16)+'px';e.style.color=n.color||'#203C51';e.style.fontWeight=n.weight==='bold'?'700':'400';if(n.align)e.style.textAlign=n.align;}
 else if(n.type==='separator'){e=document.createElement('div');e.className='separator';e.style.backgroundColor=n.color||'#D6E7EE';}
 else if(n.type==='button'){e=document.createElement('button');e.className='button';e.textContent=n.action.label;e.dataset.action=n.action.type;e.onclick=()=>action(n.action);if(n.style==='primary'){e.style.backgroundColor=n.color||'#124F7A';e.style.color='white';}}
 else {e=document.createElement('div');e.className='box';e.style.gap=(spacing[n.spacing]||0)+'px';if(n.layout==='horizontal'||n.layout==='baseline')e.style.flexDirection='row';(n.contents||[]).forEach(c=>e.append(element(c)));}
 if(n.flex!==undefined)e.style.flex=n.flex===0?'0 0 auto':n.flex+' 1 0%';if(n.margin)e.style.marginTop=(spacing[n.margin]||0)+'px';if(n.paddingAll)e.style.padding=n.paddingAll;return e;
}
function card(n){const e=document.createElement('section');e.className='card';for(const k of ['header','body','footer'])if(n[k]){const part=element(n[k]);part.dataset.section=k;part.style.padding=n[k].paddingAll||'16px';part.style.backgroundColor=n.styles?.[k]?.backgroundColor||'white';e.append(part);}return e;}
function show(name){route.value=name;status.textContent='';chat.replaceChildren();const output=data[account.value][name];for(const msg of output.messages){if(msg.type==='text'){const p=document.createElement('p');p.className='greeting';p.textContent=msg.text;chat.append(p);continue;}const c=document.createElement('div');c.className='carousel';const cards=msg.contents.type==='carousel'?msg.contents.contents:[msg.contents];cards.forEach(n=>c.append(card(n)));chat.append(c);if(msg.quickReply){const q=document.createElement('div');q.className='quick';msg.quickReply.items.forEach(i=>{const b=element({type:'button',action:i.action});q.append(b);});chat.append(q);}}window.currentView={account:account.value,route:name};}
function selectAccount(){route.replaceChildren();for(const key of Object.keys(data[account.value])){const o=document.createElement('option');o.value=key;o.textContent=key==='welcome'?'歡迎入口':key;route.append(o);}show('welcome');}
account.onchange=selectAccount;route.onchange=()=>show(route.value);window.previewData=data;window.showView=show;selectAccount();
</script></html>`);
console.log(JSON.stringify({ output, accounts: accounts.length, viewsPerAccount: Object.keys(data[accounts[0]]).length }));
