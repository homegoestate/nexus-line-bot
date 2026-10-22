// Extracted without changing calculations from Employee-management index.html on 2026-10-22.
import './leave-policy.js';
export const leavePolicy=globalThis.HGELeavePolicy;
export function annualState(root,emp,asOf){
const employees=root.employees||{},requests=root.requests||{};
const employeeIdentityIsUnique=e=>!!e&&e.id!==undefined&&e.id!==null&&String(e.id)!==''&&Object.values(employees).filter(x=>String(x?.id)===String(e.id)).length===1;
        const dateOnly = text => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text || ''))) return null;
            const date = new Date(`${text}T00:00:00Z`);
            return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === text ? date : null;
        };
        const ymd = date => date.toISOString().slice(0,10);
        const addCalendarMonths = (dateText, months) => {
            const date = dateOnly(dateText); if (!date) return null;
            const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
            const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
            first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
            return ymd(first);
        };
        const addCalendarDays = (dateText, days) => { const date = dateOnly(dateText); if (!date) return null; date.setUTCDate(date.getUTCDate() + days); return ymd(date); };
        const todayTaipei = () => {
            const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
            const part = type => parts.find(p => p.type === type)?.value;
            return `${part('year')}-${part('month')}-${part('day')}`;
        };
         // 週年制特休：保留既有資料節點與已核准假單，特殊個人條件僅在核定後適用。
         // 法定級距依勞基法第 38 條；部分工時參照勞動部 2025-09-05 指引。
         const annualGrantForYears = years => years < 1 ? 3 : years === 1 ? 7 : years === 2 ? 10 : years < 5 ? 14 : years < 10 ? 15 : Math.min(30, years + 6);
         const roundLeaveUp = value => Number((Math.ceil((value - 0.00000001) * 8) / 8).toFixed(3));
         const getAnnualPolicy = emp => {
             const saved = emp?.annualLeavePolicy || {};
             const pattern = ['full-time','same-days-part-time','reduced-days'].includes(saved.workPattern) ? saved.workPattern : 'full-time';
             const validSeniority = !!dateOnly(saved.seniorityDate) && !!dateOnly(emp?.joinDate) && saved.seniorityDate <= emp.joinDate;
             return { seniorityDate:validSeniority ? saved.seniorityDate : emp?.joinDate,
                 workPattern:pattern, weeklyHours: saved.weeklyHours === undefined || saved.weeklyHours === '' ? null : Number(saved.weeklyHours),
                 fullTimeWeeklyHours: saved.fullTimeWeeklyHours === undefined || saved.fullTimeWeeklyHours === '' ? 40 : Number(saved.fullTimeWeeklyHours),
                 note:saved.note || '', hasInvalidSeniority:!!saved.seniorityDate && !validSeniority,
                 hasInvalidPattern:!!saved.workPattern && !['full-time','same-days-part-time','reduced-days'].includes(saved.workPattern) };
         };
         const calculateLegalLeaveGrant = (emp, originalGrant) => {
             const policy = getAnnualPolicy(emp);
             if (policy.workPattern !== 'reduced-days') return { days:originalGrant, ratio:1, review:policy.hasInvalidSeniority || policy.hasInvalidPattern };
             const { weeklyHours, fullTimeWeeklyHours } = policy;
             if (!Number.isFinite(weeklyHours) || !Number.isFinite(fullTimeWeeklyHours) || weeklyHours <= 0 || fullTimeWeeklyHours <= 0 || weeklyHours > fullTimeWeeklyHours) {
                 return { days:originalGrant, ratio:1, review:true };
             }
             const ratio = weeklyHours / fullTimeWeeklyHours;
             // 以 1/8 日向上取整，避免僅因顯示/進位而低於依工時比例計給的時數。
             return { days:roundLeaveUp(originalGrant * ratio), ratio, review:false };
         };
         const annualPeriodsThrough = (employeeOrJoinDate, throughDate) => {
             const emp = typeof employeeOrJoinDate === 'string' ? { joinDate:employeeOrJoinDate } : employeeOrJoinDate;
             const actualJoin = emp?.joinDate;
             const policy = getAnnualPolicy(emp);
             const anchor = policy.seniorityDate;
             if (!dateOnly(actualJoin) || !dateOnly(anchor) || !dateOnly(throughDate) || throughDate < actualJoin) return [];
             const periods = [];
             const append = (start,end,rawGrant,years) => {
                 if (!start || !end || end <= actualJoin || start > throughDate) return;
                 const calculated = calculateLegalLeaveGrant(emp,rawGrant);
                 periods.push({ start, end, grant:calculated.days, standardGrant:rawGrant, ratio:calculated.ratio, needsReview:calculated.review, years });
             };
             append(addCalendarMonths(anchor,6),addCalendarMonths(anchor,12),3,0.5);
             for (let years=1; years<=100; years++) {
                 const start = addCalendarMonths(anchor,years*12);
                 if (start > throughDate) break;
                 append(start,addCalendarMonths(anchor,(years+1)*12),annualGrantForYears(years),years);
             }
             return periods;
         };
         const annualPeriodUsage = (empId, period, sourceRequests = requests) => {
             let used = 0, needsReview = false;
             for (const request of Object.values(sourceRequests || {})) {
                 if (String(request?.empId) !== String(empId) || request.type !== '特休' || request.status !== 'approved') continue;
                 const start = request.date, end = request.endDate || request.date;
                 if (!dateOnly(start) || !dateOnly(end)) { needsReview = true; continue; }
                 if (end < period.start || start >= period.end) continue;
                 if (start < period.start || end >= period.end) { needsReview = true; continue; }
                 const days = Number(request.days);
                 if (!Number.isFinite(days) || days <= 0) { needsReview = true; continue; }
                 used += days;
             }
             return { used:Number(used.toFixed(3)), needsReview };
         };
         // 舊 stats.annual 只有總數而無年份及日期，數值相同不等於可證明來源相同。
         // 只允許使用者明確選擇歸屬後核定；同時保留核對時的假單指紋供後續覆核。
         const annualApprovedEvidence = (empId, period, sourceRequests = requests) => {
             if (!period) return [];
             return Object.entries(sourceRequests || {}).filter(([,r]) =>
                 r && String(r.empId) === String(empId) && r.type === '特休' && r.status === 'approved' &&
                 dateOnly(r.date) && dateOnly(r.endDate || r.date) && r.date >= period.start &&
                 (r.endDate || r.date) < period.end && Number.isFinite(Number(r.days)) && Number(r.days) > 0
             ).map(([key,r]) => ({key, date:r.date, endDate:r.endDate || r.date, days:Number(r.days)}))
              .sort((a,b) => String(a.key).localeCompare(String(b.key)));
         };
         const auditLegacyReview = (emp, period, adjustment, sourceRequests = requests) => {
             const rawValue=emp?.stats?.annual;
             const legacy = rawValue === undefined || rawValue === null || rawValue === '' ? 0 : Number(rawValue);
             const audit = adjustment?.legacyReconciliation;
             if (!Number.isFinite(legacy) || legacy < 0) return {required:true, valid:false, reason:'舊已休統計數值異常，需核對原始紀錄'};
             if (legacy === 0 && !audit) return {required:false, valid:true, legacy:0};
             if (!audit || audit.version !== 1 || !['included','separate','historical','manual'].includes(audit.disposition))
                 return {required:true, valid:false, legacy, reason:`舊統計 ${legacy} 天缺乏可核對的期別與假單重疊依據`};
             if (Number(audit.legacyValue) !== legacy || audit.periodStart !== period.start || audit.periodEnd !== period.end)
                 return {required:true, valid:false, legacy, reason:'舊已休統計或期別與上次核定不同，需重新核對'};
             if (!Number.isFinite(Number(adjustment?.additionalUsedDays)) || Math.abs(Number(adjustment.additionalUsedDays) - Number(audit.additionalUsedDays)) > 0.001)
                 return {required:true, valid:false, legacy, reason:'額外已休天數在核定後變更，需重新核對'};
             // Firebase Realtime Database does not preserve an empty array as a
             // persistent tree node. A verified zero-request baseline must not be
             // treated as missing evidence after reading back the reconciliation.
             // Non-zero/malformed evidence, however, must never be silently waived.
             const recordedUsed = Number(audit.approvedUsedAtReview);
             const recordedAt = Number(audit.confirmedAt);
             const rawRows = audit.approvedEvidence;
             const hasZeroRows = (rawRows == null || (typeof rawRows === 'object' &&
                 !Array.isArray(rawRows) && Object.keys(rawRows).length === 0)) &&
                 recordedUsed === 0 && Number.isFinite(recordedAt) && recordedAt > 0 &&
                 (audit.approvedEvidenceCount == null || Number(audit.approvedEvidenceCount) === 0);
             const baselineRows = Array.isArray(rawRows) ? rawRows : hasZeroRows ? [] : null;
             if (!baselineRows || typeof audit.evidence !== 'string' || !audit.evidence.trim() ||
                 !Number.isFinite(recordedUsed) || recordedUsed < 0 ||
                 (audit.approvedEvidenceCount != null && Number(audit.approvedEvidenceCount) !== baselineRows.length))
                 return {required:true, valid:false, legacy, reason:'上次核定的證據紀錄不完整'};
             const seenRowKeys = new Set();
             let baselineTotal = 0;
             for (const row of baselineRows) {
                 if (!row || typeof row.key !== 'string' || !row.key || seenRowKeys.has(row.key) ||
                     !dateOnly(row.date) || !dateOnly(row.endDate) ||
                     row.date < period.start || row.endDate >= period.end || row.date > row.endDate ||
                     !Number.isFinite(Number(row.days)) || Number(row.days) <= 0) {
                     return {required:true, valid:false, legacy, reason:'上次核定的假單快照內容不完整，需核對'};
                 }
                 seenRowKeys.add(row.key);
                 baselineTotal += Number(row.days);
             }
             if (Math.abs(baselineTotal - recordedUsed) > 0.001)
                 return {required:true, valid:false, legacy, reason:'上次核定假單明細與已休合計不一致，需核對'};
             if (audit.disposition === 'included') {
                 const totalAtReview=audit.confirmedTotalDays===undefined||audit.confirmedTotalDays===null ? legacy : Number(audit.confirmedTotalDays);
                 if (!Number.isFinite(totalAtReview)||totalAtReview<0||Math.abs(Number(audit.approvedUsedAtReview)+Number(audit.additionalUsedDays)-totalAtReview)>0.001)
                     return {required:true,valid:false,legacy,reason:'已核定的本期累計已休與補認列日數不符，需重新核對'};
             }
             // Protect the reconciled baseline while allowing ordinary newly-approved future leave.
             // Do not double-count those new approvals in the original cumulative legacy total.
             const baseline = baselineRows;
             const currentEvidence = annualApprovedEvidence(emp.id,period,sourceRequests);
             const oldByKey = new Map(baseline.map(item => [item.key,item]));
             for (const saved of baseline) {
                 const live = sourceRequests?.[saved.key];
                 if (!live || live.status !== 'approved' || live.type !== '特休' ||
                     live.date !== saved.date || (live.endDate || live.date) !== saved.endDate ||
                     Number(live.days) !== Number(saved.days)) {
                     return {required:true,valid:false,legacy,reason:'已核定的歷史假單被更改或作廢，需要重新核對'};
                 }
             }
             const postReview = currentEvidence.filter(row => !oldByKey.has(row.key));
             const confirmedAt = Number(audit.confirmedAt);
             const approvedDate = Number.isFinite(confirmedAt) && confirmedAt > 0
                 ? new Date(confirmedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'})
                 : null;
             for (const fresh of postReview) {
                 const live = sourceRequests?.[fresh.key];
                 // For an explicitly verified historical-only legacy total, newly
                 // approved leave inside the current period cannot overlap that old
                 // total. It is always debited from the current period instead.
                 if (audit.disposition === 'historical') continue;
                 // Backdated approvals may have already been included in legacy totals.
                 if (!approvedDate || !Number.isFinite(Number(live?.approvedAt)) ||
                     Number(live.approvedAt) < confirmedAt || fresh.date < approvedDate) {
                     return {required:true,valid:false,legacy,
                         reason:'核定後新增較早日期／來源不明的已核准假單，可能與舊已休重疊，需再對帳'};
                 }
             }
             return {required:true,valid:true,legacy,audit,postReviewCount:postReview.length,
                 newlyApprovedDays:Number(postReview.reduce((sum,row)=>sum+Number(row.days),0).toFixed(3))};
         };
         const annualLeaveState = (emp, asOf = todayTaipei(), sourceRequests = requests) => {
             if (!employeeIdentityIsUnique(emp)) return { pending:true, reason:'員工編號缺漏或重複，假勤歸屬待核對', grant:null, period:null, unsettled:[] };
             if (!dateOnly(emp?.joinDate)) return { pending:true, reason:'到職日未設定或格式不正確', grant:null, period:null, unsettled:[] };
             const policy = getAnnualPolicy(emp);
             if (policy.hasInvalidSeniority) return { pending:true, reason:'年資認列起算日無效或晚於到職日', grant:null, period:null, unsettled:[] };
             const periods = annualPeriodsThrough(emp, asOf);
             if (!periods.length) return { pending:false, reason:'尚未取得本次特休資格', grant:0, remaining:0, period:null, unsettled:[] };
             let carryIn = 0;
             const unsettled = [];
             let state;
             for (let index=0; index<periods.length; index++) {
                 const period = periods[index];
                 const usage = annualPeriodUsage(emp.id, period, sourceRequests);
                 const adjustment = emp.annualLeaveAdjustments?.[period.start];
                 const legacyAudit = index === periods.length - 1 ? auditLegacyReview(emp,period,adjustment,sourceRequests) : {required:false,valid:true};
                 const legacyNeedsReview = legacyAudit.required && !legacyAudit.valid;
                 const extraUsed = Number(adjustment?.additionalUsedDays || 0);
                 const extraGranted = Number(adjustment?.additionalGrantedDays || 0);
                 const granted = Number((period.grant + extraGranted).toFixed(3));
                 const remaining = Number((granted + carryIn - usage.used - extraUsed).toFixed(3));
                 const usedTotal = usage.used + extraUsed;
                 const priorCarryUnused = Number(Math.max(0, carryIn - usedTotal).toFixed(3));
                 const currentGrantUnused = Number(Math.max(0, granted - Math.max(0, usedTotal - carryIn)).toFixed(3));
                 const reviewReasons = [];
                 if (usage.needsReview) reviewReasons.push('有跨週年或日期／日數異常的已核准特休假單，需按期分攤');
                 if (legacyNeedsReview) reviewReasons.push(legacyAudit.reason);
                 if (period.needsReview) reviewReasons.push('個人年資或工時條件無效，需核定');
                 if (index === periods.length - 1 && !!emp.annualLeaveReviewRequired) reviewReasons.push('到職日或個人條件已更動，本期尚待重新核定');
                 if (!Number.isFinite(extraUsed) || extraUsed < 0 || !Number.isFinite(extraGranted) || extraGranted < 0)
                     reviewReasons.push('本期個別加給／額外已休數字異常');
                 if (remaining < -0.001) reviewReasons.push('依現有紀錄試算為負數，請核對假單與加給');
                 const pending = reviewReasons.length > 0;
                 state = { period, grant:granted, legalGrant:period.grant, standardGrant:period.standardGrant,
                     extraGranted, approvedUsed:usage.used, additionalUsed:extraUsed, carryIn, remaining,
                     priorCarryUnused, currentGrantUnused, pending,
                     reason:reviewReasons.join('；'), reviewReasons, unsettled };
                 if (index < periods.length - 1) {
                     const closure = emp.annualLeaveClosures?.[period.start];
                     if (closure && (!Number.isFinite(Number(closure.paidDays)) || !Number.isFinite(Number(closure.carryDays)) ||
                         Math.abs(Number(closure.paidDays) + Number(closure.carryDays) - remaining) > 0.001)) unsettled.push(period.start);
                     // 2026-09-27 為原系統歷史切點；舊期不自動視為未休並遞延。
                     if (period.end > '2026-09-27' && (pending || (remaining > 0 && !closure))) unsettled.push(period.start);
                     carryIn = Number(closure?.carryDays || 0);
                     if (!Number.isFinite(carryIn) || carryIn < 0) { carryIn = 0; unsettled.push(period.start); }
                 }
             }
             if (unsettled.length) {
                 // Previous-period payment/settlement is an HR task, not necessarily
                 // a reason to freeze a separately granted current-year leave quota.
                 // No unverified carry-forward is silently imported (carryIn stays zero).
                 state.settlementReviewRequired = true;
                 state.settlementReviewReason = `前期特休 ${new Set(unsettled).size} 期尚待結算／遞延核對（不自動遞延）`;
             }
             if (policy.seniorityDate.endsWith('-02-29')) {
                 state.pending = true;
                 state.reviewReasons.push('2/29 年資起算日的非閏年週年須人工核對');
             }
             state.reason = state.reviewReasons.join('；');
             return state;
         };


return annualLeaveState(emp,asOf,requests);
}
