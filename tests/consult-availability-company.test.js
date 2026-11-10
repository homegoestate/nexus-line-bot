"use strict";
// Company-calendar mode: one shared calendar, busy time split by name tags in event titles.
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const handler=require("../api/consult-availability.js");
const {taggedBusyBlock,listedTags}=handler._test;

const keys=["HG_BOOKING_APPS_SCRIPT_URL","HG_BOOKING_GOOGLE_CLIENT_EMAIL","HG_BOOKING_GOOGLE_PRIVATE_KEY","HG_BOOKING_COMPANY_CALENDAR",
 "HG_BOOKING_YICHENG_BUSY_CALENDARS","HG_BOOKING_MINGZONG_BUSY_CALENDARS","HG_BOOKING_YICHENG_HOURS_JSON",
 "HG_BOOKING_MINGZONG_HOURS_JSON","HG_BOOKING_HOURS_JSON","HG_BOOKING_YICHENG_TAGS","HG_BOOKING_MINGZONG_TAGS",
 "HG_BOOKING_SESSION_MINUTES","HG_BOOKING_GRID_MINUTES","HG_BOOKING_NOTICE_HOURS","HG_BOOKING_BUFFER_MINUTES"];
function backup(){const v=Object.fromEntries(keys.map(k=>[k,process.env[k]]));return()=>keys.forEach(k=>{if(v[k]===undefined)delete process.env[k];else process.env[k]=v[k];});}
function res(){const headers={};return{headers,statusCode:200,setHeader(k,v){headers[k]=v},end(v){this.body=v||""}};}
// Next Monday (Taipei) at least 2 days away, so default weekday hours apply.
function nextMonday(){let t=Date.now()+8*3600000+2*86400000;while(new Date(t).getUTCDay()!==1)t+=86400000;return new Date(t).toISOString().slice(0,10);}
const at=(day,hm)=>day+"T"+hm+":00+08:00";
function addDays(day,n){return new Date(Date.parse(day+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);}

function setup(){
 const {privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
 keys.forEach(k=>delete process.env[k]);
 process.env.HG_BOOKING_GOOGLE_CLIENT_EMAIL="test-only@example.invalid";
 process.env.HG_BOOKING_GOOGLE_PRIVATE_KEY=privateKey.export({type:"pkcs8",format:"pem"});
 process.env.HG_BOOKING_COMPANY_CALENDAR="company@example.invalid";
 process.env.HG_BOOKING_NOTICE_HOURS="0";
}
function fakeGoogle(items,seen){
 return async(url)=>{
  if(url.includes("oauth2.googleapis.com"))return{ok:true,json:async()=>({access_token:"test-only"})};
  if(url.includes("/calendars/company%40example.invalid/events")){seen&&seen.push(url);return{ok:true,json:async()=>({items})};}
  throw Error("unexpected network call "+url);
 };
}
async function ask(advisor,day){
 const r=res();
 await handler({method:"GET",url:"/api/consult-availability?advisor="+advisor+"&days=1&from="+day,headers:{origin:"https://homegoestate.github.io"}},r);
 return r;
}

test("tag lists: defaults, overrides and bad values",()=>{
 assert.deepEqual(listedTags(undefined,["楊總","楊明宗"]),["楊總","楊明宗"]);
 assert.deepEqual(listedTags(" 翊晟 , 楊執行長 ",["x"]),["翊晟","楊執行長"]);
 assert.equal(listedTags("a",["x"]),null);
});

test("only the advisor's tagged events block; staff, untagged and free events do not",async()=>{
 const restore=backup(),original=global.fetch;
 try{
  setup();const day=nextMonday();
  const items=[
   {summary:"9:30地政節慶祝大會*楊總",start:{dateTime:at(day,"09:00")},end:{dateTime:at(day,"10:00")}},
   {summary:"10:00高雄分割指界*翊晟",start:{dateTime:at(day,"10:00")},end:{dateTime:at(day,"11:00")}},
   {summary:"10:00結案*宜婷",start:{dateTime:at(day,"14:00")},end:{dateTime:at(day,"17:00")}},
   // Untagged multi-day reminder must not wipe out the week.
   {summary:"6:00複習（講習預備）",start:{dateTime:at(addDays(day,-1),"18:00")},end:{dateTime:at(addDays(day,5),"19:00")}},
   // Tag only in description (參加人員) still counts.
   {summary:"線上上課",description:"參加人員:楊明宗",start:{dateTime:at(day,"16:00")},end:{dateTime:at(day,"17:00")}},
   // Free/transparent and cancelled tagged events never block.
   {summary:"楊總匯款提醒",transparency:"transparent",start:{date:day},end:{date:addDays(day,1)}},
   {summary:"取消的會*翊晟",status:"cancelled",start:{dateTime:at(day,"14:00")},end:{dateTime:at(day,"17:00")}}
  ];
  const seen=[];global.fetch=fakeGoogle(items,seen);
  const mz=await ask("ming-zong",day);
  assert.equal(mz.statusCode,200);
  const mzBody=JSON.parse(mz.body);
  assert.equal(mzBody.source,"google-calendar-freebusy");
  assert.deepEqual(mzBody.slots.map(s=>s.start.slice(11,16)),["10:00","10:30","11:00","14:00","14:30","15:00"]);
  const yc=JSON.parse((await ask("yi-cheng",day)).body);
  assert.deepEqual(yc.slots.map(s=>s.start.slice(11,16)),["09:00","11:00","14:00","14:30","15:00","15:30","16:00"]);
  // Event titles, descriptions and calendar ID never reach the caller.
  for(const word of ["楊總","翊晟","宜婷","company@example.invalid","參加人員"])assert.ok(!mz.body.includes(word));
  assert.ok(seen[0].includes("singleEvents=true"));
 }finally{global.fetch=original;restore();}
});

test("tagged all-day event blocks the whole Taipei day; weekends closed by default",async()=>{
 const restore=backup(),original=global.fetch;
 try{
  setup();const day=nextMonday();
  global.fetch=fakeGoogle([{summary:"楊總請假",start:{date:day},end:{date:addDays(day,1)}}]);
  assert.deepEqual(JSON.parse((await ask("ming-zong",day)).body).slots,[]);
  assert.ok(JSON.parse((await ask("yi-cheng",day)).body).slots.length>0);
  assert.deepEqual(JSON.parse((await ask("yi-cheng",addDays(day,-1))).body).slots,[]);
 }finally{global.fetch=original;restore();}
});

test("company mode fails closed on bad Google data, errors or missing credentials",async()=>{
 const restore=backup(),original=global.fetch;
 try{
  setup();const day=nextMonday();
  for(const items of [[{summary:"*翊晟",start:{dateTime:"bad"},end:{dateTime:at(day,"10:00")}}],
                      [{summary:"*翊晟",start:{dateTime:at(day,"11:00")},end:{dateTime:at(day,"10:00")}}],
                      [{summary:"*翊晟"}]]){
   global.fetch=fakeGoogle(items);
   const r=await ask("yi-cheng",day);
   assert.equal(r.statusCode,503);assert.deepEqual(JSON.parse(r.body),{error:"calendar_unavailable"});
  }
  global.fetch=async(url)=>url.includes("oauth2")?{ok:true,json:async()=>({access_token:"t"})}:{ok:false};
  assert.equal((await ask("yi-cheng",day)).statusCode,503);
  delete process.env.HG_BOOKING_GOOGLE_PRIVATE_KEY;
  process.env.HG_BOOKING_APPS_SCRIPT_URL="off";  // without keys the default script would take over
  const r=await ask("yi-cheng",day);
  assert.equal(r.statusCode,503);assert.equal(JSON.parse(r.body).error,"calendar_not_configured");
 }finally{global.fetch=original;restore();}
});

test("company mode requests the read-only events scope",()=>{
 const {privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
 const jwt=handler._test.serviceJwt("a@example.invalid",privateKey,1,"https://www.googleapis.com/auth/calendar.events.readonly");
 const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
 assert.equal(claims.scope,"https://www.googleapis.com/auth/calendar.events.readonly");
 assert.equal(taggedBusyBlock({summary:"x"},["翊晟"]),null);
});
