(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./schedule-core.js'));else root.CampusCore=factory(root.ScheduleCore)})(typeof globalThis!=='undefined'?globalThis:this,S=>{
 const purposes=['交作业','看网课','查资料','选课','其他'];
 const reserved=['home','timetable','tasks','campus','archives','all','公共资源','__proto__','constructor','prototype'];
 const clone=value=>structuredClone(value);
 function validCourse(name){return typeof name==='string'&&name.trim().length>0&&name.length<=30&&!reserved.includes(name.trim().toLocaleLowerCase())}
 function url(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
 function cleanPurposes(value){return Array.isArray(value)?[...new Set(value.filter(p=>purposes.includes(p)))]:[]}
 function orderedSites(sites,order=[]){const byId=new Map(sites.map(s=>[s.id,s])),result=[];for(const id of Array.isArray(order)?order:[]){if(byId.has(id)){result.push(byId.get(id));byId.delete(id)}}for(const s of sites)if(byId.has(s.id)){result.push(s);byId.delete(s.id)}return result;}
 function reorderSubset(all,visible,source,target,after=false){
  const visibleSet=new Set(visible),current=all.filter(id=>visibleSet.has(id));
  if(source===target||!current.includes(source)||!current.includes(target))return [...all];
  current.splice(current.indexOf(source),1);current.splice(current.indexOf(target)+(after?1:0),0,source);let index=0;
  return all.map(id=>visibleSet.has(id)?current[index++]:id);
 }
 function localNow(instant=new Date()){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);const p=Object.fromEntries(parts.map(i=>[i.type,i.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
 function validDue(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;try{S.date(value.slice(0,10));return Number.isFinite(S.minutes(value.slice(11)))}catch{return false}}
 function validateTask(item,courses,sites){if(!item.title?.trim()||item.title.length>100)return '请填写任务名称（最多 100 字）。';if(!validDue(item.due))return '请选择有效的截止日期和时间。';if(item.url&&(item.url.length>8192||!url(item.url)))return '任务网址须为有效的 HTTP / HTTPS 地址。';if(item.course&&!courses.includes(item.course))return '请选择现有科目，或选择校园待办。';if(item.siteId&&!sites.some(s=>s.id===item.siteId&&(!item.course||s.course===item.course)))return '关联网站已变更，请重新选择。';return null}
 // Notice recognition is local and conservative: ambiguous dates remain selectable.
 function parseNotice(input,now=localNow()){
  if(typeof input!=='string'||!input.trim())throw Error('请先粘贴通知内容。');
  if(input.length>2000)throw Error('通知最多支持 2000 字，请保留相关段落。');
  const original=input.trim(),text=original.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/：/g,':');
  const links=[];
  const datesText=text.replace(/(?:https?:\/\/|www\.)[^\s<>"'，。；！？、（）【】「」]+|(?<![\w@.-])(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:com|cn|net|org|edu|gov|io|app|xyz|top)(?![a-z\d-])(?:[/?#][^\s<>"'，。；！？、（）【】「」]*)?/gi,raw=>{
   let value=raw.replace(/[.,;!?:\]}]+$/g,'');
   while(value.endsWith(')')&&(value.match(/\)/g)||[]).length>(value.match(/\(/g)||[]).length)value=value.slice(0,-1);
   const normalized=url(/^https?:\/\//i.test(value)?value:'https://'+value);
   if(normalized&&!links.includes(normalized))links.push(normalized);
   return ' '.repeat(raw.length);
  });
  const today=now.slice(0,10),year=Number(today.slice(0,4)),dates=[],warnings=[];
  const re=/(?:(\d{4})\s*(?:年|[-/.])\s*)?(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日|号)?|今天|今晚|明天|明晚|后天|(?:本|这|下)?(?:周|星期)[一二三四五六日天]/g;
  let match;
  while((match=re.exec(datesText))){
   if(dates.length&&!match[2]&&/(周|星期)/.test(match[0])&&/^[\s（(]*$/.test(datesText.slice(dates.at(-1).end,match.index)))continue;
   if(datesText[match.index-1]==='下'&&match[0].startsWith('下')||datesText[match.index-1]==='大'&&match[0]==='后天')continue;
   let day;
   if(match[2])day=`${match[1]||year}-${String(Number(match[2])).padStart(2,'0')}-${String(Number(match[3])).padStart(2,'0')}`;
   else if(['今天','今晚','明天','明晚','后天'].includes(match[0]))day=S.addDays(today,{今天:0,今晚:0,明天:1,明晚:1,后天:2}[match[0]]);
   else {const weekday='一二三四五六日'.indexOf(match[0].slice(-1).replace('天','日'));day=S.addDays(S.monday(today),weekday+(match[0].startsWith('下')?7:0));}
   try{S.date(day)}catch{warnings.push(`“${match[0]}”不是有效日期，请手动填写。`);continue;}
   dates.push({day,index:match.index,end:re.lastIndex,label:match[0],score:0});
  }
  for(const marker of datesText.matchAll(/截止|截至|最晚|最后期限|交齐|提交期限|报名结束/g)){
   const nearest=dates.map(d=>({d,distance:marker.index<d.index?d.index-(marker.index+marker[0].length):marker.index-d.end})).filter(x=>x.distance>=-10&&x.distance<36&&!/[。\n]/.test(datesText.slice(Math.min(x.d.end,marker.index),Math.max(x.d.index,marker.index)))).sort((a,b)=>a.distance-b.distance)[0];
   if(nearest)nearest.d.score+=100;
  }
  const number=value=>/^\d+$/.test(value)?Number(value):value==='半'?30:value.includes('十')?((value.split('十')[0]? '零一二三四五六七八九'.indexOf(value.split('十')[0]):1)*10+('零一二三四五六七八九'.indexOf(value.split('十')[1]||'零'))):'零一二三四五六七八九两'.indexOf(value)===10?2:'零一二三四五六七八九'.indexOf(value);
  const candidates=[];
  for(let i=0;i<dates.length;i++){
   const d=dates[i],tail=datesText.slice(d.end,Math.min(d.end+45,dates[i+1]?.index??Infinity)).split(/[。\n；;]/)[0];
   const clock=tail.match(/(?<!\d)(凌晨|早上|上午|中午|下午|晚上|晚间|傍晚|晚)?\s*(\d{1,2}|[零一二三四五六七八九十两]{1,3})(?::(\d{2})(?!\d)|[点时](?:(半)|([零一二三四五六七八九十两\d]{1,3})分?)?)/);
   let hour=23,minute=59,assumedTime=!clock,day=d.day;
   if(clock){hour=number(clock[2]);minute=clock[3]?Number(clock[3]):clock[4]?30:clock[5]?number(clock[5]):0;
    if((['下午','晚上','晚间','傍晚','晚'].includes(clock[1])||['今晚','明晚'].includes(d.label))&&hour<12)hour+=12;
    if((['晚上','晚间','晚'].includes(clock[1])||['今晚','明晚'].includes(d.label))&&hour===12){day=S.addDays(day,1);hour=0;}
    if(clock[1]==='中午'&&hour<11)hour+=12;if(clock[1]==='凌晨'&&hour===12)hour=0;
    if(hour===24&&minute===0){day=S.addDays(day,1);hour=0;}
   }
   const due=`${day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
   if(!validDue(due)){warnings.push(`“${d.label}”附近的时间无效，请手动填写。`);continue;}
   const existing=candidates.find(c=>c.due===due);
   if(existing){existing.score+=d.score;continue;}
   candidates.push({due,label:d.label+(clock?' '+clock[0].trim():''),assumedTime,score:d.score});
  }
  const ranked=[...candidates].sort((a,b)=>b.score-a.score),selected=ranked.length===1?ranked[0]:ranked[0]?.score>0&&ranked[0].score>ranked[1]?.score?ranked[0]:null;
  if(!candidates.length)warnings.push('未识别到有效日期，请手动填写截止时间。');
  else if(!selected)warnings.push('识别到多个日期，请选择真正的截止时间。');
  else if(!selected.score)warnings.push('请确认识别到的日期是否为截止日期。');
  if(selected?.assumedTime)warnings.push('通知未写明具体时刻，暂填 23:59，请确认。');
  if(selected&&selected.due<now)warnings.push('识别到的时间已过去，请核对年份或日期。');
  if(!links.length)warnings.push('未识别到 HTTP / HTTPS 网址，可稍后手动填写。');
  const title=original.split(/\r?\n/).map(v=>v.trim()).find(v=>v&&!/^(?:https?:\/\/|www\.)/i.test(v))||'通知待办';
  return {title:title.slice(0,100),note:original,links,candidates,due:selected?.due||'',warnings};
 }
 function taskStatus(item,now=localNow()){if(item.done)return '已完成';if(item.due<now)return '已逾期';return item.due.slice(0,10)===now.slice(0,10)?'今天截止':'待完成'}
 function upcoming(tasks,now=localNow()){const until=S.addDays(now.slice(0,10),7)+'T23:59';return tasks.filter(t=>!t.done&&validDue(t.due)&&t.due<=until).sort((a,b)=>a.due.localeCompare(b.due))}
 function todayLessons(state,now=localNow()){const today=now.slice(0,10),settings=state.scheduleSettings||S.defaults();return S.lessonsForWeek(state.schedule||[],S.monday(today),settings.semesterStart).filter(i=>i.displayDate===today&&i.endTime>now.slice(11))}
 function shareUrl(value){const normalized=url(value);if(!normalized)return null;const u=new URL(normalized);for(const key of [...u.searchParams.keys()])if(/^(password|passwd|pwd|token|access_token|refresh_token|authorization|secret|api_key)$/i.test(key))u.searchParams.delete(key);return u.href}
 function makePack(state,names){const selected=[...new Set(names)].filter(n=>state.courses.includes(n));if(!selected.length)throw Error('请至少选择一门科目。');return {type:'campushub-course-pack',version:1,courses:selected.map(name=>({name,note:state.courseMeta?.[name]?.note||'',color:Number(state.courseMeta?.[name]?.color)||0,sites:orderedSites(state.sites,state.siteOrder).filter(s=>s.course===name).map(s=>({name:s.name,url:shareUrl(s.url),note:s.note||'',purposes:cleanPurposes(s.purposes)})).filter(s=>s.url)}))}}
 function parsePack(text){
  if(typeof text!=='string'||text.length>1024*1024)throw Error('科目包不能超过 1MB。');let input;try{input=JSON.parse(text)}catch{throw Error('文件不是有效的 JSON 科目包。')}
  if(input?.type!=='campushub-course-pack'||input.version!==1||!Array.isArray(input.courses)||!input.courses.length||input.courses.length>100)throw Error('请选择 CampusHub 导出的科目包（最多 100 门科目）。');
  const names=new Set();let total=0;const textField=(v,max)=>typeof v==='string'?v.slice(0,max):'';
  const courses=input.courses.map(c=>{if(!c||!validCourse(c.name)||names.has(c.name.trim().toLocaleLowerCase())||!Array.isArray(c.sites))throw Error('科目名称或网站列表不正确。');const name=c.name.trim();names.add(name.toLocaleLowerCase());total+=c.sites.length;if(total>1000)throw Error('单个科目包最多包含 1000 个网站。');return {name,note:textField(c.note,120),color:Number.isInteger(c.color)&&c.color>=0&&c.color<5?c.color:0,sites:c.sites.map(s=>{if(!s||typeof s.name!=='string'||!s.name.trim()||s.name.length>60||!url(s.url))throw Error('科目包中包含无效的网站名称或地址。');return {name:s.name.trim(),url:shareUrl(s.url),note:textField(s.note,200),purposes:cleanPurposes(s.purposes)}})}});
  return {type:'campushub-course-pack',version:1,courses};
 }
 function mergePack(state,pack,names,id){const next=clone(state);next.courseMeta||={};let courses=0,sites=0,duplicates=0;for(const c of pack.courses.filter(c=>names.includes(c.name))){const existing=next.courses.find(n=>n.toLocaleLowerCase()===c.name.toLocaleLowerCase()),name=existing||c.name;if(!existing){next.courses.push(name);next.courseMeta[name]={note:c.note,color:c.color};courses++}for(const s of c.sites){if(next.sites.some(old=>old.course===name&&url(old.url)===url(s.url))){duplicates++;continue}next.sites.push({id:id(),name:s.name,url:s.url,note:s.note,course:name,purposes:cleanPurposes(s.purposes)});sites++}}return {next,courses,sites,duplicates}}
 function archive(state,{name,names,keepActive=true},id,createdAt=localNow()){
  const selected=[...new Set(names)].filter(n=>state.courses.includes(n));if(!name?.trim()||name.length>60)throw Error('请填写档案名称（最多 60 字）。');if(!selected.length)throw Error('请至少选择一门科目。');
  const next=clone(state),snapshot={id:id(),name:name.trim(),createdAt,keptActive:keepActive,courses:selected.map(n=>({name:n,...clone(state.courseMeta?.[n]||{})})),sites:clone(orderedSites(state.sites,state.siteOrder).filter(s=>selected.includes(s.course))),tasks:clone((state.tasks||[]).filter(t=>selected.includes(t.course)))};next.courseMeta||={};
  (next.archives||=[]).unshift(snapshot);
  if(!keepActive){next.courses=next.courses.filter(n=>!selected.includes(n));next.sites=next.sites.filter(s=>!selected.includes(s.course));next.tasks=(next.tasks||[]).filter(t=>!selected.includes(t.course));for(const n of selected)delete next.courseMeta[n];}
  return next;
 }
 function restore(state,snapshot,names,withTasks,id){
  const next=clone(state);next.courseMeta||={};next.tasks||=[];let courses=0,sites=0,tasks=0,credentialsSkipped=0;const siteMap=new Map();
  for(const c of snapshot.courses.filter(c=>names.includes(c.name))){
   const existing=next.courses.find(n=>n.toLocaleLowerCase()===c.name.toLocaleLowerCase()),name=existing||c.name;
   if(!existing){next.courses.push(name);next.courseMeta[name]={note:c.note||'',color:c.color||0};courses++}
   for(const s of snapshot.sites.filter(s=>s.course===c.name)){
    const duplicate=next.sites.find(old=>old.course===name&&(old.id===s.id||url(old.url)===url(s.url)));
    if(duplicate){siteMap.set(s.id,duplicate.id);continue}
    const copy={...clone(s),course:name};
    if(next.sites.some(old=>old.id===copy.id)){copy.id=id();if(copy.credentials){delete copy.credentials;credentialsSkipped++;}}
    next.sites.push(copy);siteMap.set(s.id,copy.id);sites++;
   }
   if(withTasks)for(const t of snapshot.tasks.filter(t=>t.course===c.name)){
    if(next.tasks.some(old=>old.course===name&&(old.id===t.id||old.title===t.title&&old.due===t.due)))continue;
    next.tasks.push({...clone(t),id:next.tasks.some(old=>old.id===t.id)?id():t.id,course:name,siteId:siteMap.get(t.siteId)||''});tasks++;
   }
  }
  return {next,courses,sites,tasks,credentialsSkipped};
 }
 return {purposes,reserved,validCourse,url,cleanPurposes,orderedSites,reorderSubset,localNow,validDue,validateTask,parseNotice,taskStatus,upcoming,todayLessons,makePack,parsePack,mergePack,archive,restore};
});
