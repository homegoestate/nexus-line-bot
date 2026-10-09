import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../lib/native-guide-config.js';
import theme from '../lib/brand-theme.js';
import { routeEvent,buildWelcomeReply,PILOT_PREFIX } from '../lib/flow-router.mjs';
import {ROUTES,buildNativeGuide,PREFIX} from '../lib/native-chat-guide.mjs';
import {buildDocumentGuide} from '../lib/native-document-guide.mjs';
function walk(x,fn){if(!x||typeof x!=='object')return;fn(x);Object.values(x).forEach(y=>walk(y,fn));}
function env(t,name,value){const old=process.env[name];if(value===undefined)delete process.env[name];else process.env[name]=value;t.after(()=>{if(old===undefined)delete process.env[name];else process.env[name]=old;});}
function luminance(hex){const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];}
const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('shared customer palette has readable text contrast and no purple/gold/orange variants',()=>{
  for(const foreground of [theme.primary,theme.ink,theme.muted,theme.accent])assert.ok(ratio(foreground,theme.white)>=4.5);
  assert.ok(ratio(theme.white,theme.primary)>=4.5);
  const results=[...ROUTES.map(route=>buildNativeGuide(route)),...['choose','list','company','summary'].map(view=>buildDocumentGuide({incomes:63,reported:1,requested:4},view))];
  for(const output of results)walk(output,n=>{if(n.color)assert.ok(Object.values(theme).includes(n.color),n.color);if(n.backgroundColor)assert.ok(Object.values(theme).includes(n.backgroundColor),n.backgroundColor);});
});
test('main menu and three welcome replies expose formal entries only with their own native/public rollout flags',t=>{
  for(const key of Object.keys(config.NATIVE_PUBLIC_FLAGS)){env(t,config.NATIVE_PUBLIC_FLAGS[key],undefined);env(t,config.NATIVE_TEST_FLAGS[key],undefined);}
  const event={type:'postback',mode:'active',source:{type:'user'},postback:{data:PILOT_PREFIX+'home'}};
  for(const key of Object.keys(config.NATIVE_PUBLIC_FLAGS)){
    const account='@'+key,options={account};assert.equal(routeEvent(event,options).messages[0].contents.contents.length,2);
    process.env[config.NATIVE_PUBLIC_FLAGS[key]]='true';assert.equal(routeEvent(event,options).messages[0].contents.contents.length,2);
    process.env[config.NATIVE_TEST_FLAGS[key]]='true';
    for(const output of [routeEvent(event,options),buildWelcomeReply(options)]){
      const data=[];walk(output,n=>{if(n.type==='postback')data.push(n.data);});assert.ok(data.includes(PREFIX+'process'));assert.ok(data.includes(PREFIX+'finance'));assert.doesNotMatch(JSON.stringify(output),/測試服務導覽|測試導覽|虛構測試資料/);
    }
    for(const other of Object.keys(config.NATIVE_PUBLIC_FLAGS).filter(x=>x!==key))assert.equal(routeEvent(event,{account:'@'+other}).messages[0].contents.contents.length,2);
    delete process.env[config.NATIVE_PUBLIC_FLAGS[key]];delete process.env[config.NATIVE_TEST_FLAGS[key]];
  }
});
test('historical loan-document summaries also separate company materials from customer income proof',()=>{
  for(const stage of ['before','selected','existing']){
    const result=routeEvent({type:'postback',mode:'active',source:{type:'user'},postback:{data:PILOT_PREFIX+'loan:result:'+stage+':docs'}});
    assert.match(JSON.stringify(result),/銀行身分、房地與買賣契約資料由公司準備，不重複列為客戶備件/);
    assert.match(JSON.stringify(result),/貸款收入證明/);
  }
});
