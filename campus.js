const Campus=CampusCore;
let taskFilter='pending',taskCourse='',campusCategory='',editingTask=null,editingCampusLink=null,activeArchive=null,packPreview=null,packReadVersion=0;
const campusCategories=['教学教务','图书馆','网络缴费','生活服务','出行','其他'];
const uuid=()=>crypto.randomUUID();
function campusData(){state.tasks||=[];state.campusLinks||=[];state.archives||=[];}
function commitCampus(next,errorNode){
 const previous=state;state=next;
 if(!save()){state=previous;if(errorNode)$(errorNode).textContent='保存失败，请检查浏览器存储空间后重试。';return false;}
 render();return true;
}
function newCampusState(){campusData();return structuredClone(state)}
function formatDue(value){return value.replace('T',' ').replaceAll('-','.');}
function taskLink(task){const site=state.sites.find(s=>s.id===task.siteId),url=task.url?safeUrl(task.url):site&&safeUrl(site.url);return url?`<a class="task-website" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(task.url?'打开通知网址':site.name)} <span aria-hidden="true">↗</span></a>`:''}
function taskRow(task,compact=false){
 const status=Campus.taskStatus(task),urgent=!task.done&&['已逾期','今天截止'].includes(status);
 return `<article class="task-row ${task.done?'is-done':''}"><label class="task-complete"><input type="checkbox" data-task-toggle="${esc(task.id)}" ${task.done?'checked':''} aria-label="${task.done?'标为未完成':'完成任务'} ${esc(task.title)}"></label><div class="task-description"><button class="task-title" data-task-edit="${esc(task.id)}">${esc(task.title)}</button><p><span class="deadline ${urgent?'urgent':''}">${esc(formatDue(task.due))} · ${status}</span><span>${esc(task.course||'校园待办')}</span></p>${!compact&&task.note?`<small>${esc(task.note)}</small>`:''}</div>${taskLink(task)}${compact?'':`<button class="task-edit" data-task-edit="${esc(task.id)}" aria-label="编辑任务 ${esc(task.title)}">编辑</button>`}</article>`;
}
function renderToday(){
 const home=view==='home',now=Campus.localNow(),lessons=Campus.todayLessons(state,now),tasks=Campus.upcoming(state.tasks,now),hasContext=state.courses.length||state.tasks.length||state.schedule?.length;
 $('#todayOverview').hidden=!home||!hasContext;
 if(!home)return;
 $('#home').classList.toggle('has-subjects',Boolean(hasContext));
 $('#todayOverview').innerHTML=`<div class="today-heading"><h2 id="todayTitle">今天</h2><span>${now.slice(0,10).replaceAll('-','.')} · ${['周日','周一','周二','周三','周四','周五','周六'][new Date(now.slice(0,10)+'T00:00:00Z').getUTCDay()]}</span></div><div class="today-columns"><section class="today-classes"><div class="compact-heading"><h3>接下来的课</h3><button data-view="timetable">课程表 <span aria-hidden="true">↗</span></button></div>${lessons.length?lessons.slice(0,3).map(l=>`<button class="today-lesson" data-lesson="${esc(l.id)}"><span>${esc(l.startTime)}<small>${esc(l.endTime)}</small></span><span><b>${esc(l.title)}</b><small>${esc(l.location||'未填写教室')}${l.startTime<=now.slice(11)?' · 正在上课':''}</small></span></button>`).join(''):`<div class="today-quiet">今天没有待上的课<button data-add-lesson>添加课程安排</button></div>`}</section><section class="today-tasks"><div class="compact-heading"><h3>近期截止${tasks.length?` <span>${tasks.length}</span>`:''}</h3><button data-view="tasks">任务清单 <span aria-hidden="true">↗</span></button></div>${tasks.length?tasks.slice(0,3).map(t=>taskRow(t,true)).join(''):'<div class="today-quiet">未来七天没有待交任务<button data-add-task>记一条任务</button></div>'}<p class="today-caption">包含逾期任务 · 完成后勾选即可收起</p></section></div>`;
}
function pageHeading(title,description,actions){return `<div class="campus-page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></div>`}
function renderTasks(){
 const now=Campus.localNow();let items=state.tasks.filter(t=>(!taskCourse||t.course===taskCourse)&&(taskFilter==='completed'?t.done:taskFilter==='all'?true:taskFilter==='today'?!t.done&&t.due.slice(0,10)===now.slice(0,10):taskFilter==='upcoming'?Campus.upcoming([t],now).length:!t.done));
 items.sort((a,b)=>Number(a.done)-Number(b.done)||a.due.localeCompare(b.due));
 return pageHeading('任务清单','作业、选课、校园待办，记下截止时间。','<button class="secondary" data-task-notice>粘贴通知</button><button class="primary" data-add-task>＋ 添加任务</button>')+`<div class="campus-filters"><div class="filter-tabs" role="group" aria-label="任务状态">${[['pending','待完成'],['today','今天截止'],['upcoming','近期七天'],['completed','已完成'],['all','全部']].map(([value,label])=>`<button data-task-filter="${value}" aria-pressed="${taskFilter===value}" class="${taskFilter===value?'selected':''}">${label}</button>`).join('')}</div><select id="taskCourseFilter" aria-label="按科目筛选任务"><option value="">全部科目</option>${state.courses.map(c=>`<option ${taskCourse===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div><p class="list-caption">${items.length} 条任务 · 截止时间均为北京时间 · 逾期任务会保留提醒</p><div class="task-list">${items.length?items.map(t=>taskRow(t)).join(''):`<div class="campus-empty"><h2>${taskFilter==='completed'?'还没有完成的任务':'这里暂时没有任务'}</h2><p>记下下一次提交时间，把入口也一起放好。</p><button class="secondary" data-add-task>＋ 添加任务</button></div>`}</div>`;
}
function renderCampusLinks(){
 const links=state.campusLinks.filter(l=>!campusCategory||l.category===campusCategory);
 return pageHeading('校园入口','把常用的校内服务，放在顺手的位置。','<button class="primary" data-add-campus-link>＋ 添加入口</button>')+`<div class="filter-tabs campus-category-tabs" role="group" aria-label="校园入口分类">${['',...campusCategories].map(c=>`<button data-campus-category="${c}" class="${campusCategory===c?'selected':''}" aria-pressed="${campusCategory===c}">${c||'全部'}</button>`).join('')}</div><div class="campus-link-grid">${links.length?links.map(l=>{const url=safeUrl(l.url);return `<article class="campus-link-card"><span class="campus-category-label">${esc(l.category)}</span><h2><a href="${esc(url||'#')}" class="campus-link-open" target="_blank" rel="noopener noreferrer">${esc(l.name)} <span aria-hidden="true">↗</span></a></h2><small>${esc(url?new URL(url).hostname:'地址无效')}</small><p>${esc(l.note||'暂未填写使用说明')}</p><button class="text-action" data-edit-campus-link="${esc(l.id)}" aria-label="编辑入口 ${esc(l.name)}">编辑</button></article>`}).join(''):'<div class="campus-empty"><h2>添加你的第一个校园入口</h2><p>教务选课、图书馆预约、校园网缴费、宿舍报修、校车时刻表…</p><button class="secondary" data-add-campus-link>＋ 添加入口</button></div>'}</div>`;
}
function renderArchives(){
 return pageHeading('学期档案','手动留存，按需复用。相邻学期的课程也可以继续留在首页。','<button class="secondary" data-open-pack>导入科目包</button><button class="primary" data-create-archive>＋ 创建档案</button>')+'<p class="archive-policy">归档是可选功能，不会按日期自动执行。创建快照时默认保留首页科目；之后可选择复用任意科目。</p>'+`<div class="archive-grid">${state.archives.length?state.archives.map(a=>`<article class="archive-card"><span class="archive-date">${esc(a.createdAt.slice(0,10).replaceAll('-','.'))} 保存</span><h2>${esc(a.name)}</h2><p>${a.courses.length} 门科目 · ${a.sites.length} 个网站 · ${a.tasks.length} 条任务</p><div class="archive-subjects">${a.courses.map(c=>`<span>${esc(c.name)}</span>`).join('')}</div><button class="secondary" data-archive-detail="${esc(a.id)}">查看与复用</button></article>`).join(''):'<div class="campus-empty"><h2>还没有学期档案</h2><p>准备好时，选择想保存的科目。现在的学习空间可以继续使用。</p><button class="secondary" data-create-archive>创建第一份档案</button></div>'}</div>`;
}
function renderCampus(){
 campusData();
 if(taskCourse&&!state.courses.includes(taskCourse))taskCourse='';
 const custom=['tasks','campus','archives'].includes(view);
 document.body.classList.toggle('campus-page-view',custom);$('#campusPage').hidden=!custom;
 if(custom)$('#campusPage').innerHTML=view==='tasks'?renderTasks():view==='campus'?renderCampusLinks():renderArchives();
 renderToday();
}
function taskWebsiteOptions(selected=''){
 const f=$('#taskForm'),sites=state.sites.filter(s=>!f.elements.course.value||s.course===f.elements.course.value);
 f.elements.siteId.innerHTML='<option value="">不关联网站</option>'+sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.course)}</option>`).join('');f.elements.siteId.value=sites.some(s=>s.id===selected)?selected:'';
}
function openTask(id){
 campusData();editingTask=id||null;const task=state.tasks.find(t=>t.id===id),f=$('#taskForm');f.reset();$('#taskError').textContent='';$('#taskDeletePrompt').hidden=true;$('#taskDelete').hidden=!task;$('#taskTitle').textContent=task?'编辑任务':'添加任务';
 resetTaskNotice();
 f.elements.course.innerHTML='<option value="">校园待办（不关联科目）</option>'+state.courses.map(c=>`<option>${esc(c)}</option>`).join('');
 f.elements.course.value=task?.course||(state.courses.includes(view)?view:'');f.elements.title.value=task?.title||'';f.elements.due.value=task?.due||(ScheduleCore.today()+'T23:59');f.elements.note.value=task?.note||'';f.elements.url.value=task?.url||'';taskWebsiteOptions(task?.siteId);$('#taskDialog').showModal();f.elements.title.focus();
}
function resetTaskNotice(){
 $('#taskNoticePanel').open=false;$('#taskNoticeText').value='';$('#taskNoticeStatus').textContent='';
 for(const kind of ['Dates','Links']){$('#taskNotice'+kind+'Label').hidden=true;$('#taskNotice'+kind).replaceChildren();}
}
$('#taskNoticeRecognize').onclick=()=>{
 const f=$('#taskForm');$('#taskError').textContent='';
 try{
  const result=Campus.parseNotice($('#taskNoticeText').value);
  f.elements.title.value=result.title;f.elements.note.value=result.note;f.elements.due.value=result.due;f.elements.url.value=result.links[0]||'';
  $('#taskNoticeDatesLabel').hidden=result.candidates.length<2;
  $('#taskNoticeDates').innerHTML='<option value="">请选择截止时间</option>'+result.candidates.map(c=>`<option value="${esc(c.due)}">${esc(formatDue(c.due))}${c.assumedTime?'（未写时刻，暂填 23:59）':''} · ${esc(c.label)}</option>`).join('');
  $('#taskNoticeDates').value=result.due;
  $('#taskNoticeLinksLabel').hidden=result.links.length<2;
  $('#taskNoticeLinks').innerHTML=result.links.map(url=>`<option value="${esc(url)}">${esc(url)}</option>`).join('');
  $('#taskNoticeStatus').textContent=`识别到 ${result.links.length} 个网址、${result.candidates.length} 个日期。已填入下方，请核对后保存。${result.warnings.join(' ')}`;
 }catch(error){$('#taskNoticeStatus').textContent=error.message;}
};
$('#taskNoticeDates').onchange=e=>{$('#taskForm').elements.due.value=e.target.value;};
$('#taskNoticeLinks').onchange=e=>{$('#taskForm').elements.url.value=e.target.value;};
$('#taskNoticeText').addEventListener('input',()=>{
 $('#taskNoticeStatus').textContent='通知已修改，请重新识别。';
 for(const kind of ['Dates','Links'])$('#taskNotice'+kind+'Label').hidden=true;
});
$('#taskDialog').addEventListener('close',resetTaskNotice);
$('#taskForm').elements.course.onchange=()=>taskWebsiteOptions();
$('#taskForm').onsubmit=e=>{
 e.preventDefault();const f=e.target,rawUrl=f.elements.url.value.trim(),data={title:f.elements.title.value.trim(),course:f.elements.course.value,due:f.elements.due.value,siteId:f.elements.siteId.value,url:rawUrl?(safeUrl(rawUrl)||rawUrl):'',note:f.elements.note.value.trim()},error=Campus.validateTask(data,state.courses,state.sites);
 if(error){$('#taskError').textContent=error;return;}
 const next=newCampusState(),item=next.tasks.find(t=>t.id===editingTask);if(item)Object.assign(item,data);else next.tasks.push({...data,id:uuid(),done:false});
 if(commitCampus(next,'#taskError')){$('#taskDialog').close();toast(item?'任务已更新':'任务已添加，首页将显示近期截止提醒');}
};
$('#taskDelete').onclick=()=>$('#taskDeletePrompt').hidden=false;
$('#taskDeleteConfirm').onclick=()=>{const next=newCampusState();next.tasks=next.tasks.filter(t=>t.id!==editingTask);if(commitCampus(next,'#taskError')){$('#taskDialog').close();toast('任务已删除')}};
function openCampusLink(id){
 campusData();editingCampusLink=id||null;const item=state.campusLinks.find(l=>l.id===id),f=$('#campusLinkForm');f.reset();$('#campusLinkTitle').textContent=item?'编辑校园入口':'添加校园入口';$('#campusLinkError').textContent='';$('#campusLinkDeletePrompt').hidden=true;$('#campusLinkDelete').hidden=!item;
 if(item)for(const key of ['name','url','category','note'])f.elements[key].value=item[key];$('#campusLinkDialog').showModal();f.elements.name.focus();
}
$('#campusLinkForm').onsubmit=e=>{e.preventDefault();const f=e.target,url=safeUrl(f.elements.url.value),name=f.elements.name.value.trim();if(!url||!name){$('#campusLinkError').textContent=!name?'请填写入口名称。':'请填写有效的网址，例如 library.example.edu.cn。';return;}const next=newCampusState(),item=next.campusLinks.find(l=>l.id===editingCampusLink),data={name,url,category:f.elements.category.value,note:f.elements.note.value.trim()};if(item)Object.assign(item,data);else next.campusLinks.push({...data,id:uuid()});if(commitCampus(next,'#campusLinkError')){$('#campusLinkDialog').close();toast('校园入口已保存')}};
$('#campusLinkDelete').onclick=()=>$('#campusLinkDeletePrompt').hidden=false;
$('#campusLinkDeleteConfirm').onclick=()=>{const next=newCampusState();next.campusLinks=next.campusLinks.filter(l=>l.id!==editingCampusLink);if(commitCampus(next,'#campusLinkError')){$('#campusLinkDialog').close();toast('校园入口已删除')}};
function courseChoices(courses,attribute){return courses.map((c,i)=>`<label class="selection-course"><input type="checkbox" ${attribute}="${i}" checked><span><b>${esc(typeof c==='string'?c:c.name)}</b></span></label>`).join('')}
function openArchive(){campusData();const f=$('#archiveForm');f.reset();f.elements.name.value=ScheduleCore.today().slice(0,4)+(Number(ScheduleCore.today().slice(5,7))>=8?' 秋季学期':' 春季学期');f.elements.keepActive.checked=true;$('#archiveModeHelp').textContent='保存快照后仍可继续使用这些科目，适合相邻学期课程相似的情况。';$('#archiveError').textContent='';$('#archiveCourseChoices').innerHTML=state.courses.length?courseChoices(state.courses,'data-archive-choice'):'<p class="input-help">请先添加科目，再创建档案。</p>';$('#archiveDialog').showModal();}
$('#archiveForm').elements.keepActive.onchange=e=>{$('#archiveModeHelp').textContent=e.target.checked?'保存快照后仍可继续使用这些科目，适合相邻学期课程相似的情况。':'所选科目、网站和任务将从当前空间移入档案。可随时从档案复用，课程表不会改变。'};
$('#archiveForm').onsubmit=e=>{
 e.preventDefault();const f=e.target,names=[...document.querySelectorAll('[data-archive-choice]:checked')].map(n=>state.courses[Number(n.dataset.archiveChoice)]);
 try{const next=Campus.archive(state,{name:f.elements.name.value.trim(),names,keepActive:f.elements.keepActive.checked},uuid);lockVault();if(commitCampus(next,'#archiveError')){$('#archiveDialog').close();toast(f.elements.keepActive.checked?'档案已创建，首页科目仍然保留':'所选科目已移入档案，可随时复用')}}catch(error){$('#archiveError').textContent=error.message;}
};
function archiveCourseMarkup(snapshot){return snapshot.courses.map((c,i)=>{const sites=snapshot.sites.filter(s=>s.course===c.name),tasks=snapshot.tasks.filter(t=>t.course===c.name);return `<section class="archive-course-detail"><label class="selection-course"><input type="checkbox" data-restore-choice="${i}" checked><span><b>${esc(c.name)}</b><small>${sites.length} 个网站 · ${tasks.length} 条任务</small></span></label>${c.note?`<p class="archive-note">${esc(c.note)}</p>`:''}<div class="archive-sites">${sites.map(s=>`<div><b>${esc(s.name)}</b>${safeUrl(s.url)?`<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">打开网站 ↗</a>`:''}<small>${esc(s.note||'暂无备注')}</small></div>`).join('')||'<p class="input-help">这个科目还没有网站。</p>'}${tasks.length?`<details><summary>查看 ${tasks.length} 条归档任务</summary>${tasks.map(t=>`<p>${esc(t.title)}<small>${esc(formatDue(t.due))} · ${t.done?'已完成':'未完成'}</small></p>`).join('')}</details>`:''}</div></section>`}).join('')}
function openArchiveDetail(id){activeArchive=id;const snapshot=state.archives.find(a=>a.id===id);if(!snapshot)return;$('#archiveDetailTitle').textContent=snapshot.name;$('#archiveDetailSummary').textContent=`${snapshot.createdAt.slice(0,10)} 保存 · ${snapshot.courses.length} 门科目`;$('#archiveDetailCourses').innerHTML=archiveCourseMarkup(snapshot);$('#archiveIncludeTasks').checked=false;$('#archiveRestoreError').textContent='';$('#archiveDetailDialog').showModal();}
$('#archiveRestore').onclick=()=>{const snapshot=state.archives.find(a=>a.id===activeArchive);if(!snapshot)return;const names=[...document.querySelectorAll('[data-restore-choice]:checked')].map(n=>snapshot.courses[Number(n.dataset.restoreChoice)].name);if(!names.length){$('#archiveRestoreError').textContent='请至少选择一门科目。';return;}const result=Campus.restore(state,snapshot,names,$('#archiveIncludeTasks').checked,uuid);if(commitCampus(result.next,'#archiveRestoreError')){$('#archiveDetailDialog').close();toast(`已复用：${result.courses} 门新科目、${result.sites} 个新网站、${result.tasks} 条任务${result.credentialsSkipped?`；${result.credentialsSkipped} 个入口副本需重新记录账密`:''}`)}};
function exportCourse(name){
 try{const pack=Campus.makePack(state,[name]),blob=new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='CampusHub-'+name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('科目包已导出，仅含网站与备注，不含账密和任务');}catch(error){toast(error.message)}
}
function openPack(){packReadVersion++;packPreview=null;$('#packFile').value='';$('#packPreview').innerHTML='';$('#packError').textContent='';$('#packConfirm').disabled=true;$('#packDialog').showModal();}
$('#packDialog').addEventListener('close',()=>{packReadVersion++;packPreview=null;$('#packFile').value='';$('#packPreview').innerHTML='';});
$('#packFile').onchange=async e=>{
 packPreview=null;$('#packPreview').innerHTML='';$('#packConfirm').disabled=true;$('#packError').textContent='';const file=e.target.files[0],version=++packReadVersion;if(!file)return;
 try{if(file.size>1024*1024)throw Error('科目包不能超过 1MB。');const pack=Campus.parsePack(await file.text());if(version!==packReadVersion||!$('#packDialog').open)return;packPreview=pack;
 $('#packPreview').innerHTML=pack.courses.map((c,i)=>`<section class="pack-course"><label class="selection-course"><input type="checkbox" data-pack-choice="${i}" checked><span><b>${esc(c.name)}</b><small>${c.sites.length} 个网站${state.courses.some(n=>n.toLocaleLowerCase()===c.name.toLocaleLowerCase())?' · 合并到已有科目':' · 新科目'}</small></span></label>${c.note?`<p class="archive-note">${esc(c.note)}</p>`:''}<ul>${c.sites.map(s=>`<li><b>${esc(s.name)}</b><span>${esc(new URL(s.url).hostname)}</span>${s.note?`<small>${esc(s.note)}</small>`:''}${s.purposes.length?`<small>${s.purposes.map(esc).join(' · ')}</small>`:''}</li>`).join('')}</ul></section>`).join('');$('#packConfirm').disabled=false;
 }catch(error){if(version===packReadVersion)$('#packError').textContent=error.message;}
};
$('#packConfirm').onclick=()=>{if(!packPreview)return;const names=[...document.querySelectorAll('[data-pack-choice]:checked')].map(n=>packPreview.courses[Number(n.dataset.packChoice)].name);if(!names.length){$('#packError').textContent='请至少选择一门科目。';return;}const result=Campus.mergePack(state,packPreview,names,uuid);if(commitCampus(result.next,'#packError')){$('#packDialog').close();toast(`已导入 ${result.courses} 门新科目、${result.sites} 个网站，跳过 ${result.duplicates} 个重复网址`)}};
$('#exportCurrentCourse').onclick=()=>exportCourse(view);
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-task-notice],[data-add-task],[data-task-edit],[data-add-campus-link],[data-edit-campus-link],[data-task-filter],[data-campus-category],[data-create-archive],[data-archive-detail],[data-export-course],[data-open-pack],[data-purpose-filter],[data-add-lesson],[data-cancel-task-delete],[data-cancel-link-delete]');if(!button)return;
 if(button.hasAttribute('data-task-notice')){openTask();$('#taskNoticePanel').open=true;$('#taskNoticeText').focus();}
 if(button.hasAttribute('data-add-task'))openTask();if(button.dataset.taskEdit)openTask(button.dataset.taskEdit);
 if(button.hasAttribute('data-add-campus-link'))openCampusLink();if(button.dataset.editCampusLink)openCampusLink(button.dataset.editCampusLink);
 if(button.hasAttribute('data-task-filter')){taskFilter=button.dataset.taskFilter;renderCampus();}
 if(button.hasAttribute('data-campus-category')){campusCategory=button.dataset.campusCategory;renderCampus();}
 if(button.hasAttribute('data-create-archive'))openArchive();if(button.dataset.archiveDetail)openArchiveDetail(button.dataset.archiveDetail);
 if(button.dataset.exportCourse)exportCourse(button.dataset.exportCourse);if(button.hasAttribute('data-open-pack'))openPack();
 if(button.hasAttribute('data-purpose-filter')){purposeFilter=button.dataset.purposeFilter;render();}
 if(button.hasAttribute('data-add-lesson'))openLessonEditor();
 if(button.hasAttribute('data-cancel-task-delete'))$('#taskDeletePrompt').hidden=true;if(button.hasAttribute('data-cancel-link-delete'))$('#campusLinkDeletePrompt').hidden=true;
});
document.addEventListener('change',e=>{
 if(e.target.id==='taskCourseFilter'){taskCourse=e.target.value;renderCampus();}
 if(e.target.hasAttribute('data-task-toggle')){const next=newCampusState(),task=next.tasks.find(t=>t.id===e.target.dataset.taskToggle);if(task){task.done=e.target.checked;if(!commitCampus(next))render();else toast(task.done?'任务已完成':'任务已标为未完成');}}
 if(e.target.hasAttribute('data-pack-choice'))$('#packConfirm').disabled=!document.querySelector('[data-pack-choice]:checked');
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderCampus()});
setInterval(()=>{if(!document.hidden&&view==='home')renderToday()},60000);
render();
