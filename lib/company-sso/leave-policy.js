(function(root){
  'use strict';
  const definitions={
    '特休':{pay:'full',label:'工資照給',hint:'依到職日、週年期別及核對後餘額計算；特休由同仁排定，事由可留白。'},
    '病假':{pay:'review',label:'依年度病假累計核對',hint:'普通傷病假一年內未超過30日部分原則半薪；住院、已用日數及其他給付須另核對。2026年普通病假10日內不得不利處分；全勤獎金扣發須按病假日數比例。'},
    '事假':{pay:'unpaid',label:'原則不給工資',hint:'依實際請假工時試算；公司有較優約定時依約定辦理。'},
    '補休':{pay:'full',label:'工資照給',hint:'須有已成立的加班補休時數與補休期限；不從特休餘額扣除。'},
    '婚假':{pay:'full',label:'工資照給',hint:'法定8日；請依結婚日期核對請休期間。'},
    '喪假':{pay:'full',label:'工資照給',hint:'依親屬關係核對法定日數與請休期間。'},
    '公假':{pay:'full',label:'工資照給',hint:'依依法應給公假的事由與所需期間核對。'},
    '公傷病假':{pay:'review',label:'職災補償另行核對',hint:'依職業災害治療、休養及原領工資補償核對，不當作普通病假扣半薪。'},
    '生理假':{pay:'half',label:'原則半薪',hint:'每月1日；全年前3日不併入病假，其餘併入。不得影響全勤獎金或考績。'},
    '家庭照顧假':{pay:'unpaid',label:'原則不給工資',hint:'全年7日，併入事假；2026年可按小時請。不得影響全勤獎金或考績。'},
    '事假（家庭照顧）':{pay:'unpaid',label:'原則不給工資',hint:'親自照顧家庭成員而請事假可按小時請，依法不得因這項事由影響全勤獎金。'},
    '產檢假':{pay:'full',label:'工資照給',hint:'妊娠期間7日；不得影響全勤獎金或考績。'},
    '陪產檢及陪產假':{pay:'full',label:'工資照給',hint:'陪產檢與陪產合計7日；依配偶妊娠及分娩期間核對。'},
    '產假':{pay:'review',label:'依年資與產假條件核對',hint:'分娩產假按曆連續計算8星期；薪資依年資及適用規定核對。'},
    '流產假':{pay:'review',label:'依妊娠週期與年資核對',hint:'按曆連續計算；期間與薪資須按妊娠週期及適用規定核對。'},
    '安胎休養':{pay:'review',label:'依醫囑與病假累計核對',hint:'依醫師診斷核對休養期間及薪資；不得影響全勤獎金或考績。'},
    '育嬰留職停薪':{pay:'review',label:'留停期間另行核對',hint:'留停資格、期間、保險及津貼另行辦理，不當作一般事假扣薪。'},
    '其他':{pay:'review',label:'請由人事核對',hint:'請填假別名稱與適用依據，不自動判定薪資。'}
  };
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
  function minutesBetween(start,end){const toMinutes=t=>/^\d{2}:\d{2}$/.test(t||'')&&Number(t.slice(0,2))<24&&Number(t.slice(3))<60?Number(t.slice(0,2))*60+Number(t.slice(3)):NaN;const a=toMinutes(start),b=toMinutes(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;return Math.max(0,b-a-Math.max(0,Math.min(b,810)-Math.max(a,720)));}
  function validate(input){
    if(!Object.hasOwn(definitions,input.type))return '請選擇有效假別。';
    if(!validDate(input.date)||!validDate(input.endDate)||input.endDate<input.date)return '請確認有效的請假起訖日期。';
    if(!Number.isFinite(Number(input.days))||Number(input.days)<=0)return '請假天數或時數須大於0。';
    if(input.type!=='特休'&&!String(input.reason||'').trim())return '請簡述請假事由。';
    if(input.mode==='time'&&(input.date!==input.endDate||minutesBetween(input.start,input.end)<=0))return '小時請假請選同一天，結束時間須晚於開始時間且不全落於午休。';
    if(['產假','流產假','育嬰留職停薪'].includes(input.type)&&input.mode==='time')return '此假別請以日期區間填寫，期間由人事核對。';
    return '';
  }
  root.HGELeavePolicy=Object.freeze({definitions:Object.freeze(definitions),validDate,minutesBetween,validate,version:'2026-10-14'});
})(globalThis);
