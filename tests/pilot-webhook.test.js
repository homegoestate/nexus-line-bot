const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.CHANNEL_ACCESS_TOKEN = 'test-token';
process.env.CHANNEL_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_KEY = 'test-key';
const line = require('@line/bot-sdk');
const sent = [];
line.Client.prototype.replyMessage = async (replyToken, messages) => { sent.push({replyToken,messages}); return {}; };
const app = require('../api/index');
const { PILOT_DESTINATION } = require('../lib/pilot-dispatch');

test('signed webhook routes pilot once, preserves isolation and exposes a read-only package probe', async t => {
  const server=app.listen(0);
  t.after(()=>server.close());
  await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}/api`;
  async function post(event,destination=PILOT_DESTINATION,valid=true){
    const body=JSON.stringify({destination,events:[event]});
    const signature=crypto.createHmac('sha256',valid?'test-secret':'wrong-secret').update(body).digest('base64');
    return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-line-signature':signature},body});
  }
  const event={type:'message',mode:'active',source:{type:'user'},replyToken:'test-reply',message:{type:'text',text:'宏國服務體驗'}};
  const health=await fetch(url+'?pilot=version');
  assert.equal(health.status,200);
  assert.equal((await health.json()).routerReady,true);
  assert.equal(sent.length,0);
  assert.notEqual((await post(event,PILOT_DESTINATION,false)).status,200);
  assert.equal(sent.length,0);
  assert.equal((await post(event)).status,200);
  for(let i=0;i<50&&sent.length===0;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(sent.length,1);
  assert.equal(sent[0].replyToken,event.replyToken);
  assert.equal(sent[0].messages[0].type,'flex');
  await post(event,'other-account');
  await post({...event,source:{type:'group'}});
  await post({...event,mode:'standby'});
  await post({...event,message:{type:'text',text:'我要買房'}});
  await post({...event,message:{type:'text',text:'【需求諮詢】買房'}});
  assert.equal(sent.length,1);
  await post({...event,type:'postback',postback:{data:'hgpilot:v1:buy'}});
  for(let i=0;i<50&&sent.length<2;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(sent.length,2);
});
