const test=require('node:test'), assert=require('node:assert/strict'), http=require('node:http');
test('formal release GET probes render three accounts without sending messages or reading case records',async t=>{
  const {SERVICE_ACCOUNTS}=require('../lib/service-accounts'),config=require('../lib/native-guide-config');
  const env={CHANNEL_SECRET:'offline-secret',CHANNEL_ACCESS_TOKEN:'offline-token',SUPABASE_URL:'https://example.supabase.co',SUPABASE_KEY:'offline-db'};
  for(const a of Object.values(SERVICE_ACCOUNTS)) {env[a.secretEnv]='offline-secret'; if(a.enabledEnv)env[a.enabledEnv]='true'; for(const flags of [config.NATIVE_TEST_FLAGS,config.NATIVE_PUBLIC_FLAGS,config.NATIVE_DOCUMENT_FLAGS])env[flags[a.key]]=flags===config.NATIVE_DOCUMENT_FLAGS?'false':'true';}
  for(const [key,value] of Object.entries(env)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  const sp=require.resolve('@supabase/supabase-js'),original=require(sp);require.cache[sp].exports={...original,createClient:()=>({from:()=>{throw Error('Unexpected case access');}})};t.after(()=>{require.cache[sp].exports=original;});
  t.mock.method(require('@line/bot-sdk').Client.prototype,'replyMessage',()=>{throw Error('Unexpected LINE send');});
  t.mock.method(globalThis,'fetch',()=>{throw Error('Unexpected external transport');});
  const app=require('../api/index'),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  for(const a of Object.values(SERVICE_ACCOUNTS)){
    const result=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:server.address().port,path:'/api?account='+a.key+'&pilot=version'},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));}).on('error',reject);});
    assert.equal(result.status,200);assert.equal(result.body.nativeGuideVersion,'0.4.4');assert.equal(result.body.processOverviewReady,true);assert.equal(result.body.processOverviewStages,8);assert.match(result.body.processOverviewContentSha256,/^[a-f0-9]{64}$/);assert.equal(result.body.formalGuideReady,true);assert.equal(result.body.nativeDocumentsReady,false);assert.equal(result.body.nativeDocumentsRetired,true);assert.match(result.body.nativeGuideContentSha256,/^[a-f0-9]{64}$/);assert.match(result.body.welcomeMenuSha256,/^[a-f0-9]{64}$/);assert.match(result.body.officialServiceContentSha256,/^[a-f0-9]{64}$/);assert.equal(result.body.documentReceiptTrusted,false);assert.equal(result.body.persistentCaseRecords,false);
  }
});
