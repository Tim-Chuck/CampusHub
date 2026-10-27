(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ScheduleCore=factory()})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const DAY=86400000;
 function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('日期格式不正确');const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('日期无效');return d;}
 function addDays(value,count){const d=date(value);d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10)}
 function monday(value){const d=date(value);return addDays(value,-((d.getUTCDay()+6)%7))}
 function diffDays(a,b){return Math.round((date(a)-date(b))/DAY)}
 function minutes(value){if(!/^\d{2}:\d{2}$/.test(value))return NaN;const [h,m]=value.split(':').map(Number);return h<24&&m<60?h*60+m:NaN;}
 function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
 function weekNumber(value,semester){return Math.floor(diffDays(monday(value),semester)/7)+1}
 function defaults(){const t=today(),year=Number(t.slice(0,4)),month=Number(t.slice(5,7));return {semesterStart:monday(month>=8?`${year}-09-01`:month===1?`${year-1}-09-01`:`${year}-02-16`),weeks:20};}
 function validateLesson(item){
  if(!item.title?.trim())return '请填写课程名称。';
  const start=minutes(item.startTime),end=minutes(item.endTime);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return '下课时间必须晚于上课时间。';
  if(item.repeat==='once'){try{date(item.date)}catch{return '请选择有效的上课日期。'}}
  else{
   if(!Number.isInteger(item.weekday)||item.weekday<1||item.weekday>7||!Number.isInteger(item.startWeek)||!Number.isInteger(item.endWeek)||item.startWeek<1||item.endWeek<item.startWeek||item.endWeek>52)return '请检查星期及起止周次（1—52 周）。';
   if(item.startWeek===item.endWeek&&(item.pattern==='odd'&&item.startWeek%2===0||item.pattern==='even'&&item.startWeek%2!==0))return '所选周次不包含指定的单周或双周。';
  }
  return null;
 }
 function lessonsForWeek(items,weekStart,semester){
  const week=weekNumber(weekStart,semester),last=addDays(weekStart,6),result=[];
  for(const item of items){
   if(item.repeat==='once'){if(item.date>=weekStart&&item.date<=last)result.push({...item,displayDate:item.date,displayDay:diffDays(item.date,weekStart)+1});}
   else if(week>=item.startWeek&&week<=item.endWeek&&(item.pattern!=='odd'||week%2===1)&&(item.pattern!=='even'||week%2===0))result.push({...item,displayDate:addDays(weekStart,item.weekday-1),displayDay:item.weekday});
  }
  return result.sort((a,b)=>a.displayDay-b.displayDay||a.startTime.localeCompare(b.startTime)||a.title.localeCompare(b.title,'zh-CN'));
 }
 function signature(item){return JSON.stringify([item.title.trim(),item.date,item.startTime,item.endTime,item.location?.trim()||''])}
 function importCandidates(existing,incoming){const keys=new Set(existing.map(i=>i.importKey).filter(Boolean)),signatures=new Set(existing.filter(i=>i.repeat==='once').map(signature));return incoming.map(item=>{const sig=signature(item),duplicate=Boolean(item.importKey&&keys.has(item.importKey))||signatures.has(sig);if(item.importKey)keys.add(item.importKey);signatures.add(sig);return {...item,duplicate};});}
 function layoutDay(items){
  const sorted=[...items].sort((a,b)=>minutes(a.startTime)-minutes(b.startTime)||minutes(b.endTime)-minutes(a.endTime));let group=[],end=-1;const result=[];
  function flush(){const ends=[];for(const item of group){let lane=ends.findIndex(v=>v<=minutes(item.startTime));if(lane<0)lane=ends.length;ends[lane]=minutes(item.endTime);item._lane=lane;}for(const item of group)result.push({...item,_lanes:ends.length});group=[];}
  for(const original of sorted){const item={...original};if(group.length&&minutes(item.startTime)>=end){flush();end=-1;}group.push(item);end=Math.max(end,minutes(item.endTime));}flush();return result;
 }
 function normalizeICSText(contents){
  if(typeof contents!=='string'||!contents.trim())throw Error('请粘贴已有的 ICS 代码。');
  if(contents.length>2*1024*1024)throw Error('ICS 文本不能超过 2MB。');
  let input=contents.replace(/^\uFEFF/,'').trim();
  const fenced=input.match(/^```(?:ics|ical|icalendar|text)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  if(fenced)input=fenced[1].trim();
  const normalized=input.replace(/\r\n|\r|\n/g,'\n'),lines=normalized.split('\n');
  if(lines[0]!=='BEGIN:VCALENDAR'||lines[lines.length-1]!=='END:VCALENDAR')throw Error('请粘贴完整 ICS 代码，以 BEGIN:VCALENDAR 开始、END:VCALENDAR 结束。');
  const ics=lines.join('\r\n')+'\r\n';
  if(new TextEncoder().encode(ics).length>2*1024*1024)throw Error('ICS 文本不能超过 2MB。');
  return ics;
 }
 return {date,addDays,monday,diffDays,minutes,today,weekNumber,defaults,validateLesson,lessonsForWeek,signature,importCandidates,layoutDay,normalizeICSText};
});
