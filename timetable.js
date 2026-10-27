const Schedule=ScheduleCore;
let scheduleWeek=Schedule.monday(Schedule.today()),editingLesson=null,importPreview=null,importRequest=null,scheduleImportMode='calendar';
function scheduleItems(){if(!Array.isArray(state.schedule))state.schedule=[];return state.schedule}
function scheduleSettings(){if(!state.scheduleSettings)state.scheduleSettings=Schedule.defaults();return state.scheduleSettings}
function renderTimetable(){
 if(view!=='timetable')return;
 const settings=scheduleSettings(),items=Schedule.lessonsForWeek(scheduleItems(),scheduleWeek,settings.semesterStart),week=Schedule.weekNumber(scheduleWeek,settings.semesterStart);
 $('#scheduleWeekTitle').textContent=week>=1&&week<=settings.weeks?`第 ${week} 周`:'学期外';
 $('#scheduleWeekRange').textContent=scheduleWeek.replaceAll('-','.')+' — '+Schedule.addDays(scheduleWeek,6).slice(5).replace('-','.');
 $('#scheduleLessonCount').textContent=`本周 ${items.length} 节课`;
 const today=Schedule.today(),days=['周一','周二','周三','周四','周五','周六','周日'];
 $('#scheduleDays').innerHTML='<span class="time-zone-label">时间</span>'+days.map((day,i)=>{const date=Schedule.addDays(scheduleWeek,i);return `<div class="day-heading ${date===today?'is-today':''}"><b>${day}</b><span>${Number(date.slice(5,7))}.${Number(date.slice(8,10))}</span></div>`}).join('');
 const startHour=Math.min(8,...items.map(i=>Math.floor(Schedule.minutes(i.startTime)/60))),endHour=Math.max(20,...items.map(i=>Math.ceil(Schedule.minutes(i.endTime)/60))),height=(endHour-startHour)*60;
 $('#scheduleBody').style.setProperty('--schedule-height',height+'px');
 const hours=Array.from({length:endHour-startHour+1},(_,i)=>startHour+i);
 let html=`<div class="schedule-time-axis">${hours.map((hour,i)=>`<span style="top:${i*60}px">${String(hour).padStart(2,'0')}:00</span>`).join('')}</div>`;
 for(let day=1;day<=7;day++){
  const lessons=Schedule.layoutDay(items.filter(i=>i.displayDay===day));
  html+=`<div class="schedule-day-column ${Schedule.addDays(scheduleWeek,day-1)===today?'is-today':''}">${lessons.map(item=>{const [tint,ink]=palette[Number(item.color)%5||0],top=Schedule.minutes(item.startTime)-startHour*60,h=Math.max(26,Schedule.minutes(item.endTime)-Schedule.minutes(item.startTime));return `<button class="lesson-block" data-lesson="${esc(item.id)}" style="top:${top}px;height:${h}px;left:calc(${item._lane*100/item._lanes}% + 4px);width:calc(${100/item._lanes}% - 8px);--lesson-tint:${tint};--lesson-ink:${ink}" aria-label="编辑 ${esc(item.title)} ${days[day-1]} ${esc(item.startTime)}至${esc(item.endTime)} ${esc(item.location||'')}" title="${esc([item.title,item.startTime+'–'+item.endTime,item.location,item.teacher,item.note].filter(Boolean).join('\n'))}"><b>${esc(item.title)}</b><span>${esc(item.startTime)}–${esc(item.endTime)}</span>${item.location?`<small>${esc(item.location)}</small>`:''}${item.teacher?`<small>${esc(item.teacher)}</small>`:''}</button>`}).join('')}</div>`;
 }
 $('#scheduleBody').innerHTML=html+(!items.length?'<div class="schedule-empty"><span>这周还没有课程</span><small>添加一节课，或导入你的日历课表。</small></div>':'');
}
function toggleLessonRepeat(){const weekly=$('#lessonForm').elements.repeat.value==='weekly';$('#weeklyLessonFields').hidden=!weekly;$('#onceLessonField').hidden=weekly;for(const name of ['startWeek','endWeek'])$('#lessonForm').elements[name].required=weekly;$('#lessonForm').elements.date.required=!weekly;}
function openLessonEditor(id){
 editingLesson=id||null;const item=scheduleItems().find(i=>i.id===id),form=$('#lessonForm'),settings=scheduleSettings();form.reset();$('#lessonError').textContent='';$('#lessonDeletePrompt').hidden=true;$('#lessonDelete').hidden=!item;$('#lessonTitle').textContent=item?'编辑课程安排':'添加课程安排';
 $('#lessonTextImport').hidden=Boolean(item);
 $('#scheduleSubjects').innerHTML=state.courses.map(c=>`<option value="${esc(c)}"></option>`).join('');
 const values=item||{title:'',location:'',teacher:'',startTime:'08:00',endTime:'09:40',repeat:'weekly',weekday:1,startWeek:1,endWeek:settings.weeks,pattern:'all',date:scheduleWeek===Schedule.monday(Schedule.today())?Schedule.today():scheduleWeek,color:scheduleItems().length%5,note:''};
 for(const name of ['title','location','teacher','startTime','endTime','repeat','weekday','startWeek','endWeek','pattern','date','color','note'])form.elements[name].value=values[name]??'';
 toggleLessonRepeat();$('#lessonDialog').showModal();form.elements.title.focus();
}
$('#scheduleAddButton').onclick=()=>openLessonEditor();$('#lessonForm').elements.repeat.onchange=toggleLessonRepeat;
$('#lessonForm').onsubmit=e=>{
 e.preventDefault();const form=e.target,data={title:form.elements.title.value.trim(),location:form.elements.location.value.trim(),teacher:form.elements.teacher.value.trim(),startTime:form.elements.startTime.value,endTime:form.elements.endTime.value,repeat:form.elements.repeat.value,weekday:Number(form.elements.weekday.value),startWeek:Number(form.elements.startWeek.value),endWeek:Number(form.elements.endWeek.value),pattern:form.elements.pattern.value,date:form.elements.date.value,color:Number(form.elements.color.value),note:form.elements.note.value.trim()};
 const error=Schedule.validateLesson(data);if(error){$('#lessonError').textContent=error;return;}
 const previous=structuredClone(scheduleItems()),item=state.schedule.find(i=>i.id===editingLesson);
 if(item)Object.assign(item,data);else state.schedule.push({...data,id:crypto.randomUUID()});
 if(!save()){state.schedule=previous;$('#lessonError').textContent='未能保存，请检查浏览器存储权限。';return;}
 if(data.repeat==='once')scheduleWeek=Schedule.monday(data.date);
 else{const current=Schedule.weekNumber(scheduleWeek,scheduleSettings().semesterStart);if(current<data.startWeek||current>data.endWeek||data.pattern==='odd'&&current%2===0||data.pattern==='even'&&current%2!==0){let first=data.startWeek;if(data.pattern==='odd'&&first%2===0||data.pattern==='even'&&first%2!==0)first++;scheduleWeek=Schedule.addDays(scheduleSettings().semesterStart,(first-1)*7);}}
 render();$('#lessonDialog').close();toast(item?'课程安排已更新':'课程安排已添加');
};
$('#lessonDelete').onclick=()=>$('#lessonDeletePrompt').hidden=false;$('#lessonDeleteCancel').onclick=()=>$('#lessonDeletePrompt').hidden=true;
$('#lessonDeleteConfirm').onclick=()=>{const previous=scheduleItems();state.schedule=previous.filter(i=>i.id!==editingLesson);if(!save()){state.schedule=previous;$('#lessonError').textContent='删除未保存，请重试。';return;}render();$('#lessonDialog').close();toast('课程安排已删除')};
$('#previousWeek').onclick=()=>{scheduleWeek=Schedule.addDays(scheduleWeek,-7);renderTimetable()};$('#nextWeek').onclick=()=>{scheduleWeek=Schedule.addDays(scheduleWeek,7);renderTimetable()};$('#currentWeek').onclick=()=>{scheduleWeek=Schedule.monday(Schedule.today());renderTimetable()};
document.addEventListener('click',e=>{const button=e.target.closest('[data-lesson]');if(button)openLessonEditor(button.dataset.lesson)});
$('#scheduleSettingsButton').onclick=()=>{const settings=scheduleSettings(),form=$('#scheduleSettingsForm');form.elements.semesterStart.value=settings.semesterStart;form.elements.weeks.value=settings.weeks;$('#scheduleSettingsError').textContent='';$('#scheduleSettingsDialog').showModal()};
$('#scheduleSettingsForm').onsubmit=e=>{e.preventDefault();const form=e.target,start=form.elements.semesterStart.value,weeks=Number(form.elements.weeks.value);try{if(Schedule.monday(start)!==start)throw Error('第一周的开始日期请选择周一。');if(!Number.isInteger(weeks)||weeks<1||weeks>52)throw Error('学期周数须为 1—52。');}catch(error){$('#scheduleSettingsError').textContent=error.message;return;}const previous=state.scheduleSettings;state.scheduleSettings={semesterStart:start,weeks};if(!save()){state.scheduleSettings=previous;$('#scheduleSettingsError').textContent='保存失败，请检查存储权限。';return;}renderTimetable();$('#scheduleSettingsDialog').close();toast('学期设置已保存')};
function clearImportPreview(){importPreview=null;$('#scheduleImportResults').hidden=true;$('#scheduleImportList').innerHTML='';}
function resetImportAction(){const button=$('#scheduleImportPreview');button.disabled=false;button.textContent=scheduleImportMode==='text'?'预览课表':'读取并预览';}
function invalidateImport(){if(importRequest)importRequest.abort();importRequest=null;clearImportPreview();$('#scheduleImportError').textContent='';resetImportAction();}
function setScheduleImportMode(mode){
 scheduleImportMode=mode;invalidateImport();const form=$('#scheduleImportForm'),isText=mode==='text';
 $('#scheduleCalendarFields').hidden=isText;$('#scheduleTextFields').hidden=!isText;
 for(const name of ['calendarUrl','calendarFile'])form.elements[name].disabled=isText;
 form.elements.calendarText.disabled=!isText;form.elements.calendarText.required=isText;
 for(const [id,active] of [['#scheduleImportCalendarMode',!isText],['#scheduleImportTextMode',isText]]){$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('selected',active);}
 (isText?form.elements.calendarText:form.elements.calendarUrl).focus();
}
function openScheduleImport(mode='calendar'){
 const settings=scheduleSettings(),form=$('#scheduleImportForm');form.reset();form.elements.from.value=settings.semesterStart;form.elements.to.value=Schedule.addDays(settings.semesterStart,Math.min(settings.weeks*7,366)-1);setScheduleImportMode(mode);$('#scheduleImportDialog').showModal();(mode==='text'?form.elements.calendarText:form.elements.calendarUrl).focus();
}
$('#scheduleImportButton').onclick=()=>openScheduleImport();
$('#lessonTextImport').onclick=()=>{$('#lessonDialog').close();openScheduleImport('text')};
$('#scheduleImportCalendarMode').onclick=()=>setScheduleImportMode('calendar');$('#scheduleImportTextMode').onclick=()=>setScheduleImportMode('text');
$('#scheduleImportForm').elements.calendarUrl.oninput=()=>{invalidateImport();$('#scheduleImportForm').elements.calendarFile.value=''};
$('#scheduleImportForm').elements.calendarFile.onchange=()=>{invalidateImport();if($('#scheduleImportForm').elements.calendarFile.files.length)$('#scheduleImportForm').elements.calendarUrl.value=''};
for(const name of ['from','to'])$('#scheduleImportForm').elements[name].onchange=invalidateImport;
$('#scheduleImportForm').elements.calendarText.oninput=invalidateImport;$('#scheduleImportForm').elements.calendarText.onchange=invalidateImport;
$('#scheduleImportDialog').addEventListener('close',()=>{invalidateImport();$('#scheduleImportForm').reset()});
function showScheduleImportPreview(result){
 const candidates=Schedule.importCandidates(scheduleItems(),result.events);importPreview={items:candidates};
 const duplicates=candidates.filter(i=>i.duplicate).length;
 $('#scheduleImportSummary').textContent=`识别 ${candidates.length} 节课程 · ${duplicates} 节重复`;
 const warnings=result.warnings||{},messages=[];
 if(warnings.allDay)messages.push(`${warnings.allDay} 条全天事件`);if(warnings.overnight)messages.push(`${warnings.overnight} 条跨日事件`);if(warnings.cancelled)messages.push(`${warnings.cancelled} 条取消事件`);if(warnings.invalid)messages.push(`${warnings.invalid} 条无效时间事件`);
 $('#scheduleImportWarnings').textContent=messages.length?'已跳过'+messages.join('、')+'。':'确认后合并到现有课表，重复记录自动跳过。';
 $('#scheduleImportList').innerHTML=candidates.length?candidates.map((item,index)=>`<label class="import-course-row ${item.duplicate?'duplicate':''}"><input type="checkbox" data-import-index="${index}" ${item.duplicate?'disabled':'checked'}><span><b>${esc(item.title)}</b><small>${esc(item.date)} ${esc(item.startTime)}–${esc(item.endTime)}${item.location?' · '+esc(item.location):''}${item.teacher?' · '+esc(item.teacher):''}</small></span><span class="import-status">${item.duplicate?'已存在':'新增'}</span></label>`).join(''):'<div class="import-no-results">所选日期内没有可导入的定时课程，请检查日期范围。</div>';
 $('#scheduleImportResults').hidden=false;updateImportSelection();
}
$('#scheduleImportForm').onsubmit=async e=>{
 e.preventDefault();const form=e.target,from=form.elements.from.value,to=form.elements.to.value,url=form.elements.calendarUrl.value.trim(),file=form.elements.calendarFile.files[0],isText=scheduleImportMode==='text';
 invalidateImport();let pastedText;
 try{
  if(Schedule.diffDays(to,from)<0||Schedule.diffDays(to,from)>366)throw Error('导入范围须在 1 年以内，结束日期不能早于开始日期。');
  if(isText)pastedText=Schedule.normalizeICSText(form.elements.calendarText.value);
  else{if(!url&&!file)throw Error('请粘贴日历订阅链接，或选择一个 .ics 文件。');if(file&&file.size>2*1024*1024)throw Error('日历文件不能超过 2MB。');}
 }catch(error){$('#scheduleImportError').textContent=error.message;$('#scheduleImportError').focus();return;}
 const controller=new AbortController();importRequest=controller;$('#scheduleImportPreview').disabled=true;$('#scheduleImportPreview').textContent='正在读取日历…';
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
  const body={from,to};if(isText)body.text=pastedText;else if(file)body.text=await file.text();else body.url=url;
  if(controller.signal.aborted||importRequest!==controller)return;
  const response=await fetch(isText||file?'/api/calendar/parse':'/api/calendar/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
  let result;try{result=await response.json()}catch{throw Error('课表导入服务暂不可用，请稍后重试。')}
  if(!response.ok)throw Error(result.error||'日历导入失败。');
  if(controller.signal.aborted||importRequest!==controller||!$('#scheduleImportDialog').open)return;
  showScheduleImportPreview(result);
 }catch(error){if(importRequest===controller&&$('#scheduleImportDialog').open)$('#scheduleImportError').textContent=error.name==='AbortError'?'读取超时或已取消，请重试。':error.message||'读取失败，请检查日历地址。';}
 finally{clearTimeout(timer);if(importRequest===controller){importRequest=null;resetImportAction();}}
};
$('#scheduleImportDownload').onclick=()=>{
 $('#scheduleImportError').textContent='';let url;
 try{const ics=Schedule.normalizeICSText($('#scheduleImportForm').elements.calendarText.value),blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='CampusHub-课程表.ics';link.click();toast('ICS 文件已下载');}
 catch(error){$('#scheduleImportError').textContent=error.message||'下载失败，请重试。';$('#scheduleImportError').focus();}
 finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}
};
function updateImportSelection(){const boxes=[...document.querySelectorAll('#scheduleImportList input:not(:disabled)')],selected=boxes.filter(input=>input.checked).length;$('#scheduleImportConfirm').disabled=selected===0;$('#scheduleImportConfirm').textContent=`导入 ${selected} 节课程`;$('#scheduleImportSelectAll').checked=boxes.length>0&&selected===boxes.length;$('#scheduleImportSelectAll').indeterminate=selected>0&&selected<boxes.length;}
$('#scheduleImportSelectAll').onchange=e=>{document.querySelectorAll('#scheduleImportList input:not(:disabled)').forEach(input=>input.checked=e.target.checked);updateImportSelection()};$('#scheduleImportList').onchange=updateImportSelection;
$('#scheduleImportConfirm').onclick=()=>{
 if(!importPreview)return;
 const selected=[...document.querySelectorAll('#scheduleImportList input:checked:not(:disabled)')].map(input=>importPreview.items[Number(input.dataset.importIndex)]);
 const fresh=Schedule.importCandidates(scheduleItems(),selected).filter(i=>!i.duplicate);if(!fresh.length){toast('这些课程已存在，无需重复导入');return;}
 const previous=structuredClone(state.schedule);state.schedule.push(...fresh.map(({duplicate,...item})=>({...item,id:crypto.randomUUID()})));
 if(!save()){state.schedule=previous;$('#scheduleImportError').textContent='导入未保存，请检查浏览器存储权限。';return;}
 const thisWeekEnd=Schedule.addDays(scheduleWeek,6);if(!fresh.some(i=>i.date>=scheduleWeek&&i.date<=thisWeekEnd))scheduleWeek=Schedule.monday(fresh[0].date);
 render();$('#scheduleImportDialog').close();toast(`已导入 ${fresh.length} 节课程`);
};
render();
