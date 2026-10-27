(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./campus-core.js'),require('./schedule-core.js'));else root.SyncCore=factory(root.CampusCore,root.ScheduleCore)})(typeof globalThis!=='undefined'?globalThis:this,(C,S)=>{
 'use strict';
 const MAX_BYTES=2*1024*1024,MAX_CODE=Math.ceil(MAX_BYTES/3)*4+40,BACKUP_KEY='campushub-sync-backup-v1';
 const fail=message=>{throw Error(message)},object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 function str(v,max,label,required=false){if(v===undefined&&!required)return '';if(typeof v!=='string'||v.length>max||required&&!v.trim())fail(`${label}格式不正确。`);return v;}
 function list(v,max,label){if(v===undefined)return [];if(!Array.isArray(v)||v.length>max)fail(`${label}数量或格式不正确。`);return v;}
 function id(v){if(typeof v!=='string'||! /^[a-z\d_-]{1,128}$/i.test(v))fail('记录标识不正确。');return v;}
 function unique(items,key,label){const seen=new Set();for(const item of items){const k=key(item);if(seen.has(k))fail(`${label}存在重复记录。`);seen.add(k)}return items;}
 function color(v){if(v===undefined)return 0;if(!Number.isInteger(v)||v<0||v>4)fail('科目颜色不正确。');return v;}
 function course(v){if(!C.validCourse(v)||v!==v.trim())fail('科目名称不正确。');return v;}
 function meta(v={}){if(!object(v))fail('科目备注格式不正确。');return {note:str(v.note,1000,'科目备注'),color:color(v.color)};}
 function url(v){if(typeof v!=='string'||v.length>8192||!C.url(v))fail('网站地址不正确，仅支持 HTTP / HTTPS。');return C.url(v);}
 function binary(v,min,max){if(typeof v!=='string'||v.length>Math.ceil(max/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))fail('账密密文格式不正确。');const size=atob(v).length;if(size<min||size>max)fail('账密密文长度不正确。');return v;}
 function envelope(v){if(!object(v))fail('账密密文格式不正确。');return {iv:binary(v.iv,12,12),ciphertext:binary(v.ciphertext,16,32768)};}
 function vault(v){if(!object(v)||v.version!==1||v.iterations!==600000)fail('查看密码的加密信息不正确。');return {version:1,iterations:600000,salt:binary(v.salt,16,16),check:envelope(v.check),context:str(v.context??'campushub:device',256,'加密上下文',true)};}
 function sites(items,courses,withCredentials){return unique(list(items,3000,'网站').map(v=>{
  if(!object(v)||!courses.includes(v.course)&&v.course!=='公共资源')fail('网站所属科目不正确。');
  const s={id:id(v.id),name:str(v.name,100,'网站名称',true),url:url(v.url),course:v.course,note:str(v.note,2000,'网站备注'),purposes:C.cleanPurposes(v.purposes)};
  if(withCredentials&&v.credentials)s.credentials=envelope(v.credentials);return s;
 }),s=>s.id,'网站');}
 function tasks(items,courses,siteItems){return unique(list(items,5000,'任务').map(v=>{
  if(!object(v)||typeof v.done!=='boolean'||!C.validDue(v.due)||v.course&&!courses.includes(v.course))fail('任务格式或截止时间不正确。');
  const siteId=str(v.siteId,128,'关联网站'),t={id:id(v.id),title:str(v.title,100,'任务名称',true),course:v.course||'',due:v.due,siteId:siteId&&siteItems.some(s=>s.id===siteId&&(!v.course||s.course===v.course))?siteId:'',note:str(v.note,2000,'任务备注'),done:v.done};if(v.url)t.url=url(v.url);return t;
 }),t=>t.id,'任务');}
 function snapshot(input,{includeCredentials=true}={}){
  if(!object(input)||!Array.isArray(input.courses)||!Array.isArray(input.sites))fail('同步数据格式不正确。');
  const courses=unique(list(input.courses,200,'科目').map(course),n=>n.toLocaleLowerCase(),'科目'),courseMeta={};
  for(const [index,name] of courses.entries())courseMeta[name]=meta(Object.hasOwn(input.courseMeta||{},name)?input.courseMeta[name]:{color:(index+1)%5});
  const result={courses,courseMeta,sites:sites(input.sites,courses,includeCredentials)};
  if(input.siteOrder!==undefined){const activeIds=new Set(result.sites.map(s=>s.id));result.siteOrder=unique(list(input.siteOrder,3000,'网站顺序').map(id),v=>v,'网站顺序').filter(v=>activeIds.has(v));}
  result.tasks=tasks(input.tasks,courses,result.sites);
  result.schedule=unique(list(input.schedule,5000,'课程安排').map(v=>{
   if(!object(v)||!['weekly','once'].includes(v.repeat)||!['all','odd','even'].includes(v.pattern||'all'))fail('课程安排格式不正确。');
   const weekly=v.repeat==='weekly',item={id:id(v.id),title:str(v.title,200,'课程名称',true),location:str(v.location,500,'上课地点'),teacher:str(v.teacher,200,'教师'),startTime:str(v.startTime,5,'上课时间',true),endTime:str(v.endTime,5,'下课时间',true),repeat:v.repeat,weekday:weekly?v.weekday:1,startWeek:weekly?v.startWeek:1,endWeek:weekly?v.endWeek:1,pattern:v.pattern||'all',date:str(v.date,10,'上课日期'),color:color(v.color),note:str(v.note,2000,'课程备注')};
   const error=S.validateLesson(item);if(error)fail(error);if(v.importKey)item.importKey=str(v.importKey,2048,'日历记录标识');return item;
  }),l=>l.id,'课程安排');
  if(input.scheduleSettings!==undefined){const v=input.scheduleSettings;if(!object(v)||!Number.isInteger(v.weeks)||v.weeks<1||v.weeks>52)fail('学期设置不正确。');try{if(S.monday(v.semesterStart)!==v.semesterStart)throw Error()}catch{fail('学期开始日期必须为周一。')}result.scheduleSettings={semesterStart:v.semesterStart,weeks:v.weeks};}
  result.campusLinks=unique(list(input.campusLinks,500,'校园入口').map(v=>{if(!object(v)||!['教学教务','图书馆','网络缴费','生活服务','出行','其他'].includes(v.category))fail('校园入口分类不正确。');return {id:id(v.id),name:str(v.name,100,'入口名称',true),url:url(v.url),category:v.category,note:str(v.note,2000,'入口备注')};}),l=>l.id,'校园入口');
  result.archives=unique(list(input.archives,100,'学期档案').map(v=>{
   if(!object(v)||!C.validDue(v.createdAt)||typeof v.keptActive!=='boolean')fail('学期档案格式不正确。');
   const archiveCourses=unique(list(v.courses,200,'归档科目').map(c=>{if(!object(c))fail('归档科目格式不正确。');return {name:course(c.name),...meta(c)};}),c=>c.name.toLocaleLowerCase(),'归档科目'),names=archiveCourses.map(c=>c.name),archiveSites=sites(v.sites,names,includeCredentials);
   return {id:id(v.id),name:str(v.name,100,'档案名称',true),createdAt:v.createdAt,keptActive:v.keptActive,courses:archiveCourses,sites:archiveSites,tasks:tasks(v.tasks,names,archiveSites)};
  }),a=>a.id,'学期档案');
  if(includeCredentials&&input.vault)result.vault=vault(input.vault);
  if(counts(result).credentials&&!result.vault)fail('账密缺少查看密码的加密信息，请取消携带账密后重试。');
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_BYTES)fail('数据超过 2MB，暂时无法生成同步码。');
  return result;
 }
 function counts(s){return {courses:s.courses.length,sites:s.sites.length,tasks:(s.tasks||[]).length,schedule:(s.schedule||[]).length,campusLinks:(s.campusLinks||[]).length,archives:(s.archives||[]).length,credentials:[...s.sites,...(s.archives||[]).flatMap(a=>a.sites||[])].filter(s=>s.credentials).length};}
 // CRC detects incomplete or accidentally edited text. It is not encryption or a signature.
 const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 function checksum(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');}
 function encode(data,options={}){
  const payload={type:'campushub-sync',version:1,createdAt:new Date().toISOString(),data:snapshot(data,options)},bytes=new TextEncoder().encode(JSON.stringify(payload));
  if(bytes.length>MAX_BYTES)fail('数据超过 2MB，暂时无法生成同步码。');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `CHUB1.${btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}.${checksum(bytes)}`;
 }
 function decode(code){
  if(typeof code!=='string'||code.length>MAX_CODE*1.1)fail('同步码过长，最多支持 2MB 数据。');
  const compact=code.replace(/\s/g,''),match=/^CHUB1\.([A-Za-z0-9_-]+)\.([a-f\d]{8})$/i.exec(compact);
  if(compact.length>MAX_CODE||!match)fail('同步码格式不正确，请复制完整的 CHUB1 同步码。');
  let bytes;try{const base=match[1].replaceAll('-','+').replaceAll('_','/');bytes=Uint8Array.from(atob(base+'='.repeat((4-base.length%4)%4)),c=>c.charCodeAt(0));}catch{fail('同步码损坏，请重新复制。')}
  if(bytes.length>MAX_BYTES)fail('同步码数据超过 2MB。');if(checksum(bytes)!==match[2].toLowerCase())fail('同步码不完整或已被修改，请重新复制。');
  let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('无法读取同步码内容。')}
  if(payload?.type!=='campushub-sync'||payload.version!==1||typeof payload.createdAt!=='string'||!Number.isFinite(Date.parse(payload.createdAt)))fail('同步码版本或生成时间不正确。');
  return {createdAt:payload.createdAt,data:snapshot(payload.data)};
 }
 function backup(storage){let value;try{value=JSON.parse(storage.getItem(BACKUP_KEY));}catch{return null}if(!value||value.type!=='campushub-sync-backup'||value.version!==1)return null;return {createdAt:str(value.createdAt,40,'备份时间',true),data:snapshot(value.data)};}
 function replace(storage,key,next,current){
  const clean=snapshot(next),previous=snapshot(current),savedBackup=storage.getItem(BACKUP_KEY);
  const record=JSON.stringify({type:'campushub-sync-backup',version:1,createdAt:new Date().toISOString(),data:previous});
  storage.setItem(BACKUP_KEY,record);
  try{storage.setItem(key,JSON.stringify(clean));}catch(error){try{if(savedBackup===null)storage.removeItem(BACKUP_KEY);else storage.setItem(BACKUP_KEY,savedBackup)}catch{}throw error}
  return clean;
 }
 function restore(storage,key){const value=backup(storage);if(!value)fail('没有可恢复的导入前数据。');storage.setItem(key,JSON.stringify(value.data));try{storage.removeItem(BACKUP_KEY)}catch{}return value.data;}
 return {MAX_CODE,BACKUP_KEY,snapshot,counts,encode,decode,backup,replace,restore};
});
