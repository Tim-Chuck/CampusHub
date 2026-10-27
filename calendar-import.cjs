const ical=require('node-ical');const dns=require('node:dns/promises');const net=require('node:net');const http=require('node:http');const https=require('node:https');const {createHash}=require('node:crypto');const S=require('./schedule-core.js');
const MAX_BYTES=2*1024*1024;
function publicAddress(address){
 const version=net.isIP(address);
 if(version===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(version===6){const a=address.toLowerCase();return /^[23][\da-f]{0,3}:/.test(a)&&!a.startsWith('2001:db8:')&&!a.startsWith('2001:0:')&&!a.startsWith('2001::')&&!a.startsWith('2002:');}
 return false;
}
function remoteURL(value){
 const text=String(value||'').trim().replace(/^webcal:\/\//i,'https://');let url;try{url=new URL(text)}catch{throw Error('请输入完整的 http、https 或 webcal 日历订阅链接。')}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('仅支持不含用户名密码的公开 HTTP/HTTPS 日历地址。');
 if(url.hostname==='localhost'||url.hostname.endsWith('.localhost')||net.isIP(url.hostname.replace(/^\[|\]$/g,''))&&!publicAddress(url.hostname.replace(/^\[|\]$/g,'')))throw Error('请使用公开的日历订阅地址，不能导入本机或内网地址。');
 return url;
}
async function downloadCalendar(value,redirects=0,deadline=Date.now()+15000){
 const url=remoteURL(value);if(redirects>4||Date.now()>deadline)throw Error('获取日历超时或重定向过多。');
 let addresses;try{addresses=await Promise.race([dns.lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('DNS_TIMEOUT')),Math.max(1,deadline-Date.now()));timer.unref();})]);}catch{throw Error('无法解析日历网站地址，请检查链接。');}
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('日历地址指向内网或保留地址，无法导入。');
 const target=addresses.find(a=>a.family===4)||addresses[0];
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).get(url,{agent:false,family:target.family,autoSelectFamily:false,lookup:(_host,_options,callback)=>callback(null,target.address,target.family),headers:{Accept:'text/calendar, text/plain;q=0.8','User-Agent':'CampusHub-Calendar-Importer/0.1','Accept-Encoding':'identity'}},response=>{
   if([301,302,303,307,308].includes(response.statusCode)){const location=response.headers.location;response.resume();if(!location)return reject(Error('日历跳转地址缺失。'));let next;try{next=new URL(location,url).href}catch{return reject(Error('日历跳转地址无效。'))}downloadCalendar(next,redirects+1,deadline).then(resolve,reject);return;}
   if(response.statusCode!==200){response.resume();return reject(Error(`日历网站返回 ${response.statusCode}，请检查链接是否可直接下载或需要登录。`));}
   if(Number(response.headers['content-length'])>MAX_BYTES){response.destroy();return reject(Error('日历文件超过 2MB，请缩小导出范围。'));}
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES)response.destroy(Error('日历文件超过 2MB。'));else chunks.push(chunk)});response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));response.on('error',reject);
  });
  const timer=setTimeout(()=>request.destroy(Error('获取日历超时，请稍后重试。')),Math.max(1,deadline-Date.now()));request.on('close',()=>clearTimeout(timer));request.on('error',error=>reject(error.message.includes('超时')?error:Error('无法读取日历，请确认是可直接访问的 .ics 订阅链接。')));
 });
}
const text=value=>String(value&&typeof value==='object'&&'val' in value?value.val:value||'');
function shanghaiParts(value){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
function parseCalendar(contents,from,to){
 if(typeof contents!=='string'||Buffer.byteLength(contents)>MAX_BYTES)throw Error('日历文件不能为空，且不能超过 2MB。');
 const input=contents.replace(/^\uFEFF/,'');if(!/^BEGIN:VCALENDAR\s*$/im.test(input)||!/^END:VCALENDAR\s*$/im.test(input))throw Error('这个地址返回的不是 .ics 日历文件。请使用日历订阅或导出链接，而不是教务系统网页。');
 if(S.diffDays(to,from)<0||S.diffDays(to,from)>366)throw Error('导入日期范围须在 1 年以内。');
 if((input.match(/^BEGIN:VEVENT\s*$/gm)||[]).length>2000)throw Error('日历事件过多，请缩小导出范围。');
 if(/(?:^|;)FREQ=(?:SECONDLY|MINUTELY|HOURLY)(?:;|\s|$)/im.test(input.replace(/^RRULE:/gim,'')))throw Error('不支持每秒、每分钟或每小时重复的日历，请使用课程日历。');
 // RFC floating times are interpreted in the viewer's zone, fixed to Shanghai here.
 const normalized=input.replace(/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE)(:\d{8}T\d{6}(?:,\d{8}T\d{6})*)$/gm,'$1;TZID=Asia/Shanghai$2');
 const calendar=ical.sync.parseICS(normalized),events=[],warnings={allDay:0,overnight:0,cancelled:0,invalid:0};
 const windowStart=new Date(from+'T00:00:00+08:00'),windowEnd=new Date(to+'T23:59:59+08:00');
 for(const item of Object.values(calendar)){
  if(item.type!=='VEVENT'||!item.start)continue;
  if(item.status==='CANCELLED'){warnings.cancelled++;continue;}
  const occurrences=ical.expandRecurringEvent(item,{from:windowStart,to:windowEnd,includeOverrides:true,excludeExdates:true});
  for(const occurrence of occurrences){
   const event=occurrence.event;if(event.status==='CANCELLED'){warnings.cancelled++;continue;}
   if(occurrence.isFullDay||item.datetype==='date'){warnings.allDay++;continue;}
   if(!occurrence.start||!occurrence.end||!Number.isFinite(occurrence.start.getTime())||!Number.isFinite(occurrence.end.getTime())){warnings.invalid++;continue;}
   const start=shanghaiParts(occurrence.start),end=shanghaiParts(occurrence.end);
   if(start.date<from||start.date>to)continue;
   if(start.date!==end.date){warnings.overnight++;continue;}
   if(S.minutes(end.time)<=S.minutes(start.time)){warnings.invalid++;continue;}
   const title=text(occurrence.summary).trim().slice(0,100)||'未命名课程';
   const uid=text(item.uid)||title;
   events.push({title,repeat:'once',date:start.date,startTime:start.time,endTime:end.time,location:text(event.location).slice(0,150),teacher:'',note:text(event.description).slice(0,1000),color:events.length%5,importKey:createHash('sha256').update(uid+'|'+occurrence.start.toISOString()).digest('hex')});
   if(events.length>2000)throw Error('此范围内的课程超过 2000 节，请缩小日期范围。');
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
 return {events,warnings,calendarName:text(calendar.vcalendar?.['WR-CALNAME']||calendar.vcalendar?.['wr-calname']).slice(0,100)};
}
module.exports={parseCalendar,downloadCalendar,remoteURL,publicAddress};
