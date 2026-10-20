"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const handler=require("../api/consult-availability.js");
const {parseDay,localDayMs,readOfferedHours,listedCalendars,makeSlots,formatTaipei}=handler._test;

function createRes(){
 const headers={};
 const res={headers,statusCode:200,setHeader(k,v){headers[k]=v;},end(v){this.body=v||"";}};
 return res;
}
function envBackup(keys){const values=Object.fromEntries(keys.map(k=>[k,process.env[k]]));return ()=>keys.forEach(k=>{if(values[k]===undefined)delete process.env[k];else process.env[k]=values[k];});}
const envKeys=["HG_BOOKING_GOOGLE_CLIENT_EMAIL","HG_BOOKING_GOOGLE_PRIVATE_KEY","HG_BOOKING_YICHENG_BUSY_CALENDARS","HG_BOOKING_YICHENG_HOURS_JSON","HG_BOOKING_SESSION_MINUTES","HG_BOOKING_GRID_MINUTES","HG_BOOKING_NOTICE_HOURS","HG_BOOKING_BUFFER_MINUTES"];
function tomorrow(){return new Date(Date.now()+8*3600000+86400000).toISOString().slice(0,10)}
function weekHours(){return Object.fromEntries([0,1,2,3,4,5,6].map(x=>[x,[["09:00","12:00"]]]))}
test("date input and offerings validation",()=>{
 assert.equal(parseDay("2026-02-30"),null);
 assert.equal(parseDay("2026-10-21"),Date.UTC(2026,9,21));
 assert.equal(localDayMs("2026-10-21"),Date.parse("2026-10-21T00:00:00+08:00"));
 assert.equal(readOfferedHours("{}"),null);
 assert.equal(readOfferedHours('{"1":[["10:00","09:00"]]}'),null);
 assert.equal(readOfferedHours('{"1":[["09:00","11:00"],["10:00","12:00"]]}'),null);
 assert.deepEqual(readOfferedHours('{"1":[["09:00","12:00"]]}')[1],[[540,720]]);
 assert.equal(listedCalendars("a@example.com,a@example.com"),null);
});
test("busy boundaries are filtered, not used as available times",()=>{
 const hours=readOfferedHours('{"3":[["09:00","12:00"]]}');
 const busy=[{start:"2026-10-21T09:30:00+08:00",end:"2026-10-21T10:30:00+08:00"}];
 const slots=makeSlots({day:"2026-10-21",days:1,hours,busy,now:Date.parse("2026-10-20T00:00:00+08:00"),duration:60,grid:30,noticeHours:0,buffer:0});
 assert.deepEqual(slots.map(x=>x.start),["2026-10-21T10:30:00+08:00","2026-10-21T11:00:00+08:00"]);
 assert.equal(formatTaipei(Date.parse("2026-10-21T11:00:00+08:00")),"2026-10-21T11:00:00+08:00");
});
test("GET fails closed without credentials, and refuses unknown advisor",async()=>{
 const restore=envBackup(envKeys);
 try{
  envKeys.forEach(k=>delete process.env[k]);
  const r=createRes();
  await handler({method:"GET",url:"/api/consult-availability?advisor=yi-cheng&from="+tomorrow(),headers:{origin:"https://homegoestate.github.io"}},r);
  assert.equal(r.statusCode,503);
  assert.equal(JSON.parse(r.body).error,"calendar_not_configured");
  const other=createRes();
  await handler({method:"GET",url:"/api/consult-availability?advisor=team&from="+tomorrow(),headers:{}},other);
  assert.equal(other.statusCode,400);
 }finally{restore();}
});
test("GET reports only freebusy-derived slots, never private event details",async()=>{
 const restore=envBackup(envKeys), original=global.fetch;
 const {privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
 const day=tomorrow();
 const busyWindow={start:day+"T09:30:00+08:00",end:day+"T10:30:00+08:00"};
 try{
  process.env.HG_BOOKING_GOOGLE_CLIENT_EMAIL="test-only@example.invalid";
  process.env.HG_BOOKING_GOOGLE_PRIVATE_KEY=privateKey.export({type:"pkcs8",format:"pem"});
  process.env.HG_BOOKING_YICHENG_BUSY_CALENDARS="consult-blocking@example.invalid,paid-consult@example.invalid";
  process.env.HG_BOOKING_YICHENG_HOURS_JSON=JSON.stringify(weekHours());
  process.env.HG_BOOKING_NOTICE_HOURS="0";
  process.env.HG_BOOKING_SESSION_MINUTES="60";
  process.env.HG_BOOKING_GRID_MINUTES="30";
  process.env.HG_BOOKING_BUFFER_MINUTES="0";
  global.fetch=async (url,options)=>{
   if(url.includes("oauth2.googleapis.com"))return{ok:true,json:async()=>({access_token:"only-testing"})};
   if(url.includes("calendar/v3/freeBusy")){
    const b=JSON.parse(options.body);
    assert.equal(b.items.length,2);
    return{ok:true,json:async()=>({calendars:{
      "consult-blocking@example.invalid":{busy:[busyWindow],errors:[]},
      "paid-consult@example.invalid":{busy:[],errors:[]}
    }})};
   }
   throw Error("unexpected network call");
  };
  const r=createRes();
  await handler({method:"GET",url:"/api/consult-availability?advisor=yi-cheng&days=1&from="+day,headers:{origin:"https://homegoestate.github.io"}},r);
  assert.equal(r.statusCode,200);
  assert.equal(r.headers["Cache-Control"],"no-store, max-age=0");
  const body=JSON.parse(r.body);
  assert.equal(body.source,"google-calendar-freebusy");
  assert.equal(body.advisor,"yi-cheng");
  assert.deepEqual(body.slots.map(x=>x.start),[day+"T10:30:00+08:00",day+"T11:00:00+08:00"]);
  assert.ok(!r.body.includes("consult-blocking@example.invalid"));
  assert.ok(!r.body.includes("paid-consult@example.invalid"));
 }finally{global.fetch=original;restore();}
});
