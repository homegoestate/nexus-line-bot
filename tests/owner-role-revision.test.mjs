import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeGuide,routeNativeGuide,ROUTES,EXISTING_CONTENT_KEYWORDS,EXISTING_LOAN_KEYWORDS,LOAN_POLICY_SOURCE,PREFIX} from '../lib/native-chat-guide.mjs';
import config from '../lib/native-guide-config.js';
import theme from '../lib/brand-theme.js';
import {DOCUMENT_PREFIX,LEGACY_DOCUMENT_PREFIX} from '../lib/native-document-guide.mjs';
const text=r=>JSON.stringify(buildNativeGuide(r));
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);Object.values(n).forEach(c=>walk(c,fn));}
function cards(r){const c=buildNativeGuide(r).messages[0].contents;return c.type==='carousel'?c.contents:[c];}
const use='印鑑證明用途為不動產登記或不限定用途。';
const notice='交屋前，請依承辦通知核對應備資料與注意事項。';

test('buyer seal explanation and seller red warning remain role specific with original seller certificate rules',()=>{
  for(const r of ['buyer:step:2','buyer:detail:2','process:buyer']){
    assert.match(text(r),/買方已準備的銀行資料不重複交/);
    assert.match(text(r),/僅賣方需檢付印鑑章與印鑑證明/);
    assert.doesNotMatch(text(r),/不動產登記或不限定用途|公契立契日前一年/);
  }
  for(const r of ['seller:step:2','seller:detail:2','seller']){
    const nodes=cards(r)[0].body.contents,warning=nodes.find(n=>n.text===use);
    assert.deepEqual([warning.weight,warning.color],['bold',theme.warning]);
    assert.equal(nodes[3],warning);
    assert.doesNotMatch(text(r),/核對文件與印文/);
  }
  for(const s of ['依承辦通知準備印鑑章、印鑑證明','特殊核身方式另確認'])assert.ok(text('seller:step:2').includes(s));
  for(const s of ['公契立契日前一年以後','登載於其他欄','特殊身分或核身方式'])assert.ok(text('seller:detail:2').includes(s));
});
test('buyer handover deletion does not delete seller notice and preserves formal handover distinction',()=>{
  for(const r of ['buyer:step:8','buyer:detail:8','process:buyer'])assert.ok(!text(r).includes(notice));
  for(const r of ['seller:step:8','process:seller'])assert.ok(text(r).includes(notice));
  assert.match(text('seller:detail:8'),/交屋前核對應備資料與注意事項/);
  for(const role of ['buyer','seller'])for(const view of ['step','detail'])assert.match(text(`${role}:${view}:8`),/先前驗屋非正式交屋；依本案約定，交屋結案當天方為正式交屋/);
  assert.match(text('seller:step:8'),/依約搬遷交付，核對收款、鑰匙與設備點交及費用結算/);
});
test('seller payment wording describes company notification and contractual escrow without fabricated amounts or timing',()=>{
  for(const r of ['seller:step:4','seller:detail:4','process:seller']){
    const copy=text(r);
    assert.match(copy,/有履保者，由履保公司依約辦理款項撥付/);
    assert.match(copy,/依承辦通知，將本階段應繳款項匯入地政士指定帳戶/);
    assert.doesNotMatch(copy,/全額價款|全數價金|僅稅款|只限稅費|全部撥付|[0-9]{10,}/);
  }
  assert.match(text('seller:step:4'),/確認本案應負擔稅費與收款安排/);
});
test('all customer cards omit worksheet actions and retired old cards return income guidance on all three OAs',t=>{
  for(const r of ROUTES)walk(buildNativeGuide(r,{documentsEnabled:true}),n=>{
    if(n.type==='postback')assert.ok(!n.data.startsWith(DOCUMENT_PREFIX)&&!n.data.startsWith(LEGACY_DOCUMENT_PREFIX));
    if(n.type==='text')assert.doesNotMatch(n.text,/財力勾選清單|備件勾選|已自報交付/);
  });
  const base={mode:'active',source:{type:'user'},type:'message',message:{type:'text',text:'備件清單'}};
  for(const key of Object.keys(config.NATIVE_DOCUMENT_FLAGS)){
    for(const [flag,value] of [[config.NATIVE_DOCUMENT_FLAGS[key],'false'],[config.NATIVE_PUBLIC_FLAGS[key],'true']]){
      const old=process.env[flag];process.env[flag]=value;t.after(()=>old===undefined?delete process.env[flag]:process.env[flag]=old);
    }
    for(const e of [base,{...base,type:'postback',postback:{data:DOCUMENT_PREFIX+'old'}},{...base,type:'postback',postback:{data:LEGACY_DOCUMENT_PREFIX+'old'}}])assert.deepEqual(routeNativeGuide(e,'@'+key),buildNativeGuide('finance'));
  }
  for(const r of ['finance:salary','finance:business','finance:pension','finance:rental','finance:other'])assert.match(text(r),/請承辦協助.*預約諮詢/);
});
test('original document and loan keywords are exact pass-through actions with qualified current loan summary',t=>{
  assert.deepEqual(EXISTING_CONTENT_KEYWORDS,{natural:'簽約文件－自然人',company:'簽約文件－公司法人',qingan:'新青安'});
  assert.deepEqual(EXISTING_LOAN_KEYWORDS,{'@604gpqef':'貸款應備','@528scwxf':'新青安','@375umdzq':'新青安'});
  for(const [r,keywords] of [['documents:contract',['簽約文件－自然人','簽約文件－公司法人']],['finance:options',['新青安']]]){
    const actions=[];walk(buildNativeGuide(r),n=>{if(n.type==='message')actions.push(n.text);});
    for(const keyword of keywords)assert.ok(actions.includes(keyword));
  }
  for(const key of Object.keys(config.NATIVE_PUBLIC_FLAGS)){
    const flag=config.NATIVE_PUBLIC_FLAGS[key],old=process.env[flag];process.env[flag]='true';t.after(()=>old===undefined?delete process.env[flag]:process.env[flag]=old);
    const result=routeNativeGuide({type:'postback',mode:'active',source:{type:'user'},postback:{data:PREFIX+'finance:options'}},'@'+key),loanActions=[];
    walk(result,n=>{if(n.type==='message'&&n.label==='新青安3.0')loanActions.push(n.text);});assert.deepEqual(loanActions,[EXISTING_LOAN_KEYWORDS['@'+key]]);
    assert.equal(routeNativeGuide({type:'message',mode:'active',source:{type:'user'},message:{type:'text',text:loanActions[0]}},'@'+key),null);
    for(const keyword of [...Object.values(EXISTING_CONTENT_KEYWORDS),'預約諮詢'])assert.equal(routeNativeGuide({type:'message',mode:'active',source:{type:'user'},message:{type:'text',text:keyword}},'@'+key),null);
  }
  const loan=text('finance:options');for(const s of ['新婚家庭最高1,200','育有未成年子女家庭最高1,500','最長40年仍受年齡及核貸限制','前3年利息補貼後逐年調整','最高額度不是保證核貸'])assert.ok(loan.includes(s));
  assert.doesNotMatch(loan,/1\.775|固定40年|人人.*1,500/);assert.equal(LOAN_POLICY_SOURCE.verifiedOn,'2026-10-09');
});
test('blue teal and red text colors maintain contrast and fixed card surfaces under external LINE themes',()=>{
  const lum=hex=>{const rgb=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  for(const c of [theme.primary,theme.accent,theme.ink,theme.muted,theme.warning])for(const bg of [theme.white,theme.surface])assert.ok(contrast(c,bg)>=4.5,`${c}/${bg}`);
  for(const r of ROUTES)for(const card of cards(r)){
    assert.equal(card.styles.body.backgroundColor,theme.white);assert.equal(card.styles.footer.backgroundColor,theme.surface);
    assert.ok(card.footer.contents.length<=3);for(const n of card.footer.contents.filter(n=>n.style==='primary'))assert.ok(contrast(n.color,theme.white)>=4.5);
  }
});
