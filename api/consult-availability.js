"use strict";

// Read-only availability API. No customer data, payment or calendar event writes.
// Production requires explicitly configured advisor calendar ACLs and offered hours.
const crypto = require("node:crypto");
const DAY = 86400000;
const TAIPEI_OFFSET = 8 * 3600000;
const SCOPES = "https://www.googleapis.com/auth/calendar.events.freebusy";
// Company-calendar mode reads event titles to tell whose event it is; titles never leave this server.
const EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const ADVISORS = {
  // 楊翊晟執行長：行程標註「翊晟」
  "yi-cheng": {calendarEnv:"HG_BOOKING_YICHENG_BUSY_CALENDARS", hoursEnv:"HG_BOOKING_YICHENG_HOURS_JSON",
    tagsEnv:"HG_BOOKING_YICHENG_TAGS", tags:["翊晟"]},
  // 楊明宗總經理：行程標註「楊總」或「楊明宗」
  "ming-zong": {calendarEnv:"HG_BOOKING_MINGZONG_BUSY_CALENDARS", hoursEnv:"HG_BOOKING_MINGZONG_HOURS_JSON",
    tagsEnv:"HG_BOOKING_MINGZONG_TAGS", tags:["楊總","楊明宗"]}
};
// Used when no hours are configured: Mon–Fri 09:00–12:00 and 14:00–17:00 (Taipei).
const DEFAULT_HOURS_JSON = JSON.stringify(Object.fromEntries([1,2,3,4,5].map(d=>[d,[["09:00","12:00"],["14:00","17:00"]]])));
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
function listedTags(text,fallback){
  if(text===undefined||text===null||String(text).trim()==="")return fallback.slice();
  const list=String(text).split(",").map(x=>x.trim()).filter(Boolean);
  return list.length>0&&list.length<=10&&list.every(x=>x.length>=2&&x.length<=20)?list:null;
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
function serviceJwt(email,privateKey,now=Math.floor(Date.now()/1000),scope=SCOPES){
  const a=base64url({alg:"RS256",typ:"JWT"});
  const b=base64url({iss:email,scope,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500});
  const data=a+"."+b;
  const sign=crypto.createSign("RSA-SHA256");sign.update(data);sign.end();
  return data+"."+sign.sign(privateKey,"base64url");
}
async function getAccessToken(env,fetcher,scope=SCOPES){
  const email=env.HG_BOOKING_GOOGLE_CLIENT_EMAIL;
  const key=String(env.HG_BOOKING_GOOGLE_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  if(!email||!key)throw new Error("calendar_credentials_missing");
  const jwt=serviceJwt(email,key,undefined,scope);
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
  if(!data||!data.calendars||typeof data.calendars!=="object"||Array.isArray(data.calendars))throw new Error("calendar_response_invalid");
  const busy=[];
  for(const id of ids){
    const cal=data.calendars[id];
    if(!cal||!Array.isArray(cal.busy)||(cal.errors&&cal.errors.length))throw new Error("calendar_unreadable");
    for(const block of cal.busy){
      const rfc3339=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
      if(!block||!rfc3339.test(block.start)||!rfc3339.test(block.end)
          ||!Number.isFinite(Date.parse(block.start))||!Number.isFinite(Date.parse(block.end))
          ||Date.parse(block.end)<=Date.parse(block.start))throw new Error("calendar_busy_invalid");
      busy.push({start:block.start,end:block.end});
    }
  }
  return busy;
}
const RFC3339=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
// Turn one Google event into a busy block for this advisor, or null when it does not apply.
// Only events whose title or description carries one of the advisor's tags count;
// cancelled events and events marked "free" (transparent) never block.
function taggedBusyBlock(event,tags){
  if(!event||typeof event!=="object")throw new Error("calendar_event_invalid");
  if(event.status==="cancelled"||event.transparency==="transparent")return null;
  if(["workingLocation","birthday"].includes(event.eventType))return null;
  const text=String(event.summary||"")+"\n"+String(event.description||"");
  if(!tags.some(tag=>text.includes(tag)))return null;
  const s=event.start||{},e=event.end||{};
  let start,end;
  if(typeof s.dateTime==="string"&&typeof e.dateTime==="string"){
    if(!RFC3339.test(s.dateTime)||!RFC3339.test(e.dateTime))throw new Error("calendar_event_invalid");
    start=Date.parse(s.dateTime);end=Date.parse(e.dateTime);
  }else if(typeof s.date==="string"&&typeof e.date==="string"){
    // All-day events: Google's end date is exclusive; days are Taipei days.
    start=localDayMs(s.date);end=localDayMs(e.date);
    if(start===null||end===null)throw new Error("calendar_event_invalid");
  }else throw new Error("calendar_event_invalid");
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error("calendar_event_invalid");
  return {start:new Date(start).toISOString(),end:new Date(end).toISOString()};
}
async function getTaggedBusy(env,calendarId,tags,fromMs,toMs,fetcher){
  const token=await getAccessToken(env,fetcher,EVENTS_SCOPE);
  const busy=[]; let pageToken="";
  for(let page=0;page<10;page++){
    const url=new URL("https://www.googleapis.com/calendar/v3/calendars/"+encodeURIComponent(calendarId)+"/events");
    url.searchParams.set("timeMin",formatTaipei(fromMs));url.searchParams.set("timeMax",formatTaipei(toMs));
    url.searchParams.set("singleEvents","true");url.searchParams.set("showDeleted","false");
    url.searchParams.set("maxResults","2500");url.searchParams.set("timeZone","Asia/Taipei");
    url.searchParams.set("fields","nextPageToken,items(status,transparency,eventType,summary,description,start,end)");
    if(pageToken)url.searchParams.set("pageToken",pageToken);
    const response=await fetcher(url.toString(),{method:"GET",headers:{"Authorization":"Bearer "+token},signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw new Error("google_events_unavailable");
    const data=await response.json();
    if(!data||!Array.isArray(data.items))throw new Error("calendar_response_invalid");
    for(const event of data.items){const block=taggedBusyBlock(event,tags);if(block)busy.push(block);}
    if(!data.nextPageToken)return busy;
    pageToken=String(data.nextPageToken);
  }
  // Too many pages: refuse rather than risk missing a conflict.
  throw new Error("calendar_too_many_events");
}
// Apps Script mode: a script owned by the company Google account reads the calendar,
// applies the name tags and returns busy start/end times only. No keys stored here.
const APPS_SCRIPT_URL=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
// 「宏國預約｜行事曆查詢」（homegoestate@gmail.com 的 Apps Script，2026-11-10 部署）。
// Public read-only endpoint returning busy times only, so it is not a secret.
const DEFAULT_APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbxcf07pb1xgP1gdK4gWqWgX-Z5GnZlhzY7k5u7Mhd8kkgocVWnornnt9CgqFSFb7J_2NQ/exec";
// env set → use it ("off" disables); unset → default, unless another calendar mode is configured.
function appsScriptUrl(env,otherModeConfigured=false){
  const raw=env.HG_BOOKING_APPS_SCRIPT_URL;
  const v=String(raw||"").trim();
  if(v.toLowerCase()==="off")return "";
  if(!v)return otherModeConfigured?"":DEFAULT_APPS_SCRIPT_URL;
  return APPS_SCRIPT_URL.test(v)?v:null;
}
async function getAppsScriptBusy(endpoint,advisor,fromMs,toMs,fetcher){
  const url=new URL(endpoint);
  url.searchParams.set("advisor",advisor);
  url.searchParams.set("from",formatTaipei(fromMs));url.searchParams.set("to",formatTaipei(toMs));
  const response=await fetcher(url.toString(),{method:"GET",redirect:"follow",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error("apps_script_unavailable");
  const data=await response.json();
  if(!data||data.ok!==true||!Array.isArray(data.busy)||data.busy.length>2000)throw new Error("apps_script_response_invalid");
  return data.busy.map(block=>{
    if(!block||!RFC3339.test(block.start)||!RFC3339.test(block.end)
        ||!(Date.parse(block.end)>Date.parse(block.start)))throw new Error("apps_script_busy_invalid");
    return {start:block.start,end:block.end};
  });
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
  const config=Object.hasOwn(ADVISORS,advisor)?ADVISORS[advisor]:null;
  const day=params.get("from")||todayTaipei();
  const days=Number(params.get("days")||"14");
  const today=parseDay(todayTaipei()),requested=parseDay(day);
  if(!config||!Number.isInteger(days)||days<1||days>14||requested===null||requested<today||requested>today+30*DAY)
    return json(res,400,{error:"invalid_query"});
  // Company mode: one shared calendar, events split by name tags. Otherwise per-advisor calendars.
  const company=String(process.env.HG_BOOKING_COMPANY_CALENDAR||"").trim();
  const companyOk=company.length>0&&company.length<=255&&!company.includes(",");
  const ids=company?null:listedCalendars(process.env[config.calendarEnv]);
  const tags=listedTags(process.env[config.tagsEnv],config.tags);
  const hoursText=process.env[config.hoursEnv]||process.env.HG_BOOKING_HOURS_JSON||DEFAULT_HOURS_JSON;
  const hours=readOfferedHours(hoursText);
  const duration=durationFromConfig(process.env),grid=gridFromConfig(process.env);
  const noticeHours=noticeFromConfig(process.env),buffer=bufferFromConfig(process.env);
  const script=appsScriptUrl(process.env,!!company||!!process.env[config.calendarEnv]);
  const hasKey=!!process.env.HG_BOOKING_GOOGLE_CLIENT_EMAIL&&!!process.env.HG_BOOKING_GOOGLE_PRIVATE_KEY;
  const sourceOk=script===null?false:script?true:(company?(companyOk&&!!tags):!!ids)&&hasKey;
  if(!sourceOk||!hours||!duration||!grid||noticeHours===null||buffer===null)
    return json(res,503,{error:"calendar_not_configured"});
  try{
    // Include neighbouring days so a buffer crossing midnight cannot miss a conflict.
    const fromMs=localDayMs(day)-buffer*60000,toMs=localDayMs(day)+days*DAY+buffer*60000;
    const busy=script
      ?await getAppsScriptBusy(script,advisor,fromMs,toMs,fetch)
      :company
      ?await getTaggedBusy(process.env,company,tags,fromMs,toMs,fetch)
      :await getBusy(process.env,ids,fromMs,toMs,fetch);
    const now=Date.now();
    const slots=makeSlots({day,days,hours,busy,now,duration,grid,noticeHours,buffer});
    return json(res,200,{source:"google-calendar-freebusy",timezone:"Asia/Taipei",checkedAt:new Date(now).toISOString(),advisor,slots});
  }catch(e){
    // Never expose calendar IDs, Google event details, tokens or credentials to callers.
    console.error("[booking freebusy] unavailable");
    return json(res,503,{error:"calendar_unavailable"});
  }
}
module.exports=handler;
module.exports._test={parseDay,localDayMs,readOfferedHours,listedCalendars,listedTags,taggedBusyBlock,appsScriptUrl,formatTaipei,makeSlots,minutes,serviceJwt};

