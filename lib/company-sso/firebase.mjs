import fs from 'node:fs/promises';
import {createSign} from 'node:crypto';
import {Fault} from './core.mjs';
const err=(message,code='upstream')=>new Fault(503,code,message);
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
export function createFirebase({apiKey,projectId='mainmanagement-1f3d2',databaseURL='https://homego-system-default-rtdb.firebaseio.com',credentialFile,credentialJSON,fetcher=fetch,clock=Date.now}){
 if(projectId!=='mainmanagement-1f3d2'||databaseURL!=='https://homego-system-default-rtdb.firebaseio.com')throw Error('Unexpected production project; preserve the existing database');
 let accessToken=null;
 async function request(url,options){try{return await fetcher(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw err('公司服務暫時無法連線，請沿用原操作重試');}}
 async function verify(token){
  if(typeof token!=='string'||token.length>12000)throw new Fault(401,'auth','請重新登入');
  let header,claims;try{const parts=token.split('.');if(parts.length!==3)throw Error();header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw new Fault(401,'auth','登入憑證格式不正確');}
  const now=Math.floor(clock()/1000);
  if(header.alg!=='RS256'||!header.kid||claims.aud!==projectId||claims.iss!==`https://securetoken.google.com/${projectId}`||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||!Number.isFinite(claims.auth_time)||claims.auth_time>now+30)throw new Fault(401,'auth','登入憑證已失效，請重新登入');
  // accounts:lookup validates the signed Firebase ID token. Do not accept decoded claims alone.
  const response=await request(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
  if(!response.ok){if(response.status>=500)throw err('登入服務暫時無法連線');throw new Fault(401,'auth','登入已失效，請重新登入');}
  const {users}=await response.json();const u=users?.[0];
  if(!u||u.localId!==claims.sub||!u.email||claims.email!==u.email)throw new Fault(401,'auth','登入身分已變更，請重新登入並核對帳號。');
  if(u.disabled)throw new Fault(401,'auth','帳號已停用，請聯絡公司管理員核對。');
  if(Number(u.validSince||0)>claims.auth_time)throw new Fault(401,'auth','登入已撤銷，請重新登入。');
  if(claims.firebase?.sign_in_provider==='anonymous')throw new Fault(401,'auth','請使用原公司帳號登入');
  return {uid:u.localId,claims:{...claims,uid:u.localId}};
 }
 async function oauth(){
  if(accessToken&&accessToken.expires>clock()+60000)return accessToken.value;
  if(!credentialFile&&!credentialJSON)throw err('後端尚未設定公司資料庫的存取身分','configuration');
  let c;try{c=JSON.parse(credentialJSON||await fs.readFile(credentialFile,'utf8'));}catch{throw err('後端資料庫憑證未設定','configuration');}
  if(!c.client_email||!c.private_key)throw err('後端資料庫憑證格式不正確','configuration');
  const now=Math.floor(clock()/1000);const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:c.client_email,scope:'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const sig=createSign('RSA-SHA256').update(unsigned).sign(c.private_key).toString('base64url');
  const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+sig})});
  if(!response.ok)throw err('後端資料庫授權失敗');const body=await response.json();if(!body.access_token)throw err('資料庫授權未完成');accessToken={value:body.access_token,expires:clock()+Number(body.expires_in||3600)*1000};return accessToken.value;
 }
 async function read(){await assertClosed();const response=await request(databaseURL+'/.json',{headers:{Authorization:'Bearer '+await oauth(),'X-Firebase-ETag':'true'}});if(!response.ok)throw err('公司資料讀取失敗');const value=await response.json();if(!value?.employees||!response.headers.get('etag'))throw err('既有員工資料或版本資訊不存在；不建立空資料庫');return {value,version:response.headers.get('etag')};}
 async function compareAndSet(version,value){await assertClosed();if(typeof version!=='string'||!version||!value?.employees)throw err('缺少既有資料版本','version');const response=await request(databaseURL+'/.json',{method:'PUT',headers:{Authorization:'Bearer '+await oauth(),'If-Match':version,'Content-Type':'application/json'},body:JSON.stringify(value)});if(response.status===412)return false;if(!response.ok)throw err('儲存尚未確認，請沿用原識別碼重試');return true;}
 async function readRules(){const response=await request(databaseURL+'/.settings/rules.json',{headers:{Authorization:'Bearer '+await oauth()}});if(!response.ok)throw err('無法核對資料庫規則；首次啟用尚未進行','rules-check');return response.json();}
 async function assertClosed(){const rules=(await readRules())?.rules;const closed=node=>node&&typeof node==='object'&&Object.entries(node).every(([k,v])=>k==='.read'||k==='.write'?v===false:typeof v==='object'?closed(v):true);if(!rules||rules['.read']!==false||rules['.write']!==false||!closed(rules))throw new Fault(503,'rules-open','正式資料庫尚未完成安全切換，後端不建立或使用授權資料');}
 return {verify,store:{read,compareAndSet},readRules};
}
