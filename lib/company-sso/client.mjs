// Inject an existing Firebase Auth token supplier and a previously approved
// non-extractable P-256 key. This module never reads legacy RTDB passwords.
export function createClient({apiBase,tokenForCurrentUser,deviceId,privateKey,fetcher=fetch,cryptoProvider=globalThis.crypto}){
 const base=new URL(apiBase);
 if(base.protocol!=='https:'||base.origin!=='https://nexus-line-bot.vercel.app'||base.pathname!=='/sso-api')throw Error('Unapproved gateway URL');
 if(privateKey?.type!=='private'||privateKey.extractable!==false||privateKey.algorithm?.name!=='ECDSA'||privateKey.algorithm?.namedCurve!=='P-256')throw Error('Approved non-extractable device key required');
 let sessionId=null,generation=0;
 const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
 const base64url=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 async function post(route,body,token){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const r=await fetcher(base.href+'/'+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
   const data=await r.json();
   if(!r.ok||data.ok!==true)throw Object.assign(Error('安全服務操作未完成'),{status:r.status,code:data.code});
   return data.result;
  }finally{clearTimeout(timer);}
 }
 async function call(route,payload={}){
  const mark=generation,token=await tokenForCurrentUser(),sid=route==='session'?undefined:sessionId;
  if(!token||route!=='session'&&!sid)throw Error('Verified session required');
  if(mark!==generation)throw Error('Identity changed');
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const payloadHash=hex(await cryptoProvider.subtle.digest('SHA-256',bytes));
  const ch=await post('challenge',{deviceId,sessionId:sid,route,payloadHash},token);
  if(mark!==generation)throw Error('Identity changed');
  const signature=base64url(await cryptoProvider.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,new TextEncoder().encode(ch.message)));
  const result=await post(route,{deviceId,sessionId:sid,challengeId:ch.id,signature,payload},token);
  if(mark!==generation)throw Error('Identity changed');
  if(route==='session')sessionId=result.sessionId;
  if(route==='revoke'){generation++;sessionId=null;}
  return result;
 }
 return Object.freeze({open:()=>call('session'),read:path=>call('read',{path}),
  write:input=>call('write',input),command:input=>call('command',input),
  logout:()=>call('revoke'),clear:()=>{generation++;sessionId=null;}});
}
