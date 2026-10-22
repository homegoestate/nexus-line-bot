import {createPublicKey, randomBytes, randomUUID, verify as verifySignature} from 'node:crypto';
import {authenticatedActor} from './authorization.mjs';
import {createService, digest, Fault, CAPABILITIES} from './core.mjs';
import {annualState, leavePolicy} from './annual-policy.mjs';

const project='mainmanagement-1f3d2';
const validKey=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const deny=(code='permission-denied')=>{throw new Fault(403,code,'登入、裝置或權限待核對');};
const at=(o,k)=>Object.hasOwn(o||{},k)?o[k]:undefined;
function principal(root,identity,deviceId){
 const p=at(root._security?.principals,identity.uid),d=at(at(root._security?.devices,identity.uid),deviceId);
 const employee=at(root.employees,p?.employeeKey);
 if(!p||p.active!==true||!['staff','manager','ceo'].includes(p.role)||!Number.isSafeInteger(p.version)||p.version<1||p.modules?.hr!==true||!employee||employee.id!==p.employeeId||employee.loginDisabled===true||employee.isActive===false||employee.employmentStatus==='archived'||d?.active!==true)deny();
 if(Object.values(root.employees||{}).filter(e=>e?.id===p.employeeId).length!==1)deny('identity');
 if(Object.values(root._security.principals).filter(x=>x?.active===true&&x.employeeKey===p.employeeKey).length!==1)deny('identity');
 return {p,d,employee};
}
export function memberFrom(root,identity,clock=Date.now){
 const {p,d,employee}=principal(root,identity,identity.deviceId);
 const session=at(at(root._security.sessions,identity.uid),identity.sessionId);
 // The two hg_* values below come only from this server's verified proof envelope.
 // Browser-supplied custom claims are never used as device verification.
 const token={...identity.claims,uid:identity.uid,hg_sid:identity.sessionId,hg_device:identity.deviceId};
 const actor=authenticatedActor(token,{uid:identity.uid,principal:p,device:d,employee,session,sessionId:identity.sessionId,deviceId:identity.deviceId,reviewScope:at(root._security.requestScopes,identity.uid)||{}},project,clock());
 return {...actor,name:employee.name,capabilities:actor.role==='ceo'?[...CAPABILITIES]:actor.role==='manager'?['review']:[],roleCode:actor.role==='ceo'?'CEO':actor.role==='manager'?'MANAGER':'STAFF'};
}
// No automatic provisioning: existing Auth UID, employee key and approved public
// key must be explicitly mapped in the protected server-only namespace first.
export function createGateway({store,verifyToken,clock=Date.now}){
 async function cas(fn){
  for(let i=0;i<8;i++){
   const {value,version}=await store.read();const result=await fn(value);
   if(await store.compareAndSet(version,value))return result;
  }
  throw new Fault(409,'busy','資料同時異動，請沿用原操作重試');
 }
 const business=createService({store,clock,annualState,leavePolicy,verify:async identity=>identity,resolveMember:(root,i)=>memberFrom(root,i,clock)});
 return {async handle(token,route,input={}){
  const identity=await verifyToken(token);
  if(!validKey(identity?.uid)||identity.claims?.firebase?.sign_in_provider==='anonymous')deny('auth');
  if(!validKey(input.deviceId))deny();
  if(route==='challenge'){
   if(!['session','read','write','command','revoke'].includes(input.route)||typeof input.payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(input.payloadHash))throw new Fault(400,'challenge','驗證資料格式錯誤');
   if(input.route!=='session'&&!validKey(input.sessionId))deny();
   return cas(root=>{
    const {p}=principal(root,identity,input.deviceId),now=clock();
    if(input.route!=='session')memberFrom(root,{...identity,deviceId:input.deviceId,sessionId:input.sessionId},clock);
    const security=root._security;
    security.challenges??={};security.challenges[identity.uid]??={};
    security.rates??={};
    const prior=security.rates[identity.uid];
    const rate=prior&&now-prior.start<60000?prior:{start:now,count:0};
    if(rate.count>=20)throw new Fault(429,'rate','操作頻率過高，請稍後重試');
    security.rates[identity.uid]={start:rate.start,count:rate.count+1};
    const pending=security.challenges[identity.uid];
    for(const[k,v]of Object.entries(pending))if(!v||v.expiresAt<=now||v.used)delete pending[k];
    if(Object.keys(pending).length>=20)throw new Fault(429,'rate','請完成或稍後重試裝置驗證');
    const id=randomUUID(),expiresAt=now+60000;
    const message=JSON.stringify({v:1,uid:identity.uid,deviceId:input.deviceId,sessionId:input.sessionId||null,route:input.route,payloadHash:input.payloadHash,tokenHash:digest(token),principalVersion:p.version,nonce:randomBytes(32).toString('base64url'),expiresAt});
    pending[id]={message,expiresAt,used:false};return {id,message,expiresAt};
   });
  }
  if(!['session','read','write','command','revoke'].includes(route)||!validKey(input.challengeId)||!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload)||typeof input.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(input.signature))deny();
  const bound={...identity,deviceId:input.deviceId,sessionId:input.sessionId};
  const proof=await cas(root=>{
   const {p,d}=principal(root,identity,input.deviceId),now=clock();
   const challenge=at(at(root._security.challenges,identity.uid),input.challengeId);
   if(!challenge||challenge.used||challenge.expiresAt<=now)deny('replay');
   let message;try{message=JSON.parse(challenge.message);}catch{deny();}
   if(message.uid!==identity.uid||message.deviceId!==input.deviceId||message.route!==route||message.payloadHash!==digest(input.payload)||message.tokenHash!==digest(token)||message.principalVersion!==p.version||message.expiresAt!==challenge.expiresAt||message.sessionId!==(input.sessionId||null))deny();
   const jwk=d.publicJwk;
   if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||jwk.d||typeof jwk.x!=='string'||typeof jwk.y!=='string')deny();
   let valid=false;
   try{valid=verifySignature('sha256',Buffer.from(challenge.message),{key:createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(input.signature,'base64url'));}catch{}
   if(!valid)deny();
   if(route!=='session')memberFrom(root,bound,clock);
   challenge.used=true;
   if(route==='session'){
    root._security.sessions??={};root._security.sessions[identity.uid]??={};
    const sessions=root._security.sessions[identity.uid];
    for(const[k,v]of Object.entries(sessions))if(v.expiresAt<=now)delete sessions[k];
    if(Object.values(sessions).filter(x=>x.active===true).length>=10)throw new Fault(429,'sessions','登入階段過多，請先登出其他裝置');
    const sessionId=randomUUID(),expiresAt=now+15*60000;
    sessions[sessionId]={active:true,version:p.version,deviceId:input.deviceId,expiresAt};
    return {sessionId,expiresAt};
   }
   if(route==='revoke')root._security.sessions[identity.uid][input.sessionId].active=false;
   return {verified:true};
  });
  if(route==='session')return proof;
  if(route==='revoke')return {revoked:true};
  return business.handle(bound,route,input.payload);
 }};
}
