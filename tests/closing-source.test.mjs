import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeGuide, routeNativeGuide, ROUTES, PREFIX, CLOSING_SOURCE } from '../lib/native-chat-guide.mjs';
import config from '../lib/native-guide-config.js';
const walk=(node,fn)=>{if(!node||typeof node!=='object')return;fn(node);Object.values(node).forEach(child=>walk(child,fn));};
const event={type:'message',mode:'active',source:{type:'user'},message:{type:'text',text:''}};

test('verified general closing reminders contain real content and use only native postbacks with no message self-loop',()=>{
  assert.equal(CLOSING_SOURCE.responseId,'81524093');assert.equal(CLOSING_SOURCE.keyword,'交屋');assert.equal(CLOSING_SOURCE.roleSpecificChecklistsVerified,false);
  for(const route of ROUTES)walk(buildNativeGuide(route),node=>{if(node.type==='button'||node.type==='action')assert.equal(node.action.type,'postback');assert.notEqual(node.type,'message');});
  const copy=JSON.stringify(buildNativeGuide('closing:inspection'))+JSON.stringify(buildNativeGuide('closing:warranty'));
  for(const text of ['水電瓦斯是否正常','設備是否可使用','管理費是否分算','鑰匙、磁扣、遙控器是否交接','保固範圍是哪些地方','保固期間多久','修繕費用由誰負擔'])assert.ok(copy.includes(text),text);
  assert.doesNotMatch(copy,/請開啟原有|既有入口|尚未接線|原清單|已圓滿完成|已於稍早正式匯出|買方交屋清單|賣方交屋清單/);
  assert.equal(ROUTES.includes('closing:buyer'),false);assert.equal(ROUTES.includes('closing:seller'),false);
  for(const old of ['closing:buyer','closing:seller'])assert.deepEqual(buildNativeGuide(old),buildNativeGuide('closing'));
});

test('a missing source shows only handler guidance and never exposes an empty checklist or unverified action',()=>{
  for(const route of ['closing','closing:inspection','closing:warranty','closing:buyer','closing:seller']){
    const result=buildNativeGuide(route,{closingSourceAvailable:false});
    assert.equal(result.messages[0].contents.type,'bubble');assert.match(JSON.stringify(result),/請依承辦通知核對本案/);
    assert.doesNotMatch(JSON.stringify(result),/□|買方交屋清單|賣方交屋清單|type":"message|closing:inspection|closing:warranty/);
    walk(result,node=>{if(node.type==='postback')assert.ok([PREFIX+'step:8',PREFIX+'home'].includes(node.data));});
  }
});

test('OA completion and disbursement keywords pass through and cannot mark a case complete',t=>{
  for(const account of ['@604gpqef','@528scwxf','@375umdzq']){
    const flag=config.NATIVE_PUBLIC_FLAGS[account.slice(1)],previous=process.env[flag];process.env[flag]='true';
    t.after(()=>{if(previous===undefined)delete process.env[flag];else process.env[flag]=previous;});
    for(const text of ['結案','退群','完成','履保出款','出款','撥款','交屋','點交','驗屋','查看買方交屋清單','查看賣方交屋清單'])assert.equal(routeNativeGuide({...event,message:{type:'text',text}},account),null,text);
  }
  for(const route of ROUTES)assert.doesNotMatch(JSON.stringify(buildNativeGuide(route)),/本案已圓滿完成|已於稍早正式匯出|已成功登錄|已成功過戶/);
});

test('company handles transfer and authorized repayment; tax card makes preparation trigger visible',()=>{
  assert.match(JSON.stringify(buildNativeGuide('step:4')),/依本公司一般流程，核貸／對保確認後通知備款/);
  assert.match(JSON.stringify(buildNativeGuide('process')),/由公司送地政辦理移轉/);
  assert.match(JSON.stringify(buildNativeGuide('detail:5')),/公司追蹤地政進度並通知雙方/);
  assert.match(JSON.stringify(buildNativeGuide('detail:6')),/公司與銀行依授權辦理代償/);
  assert.match(JSON.stringify(buildNativeGuide('step:6')),/搬遷後由仲介協調驗屋/);
  assert.match(JSON.stringify(buildNativeGuide('detail:6')),/3–5.*非保證期限/);
  assert.match(JSON.stringify(buildNativeGuide('detail:6')),/不代表可以提前入住、施工、正式交屋或履保提前付款/);
});
