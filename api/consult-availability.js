"use strict";

// Read-only availability API. No customer data, payment or calendar event writes.
// Production requires explicitly configured advisor calendar ACLs and offered hours.
const crypto = require("node:crypto");
const DAY = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;
const SCOPES = "https://www.googleapis.com/auth/calendar.events.freebusy";
const ADVISORS = {
  "yi-cheng": {calendarEnv:"HG_BOOKING_YICHENG_BUSY_CALENDARS", hoursEnv:"HG_BOOKING_YICHENG_HOURS_JSON"},
  "ming-zong": {calendarEnv:"HG_BOOKING_MINGZONG_BUSY_CALENDARS", hoursEnv:"HG_BOOKING_MINGZONG_HOURS_JSON"}
};
function isoDayUTC(ms) {return new Date(ms).toISOString().slice(0,10)}
function todayTaipei(now=Date.now()) {return isoDayUTC(now+TAIPEI_OFFSET)}
function parseDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day||""))return null;
  const time=Date.parse(day+"T00:00:00Z");
  return Number.isFinite(time)&&isoDayUTC(time)===day?time:null;
}
function localDayMs(day){const p=parseDay(day);return p===null?null:p-TAIPEI_OFFSET}
function minutes(hhmm) {
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hhmm||""))return null;
  return Number(hhmm.slice(0,2))*60+Number(hhmm.slice(3));
}
function readOfferedHours(json) {
  let data; try{data=JSON.parse(json||"")}catch(_){return null}
  if (!data||typeof data!=="object"||Array.isArray(data))return null;
  const result={}; let windows=0;
  for(let day=0;day<7;day++){
    const set=data[String(day)]||[];
    if(!Array.isArray(set)||set.length>4)return null;
    const cleaned=[];
    for(const range of set){
      if(!Array.isArray(range)||range.length!==2)return null;
      const from=minutes(range[0]),to=minutes(range[1]);
      if(from===null||to===null||to-from<30)return null;
      cleaned.push([from,to]);windows++;
    }
    cleaned.sort((a,b)=>a[0]-b[0]);
    for(let i=1;i<cleaned.length;i++)if(cleaned[i][0]<cleaned[i-1][1])return null;
    result[day]=cleaned;
  }
  return windows?result:null;
}
function listedCalendars(text){
  const list=String(text||"").split(",").map(x=>x.trim()).filter(Boolean);
  return list.length>0&&list.length<=10&&list.every(x=>x.length<=255)&&new Set(list).size===list.length?list:null;
}
function durationFromConfig(env){
  const val=Number(env.HG_BOOKING_SESSION_MINUTES||"60");
  return Number.isInteger(val)&&val>=30&&val<=180?val:null;
}
function gridFromConfig(env){
  const val=Number(env.HG_BOOKING_GRID_MINUTES||"30");
  return [15,30,60].includes(val)?val:null;
}
function noticeFromConfig(env){
  const val=Number(env.HG_BOOKING_NOTICE_HOURS||"24");
  return Number.isFinite(val)&&val>=0&&val<=168?val:null;
}
function bufferFromConfig(env){
  const val=Number(env.HG_BOOKING_BUFFER_MINUTES||"0");
  return Number.isInteger(val)&&val>=0&&val<=120?val:null;
}
function formatTaipei(ms) {
  // Taiwan (UTC+08:00) has no daylight-saving time.
  return new Date(ms+TAIPEI_OFFSET).toISOString().slice(0,19)+"+08:00";
}
function makeSlots({day,days,hours,busy,now=Date.now(),duration=60,grid=30,noticeHours=24,buffer=0}){
  const slots=[]; const origin=localDayMs(day);
  const earliest=now+noticeHours*3600000;
  for(let k=0;k<days;k++){
    const dateMidnight=origin+k*DAY;
    const dayNumber=new Date(dateMidnight+TAIPEI_OFFSET).getUTCDay();
    for(const [begin,end] of (hours[dayNumber]||[])){
      for(let m=begin;m+duration<=end;m+=grid){
        const start=dateMidnight+m*60000,finish=start+duration*60000;
        if(start<earliest)continue;
        if(busy.some(b=>Date.parse(b.start)<finish+buffer*60000 && Date.parse(b.end)>start-buffer*60000))continue;
        slots.push({start:formatTaipei(start),end:formatTaipei(finish)});
        if(slots.length>=120)return slots;
      }
    }
  }
  return slots;
}
function base64url(s){return Buffer.from(JSON.stringify(s)).toString("base64url")}
function serviceJwt(email,privateKey,now=Math.floor(Date.now()/1000)){
  const a=base64url({alg:"RS256",typ:"JWT"});
  const b=base64url({iss:email,scope:SCOPES,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500});
  const data=a+"."+b;
  const sign=crypto.createSign("RSA-SHA256");sign.update(data);sign.end();
  return data+"."+sign.sign(privateKey,"base64url");
}
async function getAccessToken(env,fetcher){
  const email=env.HG_BOOKING_GOOGLE_CLIENT_EMAIL;
  const key=String(env.HG_BOOKING_GOOGLE_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  if(!email||!key)throw new Error("calendar_credentials_missing");
  const jwt=serviceJwt(email,key);
  const body=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt});
  const response=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body.toString(),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error("google_oauth_unavailable");
  const value=await response.json();
  if(typeof value.access_token!=="string"||!value.access_token)throw new Error("google_oauth_missing_token");
  return value.access_token;
}
async function getBusy(env,ids,fromMs,toMs,fetcher){
  const token=await getAccessToken(env,fetcher);
  const req={
    timeMin:formatTaipei(fromMs),timeMax:formatTaipei(toMs),timeZone:"Asia/Taipei",
    items:ids.map(id=>({id}))
  };
  const response=await fetcher("https://www.googleapis.com/calendar/v3/freeBusy",{
    method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(req),signal:AbortSignal.timeout(9000)
  });
  if(!response.ok)throw new Error("google_freebusy_unavailable");
  const data=await response.json();
  if(!data||typeof data.calendars!=="object")throw new Error("calendar_response_invalid");
  const busy=[];
  for(const id of ids){
    const cal=data.calendars[id];
    if(!cal||!Array.isArray(cal.busy)||(cal.errors&&cal.errors.length))throw new Error("calendar_unreadable");
    for(const block of cal.busy){
      if(!block||!Number.isFinite(Date.parse(block.start))||!Number.isFinite(Date.parse(block.end)))throw new Error("calendar_busy_invalid");
      busy.push({start:block.start,end:block.end});
    }
  }
  return busy;
}
function json(res,status,data){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Vary","Origin");
  res.end(JSON.stringify(data));
}
async function handler(req,res){
  const origin=req.headers?.origin;
  if(origin&&origin!=="https://homegoestate.github.io")return json(res,403,{error:"origin_not_allowed"});
  res.setHeader("Access-Control-Allow-Origin","https://homegoestate.github.io");
  res.setHeader("Access-Control-Allow-Methods","GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Accept, Content-Type");
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end()}
  if(req.method!=="GET")return json(res,405,{error:"method_not_allowed"});
  const params=new URL(req.url||"/","https://booking.invalid").searchParams;
  const advisor=params.get("advisor")||"";
  const config=ADVISORS[advisor];
  const day=params.get("from")||todayTaipei();
  const days=Number(params.get("days")||"14");
  const today=parseDay(todayTaipei()),requested=parseDay(day);
  if(!config||!Number.isInteger(days)||days<1||days>14||requested===null||requested<today||requested>today+30*DAY)
    return json(res,400,{error:"invalid_query"});
  const ids=listedCalendars(process.env[config.calendarEnv]);
  const hours=readOfferedHours(process.env[config.hoursEnv]);
  const duration=durationFromConfig(process.env),grid=gridFromConfig(process.env);
  const noticeHours=noticeFromConfig(process.env),buffer=bufferFromConfig(process.env);
  if(!ids||!hours||!duration||!grid||noticeHours===null||buffer===null
      ||!process.env.HG_BOOKING_GOOGLE_CLIENT_EMAIL||!process.env.HG_BOOKING_GOOGLE_PRIVATE_KEY)
    return json(res,503,{error:"calendar_not_configured"});
  try{
    const now=Date.now();
    const busy=await getBusy(process.env,ids,localDayMs(day),localDayMs(day)+days*DAY,fetch);
    const slots=makeSlots({day,days,hours,busy,now,duration,grid,noticeHours,buffer});
    return json(res,200,{source:"google-calendar-freebusy",timezone:"Asia/Taipei",checkedAt:new Date(now).toISOString(),advisor,slots});
  }catch(e){
    // Never expose calendar IDs, Google event details, tokens or credentials to callers.
    console.error("[booking freebusy] unavailable:",e?.message||"unknown");
    return json(res,503,{error:"calendar_unavailable"});
  }
}
module.exports=handler;
module.exports._test={parseDay,localDayMs,readOfferedHours,listedCalendars,formatTaipei,makeSlots,minutes,serviceJwt};
