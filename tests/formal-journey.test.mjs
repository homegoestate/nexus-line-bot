import test from 'node:test';
import assert from 'node:assert/strict';
import dispatch from '../lib/pilot-dispatch.js';
import accounts from '../lib/service-accounts.js';
import config from '../lib/native-guide-config.js';
import { PREFIX, buildNativeGuide } from '../lib/native-chat-guide.mjs';
import { encodeSnapshot, initialSnapshot, parseSnapshot, summarizeSnapshot } from '../lib/native-document-guide.mjs';
const event = {type:'message',mode:'active',replyToken:'offline-only',source:{type:'user'},message:{type:'text',text:'服務導覽'}};
function actions(value) { const out=[]; function walk(x) { if(!x||typeof x!=='object')return; if(['postback','message'].includes(x.type)&&x.label)out.push(x); Object.values(x).forEach(walk); } walk(value); return out; }
function enable(t,account) { for(const key of [account.enabledEnv,config.NATIVE_TEST_FLAGS[account.key],config.NATIVE_PUBLIC_FLAGS[account.key],config.NATIVE_DOCUMENT_FLAGS[account.key]].filter(Boolean)) { const old=process.env[key]; process.env[key]=key===config.NATIVE_DOCUMENT_FLAGS[account.key]?'false':'true'; t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;}); } }
test('formal private-chat journey reaches role stages, simple income and original document/contact keywords on three OAs', async t=>{
  for(const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
    enable(t,account);
    const route=e=>dispatch.getPilotReply(e,account.destination,{account:account.key});
    const click=data=>route({...event,type:'postback',postback:{data}});
    const home=await route(event); assert.equal(home.route,'native:home');
    const buyer=await click(actions(home).find(a=>a.label==='我是買方').data);
    const stages=await click(actions(buyer).find(a=>a.label==='買方八階段').data);
    assert.equal(stages.messages[0].contents.contents.length,8);
    const finance=await click(actions(buyer).find(a=>a.label==='貸款收入證明').data);
    const salary=await click(actions(finance).find(a=>a.label==='受薪').data);
    assert.match(JSON.stringify(salary),/交付與需求請直接向承辦確認/);
    assert.ok(actions(salary).every(a=>!a.data?.startsWith(PREFIX+'docs:')));
    const handoff=actions(salary).find(a=>a.label==='請承辦協助'); assert.deepEqual(handoff,{type:'message',label:'請承辦協助',text:'預約諮詢'});
    assert.equal(await route({...event,message:{type:'text',text:handoff.text}}),null);
    const contracts=await click(actions(buyer).find(a=>a.label==='簽約應備文件').data);
    for(const keyword of ['簽約文件－自然人','簽約文件－公司法人']){
      assert.ok(actions(contracts).some(a=>a.text===keyword));
      assert.equal(await route({...event,message:{type:'text',text:keyword}}),null);
    }
  }
});
test('buyer and seller eight-stage cards keep their own responsibilities and do not establish case progress',()=>{
  for(const role of ['buyer','seller']) {
    const output=buildNativeGuide('process:'+role), text=JSON.stringify(output);
    assert.equal(output.messages[0].contents.contents.length,8);
    assert.match(text,new RegExp(role==='buyer'?'買方｜':'賣方｜'));
    assert.doesNotMatch(text,new RegExp(role==='buyer'?'賣方｜':'買方｜'));
    assert.match(text,/不代表案件已送件或辦結/);
  }
});
test('formal additions preserve legacy OA keywords and keep snapshots private while public shared guides work', async t=>{
  for(const account of Object.values(accounts.SERVICE_ACCOUNTS)) {
    enable(t,account); const route=e=>dispatch.getPilotReply(e,account.destination,{account:account.key});
    for(const text of ['交易流程','買賣流程','買方備件','賣方備件','貸款收入證明','預約諮詢','過戶','結案','出款','撥款']) assert.equal(await route({...event,message:{type:'text',text}}),null,text);
    assert.equal((await route({...event,message:{type:'text',text:'備件清單'}})).route,'native:finance');
    for (const type of ['group', 'room']) {
      assert.equal((await route({...event,source:{type}})).route,'native:home');
      assert.equal(await route({...event,source:{type},message:{type:'text',text:'備件清單'}}),null);
      assert.equal(await route({...event,source:{type},type:'postback',postback:{data:'hgpilot:v1:owner'}}),null);
    }
    assert.equal(await route({...event,mode:'standby'}),null);
    assert.equal(await dispatch.getPilotReply(event,'wrong-destination',{account:account.key}),null);
  }
});
