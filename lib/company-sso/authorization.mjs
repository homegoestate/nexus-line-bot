// Platform-neutral trusted-backend policy. Not an HTTP endpoint or an Admin SDK proxy.
// Call ONLY with a server-verified Firebase ID token and fresh server-read records.
// Never fill `state` from a request body, browser session, or client-provided claims.
export class AccessDenied extends Error {
  constructor(code='permission-denied') { super(code); this.code=code; }
}
const verifiedActors=new WeakSet();
const deny=()=>{throw new AccessDenied();};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object??{},key)?object[key]:undefined;
const key=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function authenticatedActor(token, state, projectId, now=Date.now()) {
  if(!token || token.aud!==projectId || token.iss!==`https://securetoken.google.com/${projectId}` ||
    typeof token.uid!=='string' || !token.uid || token.sub!==token.uid ||
    !Number.isFinite(token.exp) || token.exp*1000<=now ||
    !Number.isFinite(token.auth_time) || token.auth_time*1000>now ||
    token.firebase?.sign_in_provider==='anonymous' || !key(token.hg_sid) || !key(token.hg_device)) deny();
  const principal=state?.principal, session=state?.session, device=state?.device, employee=state?.employee;
  if(!principal || principal.active!==true || !['staff','manager','ceo'].includes(principal.role) ||
    !Number.isSafeInteger(principal.version) || principal.version<1 ||
    typeof principal.employeeKey!=='string' || !principal.employeeKey ||
    state.uid!==token.uid || state.sessionId!==token.hg_sid || state.deviceId!==token.hg_device ||
    session?.active!==true || !Number.isFinite(session.expiresAt) || session.expiresAt<=now ||
    session.version!==principal.version || session.deviceId!==token.hg_device || device?.active!==true ||
    !employee || employee.employmentStatus==='archived' || employee.loginDisabled===true || employee.isActive===false) deny();
  if(principal.modules?.hr===true && employee.id!==principal.employeeId) deny();
  const actor=Object.freeze({uid:token.uid,sessionId:token.hg_sid,deviceId:token.hg_device,
    role:principal.role,employeeKey:principal.employeeKey,employeeId:principal.employeeId,employeeName:employee.name,
    modules:Object.freeze(structuredClone(principal.modules??{})),approvals:Object.freeze(structuredClone(principal.approvals??{})),
    reviewScope:Object.freeze(structuredClone(state.reviewScope??{}))});
  verifiedActors.add(actor);return actor;
}
const permissionFor=r=>r?.category==='car' && r.type==='公務車'?'car':r?.category==='leave' && r.type==='病假'?'sick':r?.category==='leave' && r.type==='事假'?'personal':null;
const calendarDate=value=>{
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0,10)===value;
};
export function validatePendingRequest(record,employee,now=Date.now()) {
  if(!record || record.empId!==employee.id || record.empName!==employee.name || record.status!=='pending' ||
    !calendarDate(record.date) || !Number.isFinite(record.timestamp) || record.timestamp>now+60000 || record.timestamp<=0) deny();
  const common=['empId','empName','category','type','date','status','timestamp'];
  const fields=record.category==='leave'?[...common,'endDate','days','reason','time','hours']:record.category==='car'?[...common,'time','location']:[];
  if(!fields.length || Object.keys(record).some(k=>!fields.includes(k))) deny();
  if(record.category==='leave') {
    if(!calendarDate(record.endDate) || record.endDate<record.date || typeof record.type!=='string' || record.type.length<1 || record.type.length>40 ||
      !['number','string'].includes(typeof record.days) || !String(record.days).trim() ||
      !Number.isFinite(Number(record.days)) || Number(record.days)<=0 || Number(record.days)>366 ||
      typeof record.reason!=='string' || !record.reason.trim() || record.reason.length>2000) deny();
    if(record.hours!==undefined && (typeof record.hours!=='string' || !Number.isFinite(Number(record.hours)) || Number(record.hours)<=0 || Number(record.hours)>24)) deny();
  } else if(record.type!=='公務車' || typeof record.time!=='string' || !record.time || record.time.length>80 ||
    typeof record.location!=='string' || !record.location.trim() || record.location.length>1000) deny();
  if(record.time!==undefined && (typeof record.time!=='string' || record.time.length>80)) deny();
  return true;
}
export function authorizeAction(actor,action,resource={}) {
  if(!actor || !verifiedActors.has(actor) || actor.modules?.hr!==true) deny();
  const request=resource.request;
  switch(action) {
    case 'request.create':
      if(request?.empId!==actor.employeeId || request?.status!=='pending') deny();
      validatePendingRequest(request,{id:actor.employeeId,name:actor.employeeName});
      return true;
    case 'request.review': {
      if(!['approve','reject'].includes(resource.decision) || request?.status!=='pending' ||
        request.empId===actor.employeeId || !resource.applicant || resource.applicant.id!==request.empId ||
        resource.applicant.employmentStatus==='archived' || resource.applicant.loginDisabled===true) deny();
      if(actor.role==='ceo') return true;
      const permission=permissionFor(request);
      if(actor.role!=='manager' || !permission || actor.approvals?.[permission]!==true ||
        own(actor.reviewScope,resource.requestKey)!==true) deny();
      return true;
    }
    case 'attendance.correct': case 'employee.update': case 'salary.update': case 'annualLeave.reconcile':
    case 'delegation.update': case 'device.approve': case 'device.revoke': case 'employee.archive': case 'employee.reinstate': case 'bulletin.update':
      if(actor.role!=='ceo') deny();
      return true;
    default: deny();
  }
}
// Safe projections are allowlists. Never spread a legacy employee/user object.
export function directoryEntry(employee) {
  if(!employee || employee.employmentStatus==='archived' || employee.loginDisabled===true || employee.isActive===false) return null;
  return {name:String(employee.name??'').slice(0,100)};
}
export function accountAdminView(employee,user,uid) {
  return {name:String(employee?.name??'').slice(0,100),uid:String(uid),
    active:employee?.isActive!==false && employee?.employmentStatus!=='archived' && user?.legacyPortalDisabled!==true,
    deviceCount:Array.isArray(user?.authorizedDevices)?user.authorizedDevices.length:0};
}
