"use strict";
// Apps Script mode: busy times come from a company-owned Apps Script web app; no Google keys on Vercel.
const test=require("node:test");
const assert=require("node:assert/strict");
const handler=require("../api/consult-availability.js");
const {appsScriptUrl}=handler._test;

const keys=["HG_BOOKING_APPS_SCRIPT_URL","HG_BOOKING_GOOGLE_CLIENT_EMAIL","HG_BOOKING_GOOGLE_PRIVATE_KEY","HG_BOOKING_COMPANY_CALENDAR",
 "HG_BOOKING_YICHENG_BUSY_CALENDARS","HG_BOOKING_MINGZONG_BUSY_CALENDARS","HG_BOOKING_YICHENG_HOURS_JSON","HG_BOOKING_MINGZONG_HOURS_JSON",
 "HG_BOOKING_HOURS_JSON","HG_BOOKING_SESSION_MINUTES","HG_BOOKING_GRID_MINUTES","HG_BOOKING_NOTICE_HOURS","HG_BOOKING_BUFFER_MINUTES"];
function backup(){const v=Object.fromEntries(keys.map(k=>[k,process.env[k]]));return()=>keys.forEach(k=>{if(v[k]===undefined)delete process.env[k];else process.env[k]=v[k];});}
function res(){const headers={};return{headers,statusCode:200,setHeader(k,v){headers[k]=v},end(v){this.body=v||""}};}
function nextMonday(){let t=Date.now()+8*3600000+2*86400000;while(new Date(t).getUTCDay()!==1)t+=86400000;return new Date(t).toISOString().slice(0,10);}
const URL_OK="https://script.google.com/macros/s/AKfycbTESTONLY_abcdefghijklmnopqrstuvwxyz0123/exec";
async function ask(advisor,day){const r=res();await handler({method:"GET",url:"/api/consult-availability?advisor="+advisor+"&days=1&from="+day,headers:{origin:"https://homegoestate.github.io"}},r);return r;}
function setup(){keys.forEach(k=>delete process.env[k]);process.env.HG_BOOKING_APPS_SCRIPT_URL=URL_OK;process.env.HG_BOOKING_NOTICE_HOURS="0";}

test("only script.google.com exec URLs are accepted",()=>{
 assert.equal(appsScriptUrl({HG_BOOKING_APPS_SCRIPT_URL:URL_OK}),URL_OK);
 assert.ok(appsScriptUrl({}).startsWith("https://script.google.com/macros/s/"),"company script is the default");
 assert.equal(appsScriptUrl({},true),"","other configured modes keep priority");
 assert.equal(appsScriptUrl({HG_BOOKING_APPS_SCRIPT_URL:"off"}),"");
 for(const bad of ["http://script.google.com/macros/s/AKfycbTESTONLY_abcdefghijklmn/exec","https://evil.example/macros/s/AKfycbTESTONLY_abcdefghijklmn/exec",
  "https://script.google.com/macros/s/AKfycbTESTONLY_abcdefghijklmn/dev"])assert.equal(appsScriptUrl({HG_BOOKING_APPS_SCRIPT_URL:bad}),null);
});

test("busy times from Apps Script remove slots; no Google keys needed",async()=>{
 const restore=backup(),original=global.fetch;
 try{
  setup();const day=nextMonday();const seen=[];
  global.fetch=async(url)=>{
   seen.push(url);
   assert.ok(url.startsWith(URL_OK+"?"));
   const q=new URL(url).searchParams;
   assert.equal(q.get("from"),day+"T00:00:00+08:00");
   return{ok:true,json:async()=>({ok:true,source:"apps-script",busy:q.get("advisor")==="ming-zong"
     ?[{start:day+"T01:00:00.000Z",end:day+"T02:00:00.000Z"}]  // 09:00–10:00 Taipei
     :[]})};
  };
  const mz=await ask("ming-zong",day);
  assert.equal(mz.statusCode,200);
  const body=JSON.parse(mz.body);
  assert.equal(body.source,"google-calendar-freebusy");
  assert.deepEqual(body.slots.map(s=>s.start.slice(11,16)),["10:00","10:30","11:00","14:00","14:30","15:00","15:30","16:00"]);
  assert.ok(!mz.body.includes("script.google.com"));
  assert.equal(JSON.parse((await ask("yi-cheng",day)).body).slots.length,10);
  assert.equal(new URL(seen[0]).searchParams.get("advisor"),"ming-zong");
 }finally{global.fetch=original;restore();}
});

test("leftover per-advisor calendar env without keys still uses the company script",async()=>{
 const restore=backup(),original=global.fetch;
 try{
  keys.forEach(k=>delete process.env[k]);process.env.HG_BOOKING_NOTICE_HOURS="0";
  process.env.HG_BOOKING_YICHENG_BUSY_CALENDARS="leftover@example.invalid";
  const day=nextMonday();const seen=[];
  global.fetch=async(url)=>{seen.push(url);return{ok:true,json:async()=>({ok:true,busy:[]})};};
  const r=await ask("yi-cheng",day);
  assert.equal(r.statusCode,200);
  assert.ok(seen[0].startsWith("https://script.google.com/macros/s/"));
 }finally{global.fetch=original;restore();}
});

test("Apps Script errors or bad data fail closed; bad URL is not configured",async()=>{
 const restore=backup(),original=global.fetch;
 try{
  setup();const day=nextMonday();
  for(const reply of [{ok:false,status:500},{ok:true,data:{ok:false,error:"calendar_unavailable"}},{ok:true,data:{ok:true}},
   {ok:true,data:{ok:true,busy:[{start:"x",end:day+"T02:00:00.000Z"}]}},
   {ok:true,data:{ok:true,busy:[{start:day+"T03:00:00.000Z",end:day+"T02:00:00.000Z"}]}}]){
   global.fetch=async()=>({ok:reply.ok,json:async()=>reply.data});
   const r=await ask("yi-cheng",day);
   assert.equal(r.statusCode,503);assert.deepEqual(JSON.parse(r.body),{error:"calendar_unavailable"});
  }
  global.fetch=async()=>{throw Error("network down")};
  assert.equal((await ask("yi-cheng",day)).statusCode,503);
  process.env.HG_BOOKING_APPS_SCRIPT_URL="https://evil.example/exec";
  global.fetch=async()=>{throw Error("must not call")};
  const r=await ask("yi-cheng",day);
  assert.equal(r.statusCode,503);assert.equal(JSON.parse(r.body).error,"calendar_not_configured");
 }finally{global.fetch=original;restore();}
});
