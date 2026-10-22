const routes=new Set(['challenge','session','read','write','command','revoke']);
export function createHandler({service,enabled=()=>false}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const origin=req.headers.origin;
  if(origin&&origin!=='https://homegoestate.github.io'){res.statusCode=403;return res.end();}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');}
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  try{
   const url=new URL(req.url,'https://nexus-line-bot.vercel.app'),actions=url.searchParams.getAll('route');
   const route=actions.length===1?actions[0]:'';
   if(req.method!=='POST')throw {status:405,code:'method'};
   if(!routes.has(route))throw {status:404,code:'route'};
   const token=/^Bearer (\S{1,12000})$/.exec(req.headers.authorization||'')?.[1];
   if(!token)throw {status:401,code:'auth'};
   if(!enabled())throw {status:503,code:'disabled'};
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw {status:415,code:'content-type'};
   let bytes;
   if(req.body!==undefined)bytes=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));
   else {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>350000)throw {status:413,code:'size'};chunks.push(chunk);}bytes=Buffer.concat(chunks);}
   if(bytes.length>350000)throw {status:413,code:'size'};
   let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw {status:400,code:'json'};}
   if(!body||typeof body!=='object'||Array.isArray(body))throw {status:400,code:'json'};
   const result=await service.handle(token,route,body);res.end(JSON.stringify({ok:true,result}));
  }catch(error){
   res.statusCode=Number.isInteger(error.status)&&error.status>=400&&error.status<600?error.status:503;
   res.end(JSON.stringify({ok:false,code:error.code||'service',message:res.statusCode===401?'請由總管理重新登入':res.statusCode===503?'安全服務尚未啟用或暫時無法連線':'操作未完成，請核對登入與授權後重試'}));
  }
 };
}
