import {createHash, randomUUID} from 'node:crypto';

export class Fault extends Error { constructor(status, code, message) { super(message); Object.assign(this,{status,code}); } }
const fail=(status,code,message)=>{throw new Fault(status,code,message);};
export const copy=v=>v===undefined?null:structuredClone(v);
export const digest=v=>createHash('sha256').update(JSON.stringify(v??null)).digest('hex');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const keyOK=k=>typeof k==='string'&&/^[^.#$\[\]/\u0000-\u001f]{1,160}$/.test(k)&&!['__proto__','prototype','constructor'].includes(k);
const pathParts=path=>{if(typeof path!=='string'||path.length>400)fail(400,'path','資料路徑不正確'); const a=path?path.split('/'):[];if(a.some(x=>!keyOK(x)))fail(400,'path','資料路徑不正確');return a;};
export const at=(root,path)=>pathParts(path).reduce((v,k)=>object(v)||Array.isArray(v)?v[k]:undefined,root)??null;
const put=(root,path,value)=>{const a=pathParts(path);let node=root;for(const k of a.slice(0,-1)){if(!object(node[k]))node[k]={};node=node[k];}node[a.at(-1)]=copy(value);};
const requireCap=(member,cap)=>{if(!member.capabilities.includes(cap))fail(403,'forbidden','此帳號沒有這項操作權限');};
export const CAPABILITIES=['review','attendance','payroll','people','accounts','settings'];
export const MODULE_ROLES={CEO:{label:'執行長',permissions:['ALL']},MANAGER:{label:'主管',permissions:['CASE_ALL','ATTENDANCE_REVIEW','ARCHIVE']},SENIOR:{label:'地政士/資深助理',permissions:['CASE_CREATE','CASE_EDIT','CASE_REVIEW','ARCHIVE']},ACCOUNTING:{label:'會計',permissions:['CASE_CREATE','CASE_EDIT','QUOTE','RECEIPT','ACCOUNTING']},OPS:{label:'一般助理',permissions:['CASE_CREATE','CASE_EDIT','QUOTE','RECEIPT','TOGGLE_CLOSED']},STAFF:{label:'一般人員',permissions:['QUOTE','RECEIPT']}};
const active=e=>e&&e.employmentStatus!=='archived'&&e.loginDisabled!==true;
function uniqueEmployee(root,key){const e=root.employees?.[key];if(!e||e.id===undefined||e.id===null||String(e.id)===''||Object.values(root.employees||{}).filter(x=>String(x?.id)===String(e.id)).length!==1)fail(409,'identity','員工編號缺漏或重複，請主管核對原資料');return e;}
const requireReview=(m,row,key)=>{
 const permission=row?.category==='car'&&row.type==='公務車'?'car':row?.category==='leave'&&row.type==='病假'?'sick':row?.category==='leave'&&row.type==='事假'?'personal':null;
 if(String(row?.empId)===String(m.employeeId)||!(m.role==='ceo'||m.role==='manager'&&permission&&m.approvals?.[permission]===true&&m.reviewScope?.[key]===true))fail(403,'scope','不在授權審核範圍或為本人申請');
};
const employeeFields=['id','name','joinDate','birthday','gender','phone','email','avatar','employmentStatus','terminationDate','annualLeavePolicy','annualLeaveReviewRequired','annualLeaveAdjustments','annualLeaveClosures','salarySettings','stats'];
const safeEmployee=e=>Object.fromEntries(employeeFields.filter(k=>own(e,k)).map(k=>[k,copy(e[k])]));
export function filtered(root,m){
 const result={employees:{},requests:{},attendance:{},bulletin:copy(root.bulletin||{}),settings:{}};
 for(const [key,e]of Object.entries(root.employees||{})){
  if(key===m.employeeKey||m.role==='ceo')result.employees[key]=safeEmployee(e);
 }
 for(const [key,row]of Object.entries(root.requests||{})){
  let permitted=m.role==='ceo'||String(row?.empId)===String(m.employeeId);
  if(!permitted&&row?.status==='pending')try{requireReview(m,row,key);permitted=true;}catch{}
  if(permitted)result.requests[key]=copy(row);
 }
 for(const[key,row]of Object.entries(root.attendance||{}))if(m.role==='ceo'||String(row?.empId)===String(m.employeeId))result.attendance[key]=copy(row);
 for(const k of ['salary','taskTypes'])if(own(root.settings,k))result.settings[k]=copy(root.settings[k]);
 return result;
}
function validateTree(v,depth=0){if(depth>25)fail(400,'depth','資料層次過深');if(typeof v==='number'&&!Number.isFinite(v))fail(400,'number','數值不正確');if(typeof v==='string'&&v.length>200000)fail(400,'size','文字過長');if(typeof v==='string'&&/<\/?[a-z][^>]*>/i.test(v))fail(400,'content','請使用純文字，不要貼入網頁程式標籤');if(object(v)||Array.isArray(v))for(const[k,x]of Object.entries(v)){if(k!=='.sv'&&!keyOK(k))fail(400,'key','資料欄位不正確');validateTree(x,depth+1);}}
function resolveTime(v,now){if(object(v)&&v['.sv']==='timestamp'&&Object.keys(v).length===1)return now;if(Array.isArray(v))return v.map(x=>resolveTime(x,now));if(object(v))return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolveTime(x,now)]));return v;}
function changed(before,after,prefix=''){const fields=[];for(const k of new Set([...Object.keys(before||{}),...Object.keys(after||{})])){const p=prefix?`${prefix}/${k}`:k;if(digest(before?.[k])!==digest(after?.[k]))fields.push(p);}return fields;}
function taipei(now){const d=new Date(now);return {dateStr:d.toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}),timeStr:d.toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}),date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(d)};}

export function createService({store,verify,resolveMember,clock=Date.now,annualState,leavePolicy}){
 if(typeof resolveMember!=='function')throw Error('Trusted membership resolver required');
 const membership=resolveMember;
 async function transaction(identity,input,mutate){
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(input.operationId||''))fail(400,'operation','缺少有效的操作識別碼');
  const opKey=digest([identity.uid,input.operationId]),bodyHash=digest(input);
  for(let attempt=0;attempt<8;attempt++){
   const {value:root,version}=await store.read();const m=membership(root,identity);
   const prior=root._sso?.operations?.[opKey];
   if(prior){if(prior.hash!==bodyHash)fail(409,'operation-reused','相同操作識別碼的內容不同，請核對先前操作');if(prior.accessHash!==digest(m))fail(403,'access-changed','權限已變更，請主管核對先前操作結果');return {...copy(prior.result),replayed:true};}
   const before=copy(root),now=clock();const result=await mutate(root,m,now);
   root._sso??={};root._sso.operations??={};root._sso.audit??={};
   const auditId=randomUUID();
   // Retain original values for the one changed record; existing history is never replaced.
   const affected=result.affected||[];
   root._sso.audit[auditId]={uid:identity.uid,employeeKey:m.employeeKey,at:now,action:input.action||input.path||input.command,operationId:input.operationId,changes:affected.map(path=>({path,before:at(before,path),after:at(root,path)}))};
   const receipt={...result,receipt:{id:auditId,at:now,operationId:input.operationId}};delete receipt.affected;
   root._sso.operations[opKey]={uid:identity.uid,hash:bodyHash,accessHash:digest(m),result:receipt,at:now};
   if(await store.compareAndSet(version,root)){
    const check=await store.read();if(check.value._sso?.operations?.[opKey]?.hash!==bodyHash)fail(503,'unconfirmed','尚未回讀到本次操作；請沿用原識別碼重試');
    return copy(receipt);
   }
  }fail(409,'busy','同時異動較多，請沿用原操作重試');
 }
 async function read(identity,path=''){
  const {value:root}=await store.read();const m=membership(root,identity);const view=filtered(root,m);const parts=pathParts(path);
  if(parts.length&&!['employees','requests','attendance','settings','bulletin'].includes(parts[0]))fail(403,'path','無權讀取此資料');
  const value=at(view,path),roleCode=own(MODULE_ROLES,m.roleCode)?m.roleCode:'STAFF';return {value,version:digest(value),member:{uid:identity.uid,employeeKey:m.employeeKey,employeeId:m.employeeId,name:m.name,capabilities:m.capabilities,email:identity.email,roleCode,role:MODULE_ROLES[roleCode].label,permissions:MODULE_ROLES[roleCode].permissions}};
 }
 function applyWrite(root,m,input,now){
  const path=input.path,a=pathParts(path);if(a.length<1||!['employees','requests','attendance','settings','bulletin'].includes(a[0]))fail(403,'path','此資料不可異動');
  if(['employees','requests','attendance'].includes(a[0])&&a.length<2)fail(403,'bulk','不可整批替換既有紀錄');
  const old=at(root,path),visible=at(filtered(root,m),path);
  if(!old&&['employees','requests','attendance'].includes(a[0])&&!/^[A-Za-z0-9_-]{1,128}$/.test(a[1]||''))fail(400,'key','新紀錄識別碼不正確');
  if(input.expectedVersion!==digest(visible))fail(409,'conflict','資料已變更，請重新讀取後核對');
  if(input.op==='remove'||input.value===null)fail(403,'retain-history','舊資料必須保留，請使用撤回或封存');
  validateTree(input.value);
  // Merge differences against the redacted view, never replace a full record with that view.
  let next=copy(old);
  if(input.op==='update'){
   if(!object(input.value))fail(400,'value','更新內容不正確');next=object(old)?copy(old):{};
   for(const[k,v]of Object.entries(input.value)){if(!keyOK(k)||v===null)fail(400,'field','此欄位不能刪除');next[k]=copy(v);}
  }else if(['set','transaction'].includes(input.op)){
   if(object(old)&&object(input.value)) {next=copy(old);for(const k of changed(visible,input.value)){if(!own(input.value,k)||input.value[k]===null)fail(403,'retain-history','原有欄位不可刪除');next[k]=copy(input.value[k]);}}
   else next=copy(input.value);
  }else fail(400,'op','不支援此操作');
  const fields=changed(old,next);
  if(a[0]==='employees'){
   if(a.length<2)fail(403,'bulk','不可整批替換員工資料');
   const e=root.employees?.[a[1]];if(!e){
    requireCap(m,'people');if(a.length!==2||!object(next)||!String(next.name||'').trim()||!leavePolicy.validDate(next.joinDate)||next.id===undefined||String(next.id)===''||Object.values(root.employees||{}).some(x=>String(x.id)===String(next.id)))fail(400,'new-employee','新增同仁須填姓名、到職日及不重複的原編號');
    const allowed=['id','name','joinDate','birthday','gender','phone','email','avatar','employmentStatus','stats','annualLeaveReviewRequired'];if(Object.keys(next).some(k=>!allowed.includes(k)))fail(400,'new-employee','新增員工含尚未核對的欄位');
    if(next.stats&&Object.values(next.stats).some(x=>Number(x)!==0))fail(400,'new-balance','新增員工不得帶入未核對的歷史餘額');
    next.employmentStatus='active';next.createdBy=m.uid;next.createdAt=now;put(root,path,next);return {value:at(filtered(root,m),path),affected:[path]};
   }
   const roots=a.length>2?[a[2]]:fields;
   for(const f of roots){
    if(f==='avatar'&&a[1]===m.employeeKey){const avatar=a.length>2?next:next.avatar;if(typeof avatar!=='string'||(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)&&!/^https:\/\/[^\s<>"']+$/.test(avatar)))fail(400,'avatar','頭像格式不正確');continue;}
    if(['name','joinDate','employmentStatus','terminationDate','employmentHistory','loginDisabled','archiveReason','archivedAt','reinstatedAt'].includes(f))requireCap(m,'people');
    else if(['salarySettings','annualLeaveAdjustments','annualLeaveClosures','annualLeaveReviewRequired','stats'].includes(f))requireCap(m,'payroll');
    else fail(403,'field','此員工欄位不能由本操作更改');
   }
   const whole=copy(e);if(a.length===2)Object.assign(whole,next);else put(whole,a.slice(2).join('/'),next);
   if(a[1]===m.employeeKey&&whole.employmentStatus!==e.employmentStatus)fail(403,'self-status','不能更改自己的在職狀態，請另一位授權主管處理');
   if(String(whole.id)!==String(e.id))fail(403,'immutable','原員工編號不得更換');
   if(whole.stats?.annual!==e.stats?.annual)fail(403,'legacy-balance','舊已休原值必須保留，請使用本期核對欄位');
   // Payroll changes retain an independent audit record; histories remain append-only.
   for(const f of ['employmentHistory'])if(e[f]&&digest((whole[f]||[]).slice(0,e[f].length))!==digest(e[f]))fail(403,'history','既有歷程不可更改');
   if(a[2]==='annualLeaveClosures'){
    const state=annualState(root,e,a[3]);const asOf=e.employmentStatus==='archived'?e.terminationDate:taipei(now).date;
    if(state.pending||!state.period||(state.period.end>asOf&&e.employmentStatus!=='archived')||!Number.isFinite(next.paidDays)||!Number.isFinite(next.carryDays)||next.paidDays<0||next.carryDays<0||Math.abs(next.paidDays+next.carryDays-state.remaining)>.001||next.carryDays>state.currentGrantUnused+.001||(e.employmentStatus==='archived'&&next.carryDays>0)||!next.note?.trim())fail(409,'annual-review','特休期末、已休數及結算日數須先完成核對');
   }
  }else if(a[0]==='requests'){
   if(a.length!==2)fail(403,'path','請整筆操作申請單');
   if(!old){
    if(!object(next)||String(next.empId)!==String(m.employeeId)||!['leave','car','log'].includes(next.category))fail(403,'owner','只能新增本人的申請');
    if(next.category==='leave'){
     const times=String(next.time||'').split(' ~ ');const error=leavePolicy.validate({type:next.type,date:next.date,endDate:next.endDate||next.date,days:next.days,reason:next.reason||'',mode:next.time?'time':'day',start:times[0],end:times[1]});if(error)fail(400,'leave',error);
     if(next.time){const minutes=leavePolicy.minutesBetween(times[0],times[1]);if(Math.abs(Number(next.days)*480-minutes)>.1)fail(400,'duration','請假時段與日數不一致');next.minutes=minutes;}
     else if(Number(next.days)>(Date.parse(next.endDate||next.date)-Date.parse(next.date))/86400000+1)fail(400,'duration','請假日數超過日期區間，請核對');
    }
    if(next.category==='car'&&(next.type!=='公務車'||!leavePolicy.validDate(next.date)||typeof next.time!=='string'||!next.time.trim()||typeof next.location!=='string'||!next.location.trim()))fail(400,'car','用車日期、時間與地點須填寫');
    if(next.category==='log')fail(403,'unsupported','工作紀錄需完成新版資料格式核對');
    const allowed=['empId','empName','category','type','date','endDate','days','reason','time','hours','status','timestamp','location'];if(Object.keys(next).some(k=>!allowed.includes(k)))fail(400,'field','申請包含不允許的欄位');
    Object.assign(next,{empId:m.employeeId,empName:m.name,status:'pending',timestamp:now,submittedBy:identityFrom(m)});
   }else if(fields.length===1&&fields[0]==='status'&&next.status==='cancelled'&&String(old.empId)===String(m.employeeId)&&old.status==='pending')next.cancelledAt=now;
   else if(next.status==='voided'){
    requireCap(m,'review');requireReview(m,old,a[1]);if(String(old.empId)===String(m.employeeId))fail(403,'self-review','不能自行作廢已送審的申請');
    if(fields.some(x=>!['status','voidedAt','voidReason','requestHistory'].includes(x))||!String(next.voidReason||'').trim()||old.status==='voided')fail(400,'void','作廢須填原因，原申請內容須保留');
    next={...old,status:'voided',voidedAt:now,voidReason:next.voidReason,requestHistory:[...(old.requestHistory||[]),{previousStatus:old.status,action:'voided',reason:next.voidReason,at:now,uid:m.uid}]};
    if(old.category==='car'&&root.attendance?.['sso-car-'+a[1]])fail(409,'car-void','此單已有用車紀錄，請先由主管核對並作廢用車出勤再撤回申請');
   }else if(old.status==='pending'&&next.status==='pending'){
    if(String(old.empId)!==String(m.employeeId)){requireCap(m,'review');requireReview(m,old,a[1]);}
    if(fields.some(x=>!['date','endDate','days','status'].includes(x))||old.time)fail(403,'request-edit','此申請請先撤回後重新填寫，原內容仍保留');
    const error=leavePolicy.validate({type:next.type,date:next.date,endDate:next.endDate||next.date,days:next.days,reason:next.reason||'',mode:'day'});if(error)fail(400,'leave',error);
    next.requestHistory=[...(old.requestHistory||[]),{action:'corrected',before:{date:old.date,endDate:old.endDate||old.date,days:old.days},at:now,uid:m.uid}];
   }else fail(403,'review-action','請使用核准／退回功能，申請原文必須保留');
  }else if(a[0]==='attendance'){
   if(a.length!==2)fail(403,'attendance-action','請整筆操作打卡');
   if(old){
    requireCap(m,'attendance');if(String(old.empId)===String(m.employeeId))fail(403,'self-correction','自己的打卡更正請另一位授權主管處理');
    if(fields.some(x=>!['status','timeStr','correctionHistory','voidedAt','voidReason'].includes(x))||old.status==='已作廢')fail(403,'raw-record','原始打卡及已作廢紀錄不能更改');
    const proposed=next.correctionHistory?.at(-1);if(!String(proposed?.reason||next.voidReason||'').trim())fail(400,'reason','更正須填核對依據');
    if(!['正常','遲到','加班','待覆核','已作廢','用車紀錄'].includes(next.status)||!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(next.timeStr||''))fail(400,'correction','狀態或時間格式不正確');
    next={...old,status:next.status,timeStr:next.timeStr,correctionHistory:[...(old.correctionHistory||[]),{previousStatus:old.status,previousTimeStr:old.timeStr,nextStatus:next.status,nextTimeStr:next.timeStr,reason:proposed?.reason||next.voidReason,changedAt:now,uid:m.uid}]};
    put(root,path,next);return {value:copy(next),affected:[path]};
   }
   if(String(next.empId)!==String(m.employeeId)||!['上班','下班'].includes(next.type))fail(403,'owner','只能記錄本人打卡');
   if(Object.values(root.attendance||{}).some(x=>String(x.empId)===String(m.employeeId)&&x.type===next.type&&Number(x.timestamp)>now-120000))fail(409,'duplicate-punch','兩分鐘內已有同類打卡，請核對日曆');
   const time=taipei(now),minute=Number(time.timeStr.split(':')[0])*60+Number(time.timeStr.split(':')[1]);
   const located=/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(next.location||'')&&Number.isFinite(next.gpsAccuracyMeters)&&next.gpsAccuracyMeters>0&&next.gpsAccuracyMeters<=150;
   next={empId:m.employeeId,empName:m.name,type:next.type,timestamp:now,dateStr:time.dateStr,timeStr:time.timeStr,clientClickedAt:Number(next.clientClickedAt)||now,location:String(next.location||'定位未取得').slice(0,100),gpsAccuracyMeters:Number(next.gpsAccuracyMeters)||null,gpsIssue:String(next.gpsIssue||'').slice(0,300),reviewReason:String(next.reviewReason||'').slice(0,500),status:located?(next.type==='上班'&&minute>510?'遲到':next.type==='下班'&&minute>1080?'加班':'正常'):'待覆核',source:'unified-auth',submittedBy:m.uid};
   if(Math.abs(next.clientClickedAt-now)>120000)next.status='待覆核';
  }else {requireCap(m,'settings');if(a[0]==='settings'&&a[1]==='salary')requireCap(m,'payroll');if(a[0]==='settings'&&(a.length!==2||!['salary','taskTypes'].includes(a[1])))fail(403,'settings','不支援的設定');}
  next=resolveTime(next,now);put(root,path,next);return {value:at(filtered(root,m),path),affected:[path]};
 }
 async function command(root,m,input,now){
  if(input.command==='review'){
   requireCap(m,'review');const row=root.requests?.[input.key];if(!row)fail(404,'missing','找不到申請');requireReview(m,row,input.key);
   if(String(row.empId)===String(m.employeeId))fail(403,'self-review','不能審核自己的申請，請另一位授權主管處理');
   if(row.status!=='pending')fail(409,'reviewed','此申請已處理，請重新讀取');
   if(!['approved','rejected'].includes(input.status))fail(400,'status','審核狀態不正確');
   const entries=Object.entries(root.employees||{}).filter(([,e])=>String(e.id)===String(row.empId));if(entries.length!==1||!active(entries[0][1]))fail(409,'identity','申請人已停用或編號待核對');
   if(input.status==='approved'&&row.type==='特休'){
    const state=annualState(root,entries[0][1],row.date);if(state.pending||!state.period||!Number.isFinite(Number(row.days))||Number(row.days)<=0||row.date<state.period.start||(row.endDate||row.date)>=state.period.end||Number(row.days)>state.remaining+.001)fail(409,'annual-review','特休餘額、期別或舊已休數尚待核對');
   }
   if(input.status==='approved'&&row.category==='car'&&Object.values(root.requests||{}).some(r=>r!==row&&r.category==='car'&&r.status==='approved'&&r.date===row.date&&(r.carId||r.car||'default')===(row.carId||row.car||'default')&&(!r.time||!row.time||r.time===row.time)))fail(409,'car-conflict','此車當日有已核准預約，請核對時段');
   Object.assign(row,{status:input.status,reviewedBy:m.uid,reviewedAt:now,approvedAt:input.status==='approved'?now:null,approvalHistory:[...(Array.isArray(row.approvalHistory)?row.approvalHistory:[]),{action:'review',status:input.status,actorId:m.employeeId,at:now,previousStatus:row.status}]});const affected=[`requests/${input.key}`];
   if(input.status==='approved'&&row.category==='car'){
    const key='sso-car-'+input.key;if(root.attendance?.[key])fail(409,'car-record','已有相同用車紀錄');root.attendance??={};root.attendance[key]={empId:row.empId,empName:row.empName,type:'🚗 公務車',timestamp:new Date(row.date+'T09:00:00+08:00').getTime(),dateStr:new Date(row.date+'T09:00:00+08:00').toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}),timeStr:row.time||'整日',location:row.location||'',status:'用車紀錄',requestKey:input.key};affected.push(`attendance/${key}`);
   }return {value:copy(row),affected};
  }
  fail(400,'command','不支援的操作');
 }
 async function handle(token,route,input={}){
  const identity=await verify(token);if(!identity?.uid)fail(401,'auth','請重新登入');
  if(route==='read')return read(identity,input.path||'');
  if(route==='session'){const {member}=await read(identity,'bulletin');return member;}
  if(route==='write')return transaction(identity,input,(root,m,now)=>applyWrite(root,m,input,now));
  if(route==='command')return transaction(identity,input,(root,m,now)=>command(root,m,input,now));
  fail(404,'route','找不到此功能');
 }
 return {handle};
}
const identityFrom=m=>m.uid;
