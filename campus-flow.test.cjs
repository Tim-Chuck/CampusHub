const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('jsdom');const {webcrypto}=require('node:crypto');
function harness(t,viewport,seed={},url='https://campushub.test/'){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:url.startsWith('http://192.')?{randomUUID:()=>webcrypto.randomUUID()}:webcrypto});w.setInterval=()=>0;
 if(viewport)Object.defineProperty(w,'visualViewport',{value:viewport});
 for(const [key,value] of Object.entries(seed))w.localStorage.setItem(key,value);
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
 for(const file of ['schedule-core.js','campus-core.js','sync-core.js','app.js','timetable.js','campus.js','sync.js'])new vm.Script(fs.readFileSync(__dirname+'/'+file,'utf8'),{filename:file}).runInContext(dom.getInternalVMContext());
 t.after(()=>w.close());const $=s=>w.document.querySelector(s),click=s=>{const el=$(s);assert.ok(el,`Missing ${s}`);el.click()},set=(s,v)=>{$(s).value=v;$(s).dispatchEvent(new w.Event('change',{bubbles:true}))},submit=s=>$(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const stored=()=>JSON.parse(w.localStorage.getItem('campushub-device-v1'));
 return {dom,w,$,click,set,submit,stored,run:code=>new vm.Script(code).runInContext(dom.getInternalVMContext())};
}
function addSubject(h,name='高等数学'){h.click('#homeAddCourse');h.set('#courseForm [name="courseName"]',name);h.submit('#courseForm');}
function addWebsite(h){h.click('[data-home-course]');h.click('#add');h.set('#form [name="name"]','作业平台');h.set('#form [name="url"]','example.edu/work');h.click('#sitePurposeChoices input[value="交作业"]');h.submit('#form');}
function addTask(h){h.click('#addCourseTask');h.set('#taskForm [name="title"]','第二章作业');h.set('#taskForm [name="due"]','2026-10-24T23:59');h.set('#taskForm [name="siteId"]',h.stored().sites[0].id);h.submit('#taskForm');}

test('Pasted notices fill editable task fields locally and persist links across editing and reload',t=>{
 const h=harness(t);h.w.fetch=()=>{throw Error('Notice recognition must not use the network')};h.click('[data-view="tasks"]');h.click('[data-task-notice]');
 assert.equal(h.$('#taskNoticePanel').open,true);assert.equal(h.w.document.activeElement.id,'taskNoticeText');
 const notice='【提交材料】\n2099年10月26日开始，2099年10月30日（周五）晚上八点截止。\n入口：https://example.edu/apply?a=1&b=2';
 h.set('#taskNoticeText',notice);h.click('#taskNoticeRecognize');
 assert.equal(h.$('#taskForm [name="due"]').value,'2099-10-30T20:00');assert.equal(h.$('#taskForm [name="url"]').value,'https://example.edu/apply?a=1&b=2');assert.equal(h.$('#taskForm [name="note"]').value,notice);assert.equal(h.run('state.tasks.length'),0);
 h.set('#taskForm [name="title"]','材料确认版');h.submit('#taskForm');const task=h.stored().tasks[0];assert.equal(task.title,'材料确认版');assert.equal(task.url,'https://example.edu/apply?a=1&b=2');
 const link=h.$('.task-website');assert.equal(link.href,task.url);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 h.click('[data-task-edit]');assert.equal(h.$('#taskForm [name="url"]').value,task.url);assert.equal(h.$('#taskNoticeText').value,'');assert.equal(h.$('#taskNoticePanel').open,false);h.$('#taskDialog').close();
 const reload=harness(t,null,{'campushub-device-v1':JSON.stringify(h.stored())});reload.click('[data-view="tasks"]');assert.equal(reload.$('.task-website').href,task.url);
});

test('Ambiguous or missing notice deadlines require selection and errors never write task data',t=>{
 const h=harness(t);h.click('[data-view="tasks"]');h.click('[data-task-notice]');
 h.set('#taskNoticeText','2099年10月27日开会，2099年10月30日提交。https://example.edu/a https://example.edu/b');h.click('#taskNoticeRecognize');
 assert.equal(h.$('#taskForm [name="due"]').value,'');assert.equal(h.$('#taskNoticeDatesLabel').hidden,false);assert.equal(h.$('#taskNoticeLinksLabel').hidden,false);
 h.submit('#taskForm');assert.equal(h.run('state.tasks.length'),0);assert.match(h.$('#taskError').textContent,/截止/);
 h.set('#taskNoticeDates','2099-10-30T23:59');h.set('#taskNoticeLinks','https://example.edu/b');assert.equal(h.$('#taskForm [name="url"]').value,'https://example.edu/b');assert.equal(h.$('#taskForm [name="due"]').value,'2099-10-30T23:59');
 h.run('save=()=>false');h.submit('#taskForm');assert.equal(h.run('state.tasks.length'),0);assert.equal(h.$('#taskDialog').open,true);assert.match(h.$('#taskError').textContent,/保存失败/);
 h.set('#taskNoticeText','另行通知时间，请关注');h.click('#taskNoticeRecognize');assert.equal(h.$('#taskForm [name="due"]').value,'');assert.equal(h.$('#taskNoticeDatesLabel').hidden,true);assert.equal(h.$('#taskNoticeLinksLabel').hidden,true);assert.match(h.$('#taskNoticeStatus').textContent,/手动填写/);
 h.set('#taskForm [name="due"]','2099-10-30T20:00');h.set('#taskForm [name="url"]','javascript:alert(1)');h.submit('#taskForm');assert.match(h.$('#taskError').textContent,/HTTP/);assert.equal(h.run('state.tasks.length'),0);
 h.$('#taskDialog').close();assert.equal(h.$('#taskNoticeText').value,'');assert.equal(h.$('#taskNoticeStatus').textContent,'');
});

test('Existing ICS text downloads locally without date requirements, then previews and imports selected lessons',async t=>{
 const h=harness(t);addSubject(h);h.click('[data-view="timetable"]');h.click('#scheduleAddButton');h.click('#lessonTextImport');
 assert.equal(h.$('#lessonDialog').open,false);assert.equal(h.$('#scheduleTextFields').hidden,false);assert.equal(h.$('#scheduleCalendarFields').hidden,true);assert.equal(h.$('[name="textSemesterStart"]'),null);assert.equal(h.$('#schedulePeriodSettings'),null);
 const text=fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8');h.set('#scheduleImportForm [name="calendarText"]',text);
 h.set('#scheduleImportForm [name="from"]','');h.set('#scheduleImportForm [name="to"]','');
 h.w.fetch=()=>{throw Error('Downloading ICS must stay local')};let downloaded;
 h.w.Blob=Blob;h.w.URL.createObjectURL=blob=>{downloaded=blob;return 'blob:course-test'};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download,'CampusHub-课程表.ics')};h.click('#scheduleImportDownload');
 assert.equal(downloaded.type,'text/calendar;charset=utf-8');assert.equal(await downloaded.text(),h.w.ScheduleCore.normalizeICSText(text));assert.equal(h.run('state.schedule.length'),0);assert.equal(h.$('#scheduleImportResults').hidden,true);
 h.set('#scheduleImportForm [name="from"]','2026-10-01');h.set('#scheduleImportForm [name="to"]','2026-11-30');
 h.w.fetch=async(route,options)=>{assert.equal(route,'/api/calendar/parse');const body=JSON.parse(options.body);assert.equal(body.text,h.w.ScheduleCore.normalizeICSText(text));return {ok:true,json:async()=>require('./calendar-import.cjs').parseCalendar(body.text,body.from,body.to)}};
 const submit=()=>h.$('#scheduleImportForm').onsubmit({preventDefault(){},target:h.$('#scheduleImportForm')});await submit();
 assert.equal(h.run('state.schedule.length'),0);assert.equal(h.$('#scheduleImportResults').hidden,false);const boxes=[...h.w.document.querySelectorAll('#scheduleImportList input')];assert.equal(boxes.length,4);
 boxes[0].click();h.click('#scheduleImportConfirm');assert.equal(h.stored().schedule.length,3);assert.equal(h.$('#scheduleImportDialog').open,false);
 h.click('#scheduleImportButton');h.click('#scheduleImportTextMode');h.set('#scheduleImportForm [name="calendarText"]',text);h.set('#scheduleImportForm [name="from"]','2026-10-01');h.set('#scheduleImportForm [name="to"]','2026-11-30');await submit();
 assert.ok(h.$('#scheduleImportSummary').textContent.includes('3 节重复'));assert.equal(h.$('#scheduleImportConfirm').textContent,'导入 1 节课程');h.click('#scheduleImportConfirm');assert.equal(h.stored().schedule.length,4);
 const reload=harness(t,null,{'campushub-device-v1':JSON.stringify(h.stored())});assert.equal(reload.run('state.schedule.length'),4);
});

test('ICS text errors do not download or write; editing clears previews and failed saves roll back',async t=>{
 const h=harness(t);addSubject(h);h.click('[data-view="timetable"]');h.click('#scheduleImportButton');h.click('#scheduleImportTextMode');
 let downloads=0;h.w.Blob=Blob;h.w.URL.createObjectURL=()=>{downloads++;return 'blob:test'};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){};
 h.set('#scheduleImportForm [name="calendarText"]','高数 | 周一 | 08:00-09:00 | 1周');h.click('#scheduleImportDownload');assert.equal(downloads,0);assert.match(h.$('#scheduleImportError').textContent,/完整 ICS/);assert.equal(h.w.document.activeElement.id,'scheduleImportError');
 const text=fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8');h.set('#scheduleImportForm [name="calendarText"]',text);h.set('#scheduleImportForm [name="from"]','2026-10-01');h.set('#scheduleImportForm [name="to"]','2026-11-30');
 h.w.fetch=async()=>({ok:false,json:async()=>({error:'日历时间无效'})});const submit=()=>h.$('#scheduleImportForm').onsubmit({preventDefault(){},target:h.$('#scheduleImportForm')});await submit();assert.equal(h.$('#scheduleImportResults').hidden,true);assert.equal(h.run('state.schedule.length'),0);assert.match(h.$('#scheduleImportError').textContent,/时间无效/);
 h.w.fetch=async(route,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>require('./calendar-import.cjs').parseCalendar(body.text,body.from,body.to)}};await submit();assert.equal(h.$('#scheduleImportResults').hidden,false);
 h.set('#scheduleImportForm [name="calendarText"]',text+'\n');assert.equal(h.$('#scheduleImportResults').hidden,true);await submit();
 h.run('save=()=>false');h.click('#scheduleImportConfirm');assert.equal(h.run('state.schedule.length'),0);assert.equal(h.$('#scheduleImportDialog').open,true);assert.match(h.$('#scheduleImportError').textContent,/未保存/);
 h.$('#scheduleImportDialog').close();assert.equal(h.$('#scheduleImportForm [name="calendarText"]').value,'');
});

test('Switching to ICS text cancels pending URL reads and ignores stale replies',async t=>{
 const h=harness(t);let finish,signal,calls=0;
 h.w.fetch=async(route,options)=>{calls++;if(calls===1){signal=options.signal;return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({events:[{title:'过期响应',date:'2026-10-26',startTime:'08:00',endTime:'09:00'}]})})})}
 const body=JSON.parse(options.body);return {ok:true,json:async()=>require('./calendar-import.cjs').parseCalendar(body.text,body.from,body.to)}};
 h.click('[data-view="timetable"]');h.click('#scheduleImportButton');h.set('#scheduleImportForm [name="calendarUrl"]','https://example.edu/calendar.ics');
 const form=h.$('#scheduleImportForm'),pending=form.onsubmit({preventDefault(){},target:form});assert.equal(h.$('#scheduleImportPreview').disabled,true);
 h.click('#scheduleImportTextMode');assert.equal(signal.aborted,true);h.set('#scheduleImportForm [name="calendarText"]',fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8'));h.set('#scheduleImportForm [name="from"]','2026-10-01');h.set('#scheduleImportForm [name="to"]','2026-11-30');await form.onsubmit({preventDefault(){},target:form});finish();await pending;
 assert.equal(h.$('#scheduleImportPreview').textContent,'预览课表');assert.equal(h.$('#scheduleImportPreview').disabled,false);assert.ok(h.$('#scheduleImportList').textContent.includes('高等数学'));assert.ok(!h.$('#scheduleImportList').textContent.includes('过期响应'));assert.equal(h.$('#scheduleImportError').textContent,'');
 h.click('#scheduleImportCalendarMode');assert.equal(h.$('#scheduleTextFields').hidden,true);assert.equal(h.$('#scheduleImportForm [name="calendarText"]').disabled,true);
});
test('Full isolated page adds subjects, purpose-tagged sites, linked tasks and supports completion, edits, and safe campus links',t=>{
 const h=harness(t);assert.equal(h.$('#homeEmpty').hidden,false);assert.equal(h.$('#todayOverview').hidden,true);
 addSubject(h);assert.equal(h.$('#homeSubjects').hidden,false);assert.equal(h.$('.subject-open h2').textContent,'高等数学');assert.equal(h.$('#homeEmpty').hidden,true);
 addWebsite(h);assert.deepEqual(h.stored().sites[0].purposes,['交作业']);h.click('[data-purpose-filter="看网课"]');assert.equal(h.$('#grid .card'),null);h.click('[data-purpose-filter="交作业"]');assert.ok(h.$('#grid .card'));
 addTask(h);assert.equal(h.stored().tasks.length,1);assert.equal(h.stored().tasks[0].course,'高等数学');h.click('[data-view="tasks"]');assert.ok(h.$('#campusPage').textContent.includes('第二章作业'));assert.equal(h.$('.task-website').href,'https://example.edu/work');
 h.click('[data-task-toggle]');assert.equal(h.stored().tasks[0].done,true);h.click('[data-task-filter="completed"]');assert.ok(h.$('.task-row.is-done'));h.click('[data-task-edit]');h.set('#taskForm [name="title"]','修改后的作业');h.submit('#taskForm');assert.equal(h.stored().tasks[0].title,'修改后的作业');
 h.click('[data-view="campus"]');h.click('[data-add-campus-link]');h.set('#campusLinkForm [name="name"]','图书馆');h.set('#campusLinkForm [name="url"]','javascript:alert(1)');h.submit('#campusLinkForm');assert.ok(h.$('#campusLinkError').textContent);assert.equal(h.stored().campusLinks.length,0);
 h.set('#campusLinkForm [name="url"]','library.example.edu');h.set('#campusLinkForm [name="category"]','图书馆');h.submit('#campusLinkForm');assert.equal(h.stored().campusLinks.length,1);assert.equal(h.$('.campus-link-open').href,'https://library.example.edu/');
 h.click('[data-campus-category="出行"]');assert.equal(h.$('.campus-link-card'),null);h.click('[data-campus-category="图书馆"]');assert.ok(h.$('.campus-link-card'));
});
test('Archive UI defaults to retaining subjects and can explicitly move and selectively restore them without old tasks',t=>{
 const h=harness(t);addSubject(h);addWebsite(h);addTask(h);h.click('[data-view="archives"]');h.click('[data-create-archive]');assert.equal(h.$('#archiveForm [name="keepActive"]').checked,true);h.set('#archiveForm [name="name"]','秋季学期');h.submit('#archiveForm');assert.equal(h.stored().courses.length,1);assert.equal(h.stored().archives.length,1);
 h.click('[data-create-archive]');h.set('#archiveForm [name="name"]','移入档案');h.click('#archiveForm [name="keepActive"]');assert.ok(h.$('#archiveModeHelp').textContent.includes('移入'));h.submit('#archiveForm');assert.equal(h.stored().courses.length,0);assert.equal(h.stored().sites.length,0);assert.equal(h.stored().tasks.length,0);
 h.click('[data-archive-detail]');assert.equal(h.$('#archiveIncludeTasks').checked,false);assert.ok(h.$('#archiveDetailCourses').textContent.includes('第二章作业'));h.click('#archiveRestore');assert.equal(h.stored().courses.length,1);assert.equal(h.stored().sites.length,1);assert.equal(h.stored().tasks.length,0);
 h.click('[data-view="home"]');assert.equal(h.$('.subject-open h2').textContent,'高等数学');
});
test('New writes roll back on storage errors and imports preview before committing, merge duplicates, and ignore credentials',async t=>{
 const h=harness(t);addSubject(h);h.click('[data-view="tasks"]');h.click('[data-add-task]');h.set('#taskForm [name="title"]','未保存任务');h.run('save=()=>false');h.submit('#taskForm');assert.equal(h.run('state.tasks.length'),0);assert.ok(h.$('#taskError').textContent.includes('保存失败'));h.$('#taskDialog').close();h.run("save=function(){localStorage.setItem(DEVICE_STORAGE_KEY,JSON.stringify(state));return true}");
 h.click('[data-view="home"]');h.click('[data-open-pack]');const contents=JSON.stringify({type:'campushub-course-pack',version:1,courses:[{name:'英语',note:'听力练习',color:1,sites:[{name:'听力平台',url:'https://example.edu/listen',note:'每天十分钟',purposes:['看网课'],credentials:{password:'DO_NOT_IMPORT'}}]}]});
 Object.defineProperty(h.$('#packFile'),'files',{value:[{size:contents.length,text:async()=>contents}],configurable:true});await h.$('#packFile').onchange({target:h.$('#packFile')});assert.equal(h.stored().courses.length,1);assert.ok(h.$('#packPreview').textContent.includes('听力平台'));h.click('#packConfirm');assert.equal(h.stored().courses.length,2);assert.equal(h.stored().sites.length,1);assert.equal(JSON.stringify(h.stored()).includes('DO_NOT_IMPORT'),false);
 h.click('[data-open-pack]');await h.$('#packFile').onchange({target:{files:[{size:contents.length,text:async()=>contents}]}});h.click('#packConfirm');assert.equal(h.stored().sites.length,1);
});
test('Subject renaming follows tasks, home clears purpose filters, and device data reloads without any account UI',t=>{
 const h=harness(t);addSubject(h);addWebsite(h);addTask(h);h.click('#editCurrentCourse');h.set('#courseForm [name="courseName"]','高等数学二');h.submit('#courseForm');assert.equal(h.stored().tasks[0].course,'高等数学二');assert.equal(h.stored().sites[0].course,'高等数学二');
 h.click('[data-purpose-filter="看网课"]');h.click('[data-view="home"]');h.click('[data-home-course]');assert.ok(h.$('#grid .card'));assert.equal(h.$('[data-purpose-filter=""]').getAttribute('aria-pressed'),'true');
 for(const selector of ['#accountDialog','#workspaceButton','#accountButton','#mobileAccountButton','[data-account]'])assert.equal(h.$(selector),null);
 const reload=harness(t,null,{'campushub-device-v1':JSON.stringify(h.stored())});assert.ok(reload.$('.subject-open'));assert.equal(reload.stored().tasks.length,1);reload.click('[data-view="tasks"]');assert.ok(reload.$('.task-row'));
 const otherBrowser=harness(t);assert.equal(otherBrowser.$('#homeEmpty').hidden,false);assert.equal(otherBrowser.stored().courses.length,0);
});
test('Archive and reuse stay unchanged when persistence fails, and closing import cancels an asynchronous preview',async t=>{
 const h=harness(t);addSubject(h);h.click('[data-view="archives"]');h.click('[data-create-archive]');h.run('save=()=>false');h.submit('#archiveForm');assert.equal(h.run('state.archives.length'),0);assert.equal(h.run('state.courses.length'),1);assert.ok(h.$('#archiveError').textContent);h.$('#archiveDialog').close();h.run("save=function(){localStorage.setItem(DEVICE_STORAGE_KEY,JSON.stringify(state));return true}");
 h.click('[data-create-archive]');h.click('#archiveForm [name="keepActive"]');h.submit('#archiveForm');h.click('[data-archive-detail]');h.run('save=()=>false');h.click('#archiveRestore');assert.equal(h.run('state.courses.length'),0);assert.ok(h.$('#archiveRestoreError').textContent);h.$('#archiveDetailDialog').close();
 h.click('[data-open-pack]');let finish;const waiting=new Promise(resolve=>{finish=resolve}),promise=h.$('#packFile').onchange({target:{files:[{size:100,text:()=>waiting}]}});h.$('#packDialog').close();finish(JSON.stringify({type:'campushub-course-pack',version:1,courses:[{name:'异步科目',sites:[]}]}));await promise;assert.equal(h.$('#packPreview').innerHTML,'');assert.equal(h.$('#packConfirm').disabled,true);
});
test('Phone menu reaches all websites, archives, subject creation and switching, and management',t=>{
 const h=harness(t);let scrolled=false;h.w.matchMedia=()=>({matches:true});h.w.scrollTo=(x,y)=>{scrolled=x===0&&y===0};h.click('[data-open-mobile-menu]');assert.equal(h.$('#mobileMenu').open,true);assert.equal(h.$('[data-open-mobile-menu]').getAttribute('aria-expanded'),'true');
 h.click('#mobileMenu [data-view="all"]');assert.equal(h.$('#mobileMenu').open,false);assert.equal(h.$('#crumb').textContent,'全部网站');assert.equal(scrolled,true);
 h.click('[data-open-mobile-menu]');h.click('#mobileMenu [data-view="archives"]');assert.equal(h.$('#crumb').textContent,'学期档案');
 h.click('[data-open-mobile-menu]');h.click('#mobileMoreAddCourse');assert.equal(h.$('#courseEditor').open,true);h.set('#courseForm [name="courseName"]','算法');h.submit('#courseForm');assert.equal(h.stored().courses[0],'算法');
 h.set('#search','旧搜索条件');h.click('[data-view="home"]');h.click('[data-open-mobile-menu]');assert.ok(h.$('#mobileMenuCourses').textContent.includes('算法'));h.click('#mobileMenuCourses [data-view]');assert.equal(h.$('#crumb').textContent,'算法');assert.equal(h.$('#search').value,'');assert.equal(h.$('#mobileMenu').open,false);
 h.click('[data-open-mobile-menu]');h.click('#mobileMoreManageCourses');assert.equal(h.$('#courseManager').open,true);h.$('#courseManager').close();assert.equal(h.$('#mobileAccountButton'),null);
});
test('Dialog height follows the visual viewport when a mobile keyboard reduces available space',t=>{
 let resize;const viewport={height:844,addEventListener(event,handler){if(event==='resize')resize=handler}},h=harness(t,viewport);
 assert.equal(h.w.document.documentElement.style.getPropertyValue('--dialog-viewport-height'),'844px');viewport.height=360;resize();assert.equal(h.w.document.documentElement.style.getPropertyValue('--dialog-viewport-height'),'360px');
});

test('Sync UI transfers a full space with preview, explicit replacement and recovery surviving reload',t=>{
 const source=harness(t);addSubject(source);addWebsite(source);addTask(source);source.click('#manageCourses');source.$('#courseManager').close();source.click('[data-open-sync]');source.click('#syncGenerate');const code=source.$('#syncCodeOutput').value;assert.match(code,/^CHUB1\./);assert.ok(!source.$('#syncOutput').hidden);source.$('#syncDialog').close();assert.equal(source.$('#syncCodeOutput').value,'');
 const destination=harness(t);addSubject(destination,'物理');const before=destination.stored();destination.click('[data-open-mobile-menu]');destination.click('#mobileMenu [data-open-sync]');assert.equal(destination.$('#mobileMenu').open,false);destination.click('[data-sync-mode="receive"]');destination.set('#syncCodeInput',code);destination.click('#syncRead');assert.equal(destination.$('#syncPreview').hidden,false);assert.ok(destination.$('#syncSubjectNames').textContent.includes('高等数学'));assert.deepEqual(destination.stored(),before);assert.equal(destination.$('#syncConfirm').disabled,true);
 destination.click('#syncReplaceConsent');assert.equal(destination.$('#syncConfirm').disabled,false);destination.$('#syncCodeInput').value=code+'x';destination.$('#syncCodeInput').dispatchEvent(new destination.w.Event('input'));assert.equal(destination.$('#syncPreview').hidden,true);assert.equal(destination.$('#syncConfirm').disabled,true);destination.click('#syncRead');assert.ok(destination.$('#syncReadError').textContent);assert.deepEqual(destination.stored(),before);
 destination.set('#syncCodeInput',code);destination.click('#syncRead');destination.click('#syncReplaceConsent');destination.click('#syncConfirm');assert.deepEqual(destination.stored().courses,['高等数学']);assert.equal(destination.stored().tasks.length,1);assert.equal(destination.$('.subject-open h2').textContent,'高等数学');assert.equal(destination.$('#syncRecovery').hidden,false);assert.ok(destination.$('#syncStatus').textContent.includes('已导入'));assert.equal(destination.$('#syncCodeInput').value,'');
 const seed=Object.fromEntries(Object.keys(destination.w.localStorage).map(key=>[key,destination.w.localStorage.getItem(key)])),reloaded=harness(t,null,seed);addSubject(reloaded,'导入之后新建');reloaded.click('[data-open-sync]');assert.equal(reloaded.$('#syncRecovery').hidden,false);assert.equal(reloaded.$('#syncRestore').disabled,true);reloaded.click('#syncRestoreConsent');reloaded.click('#syncRestore');assert.deepEqual(reloaded.stored().courses,before.courses);assert.equal(reloaded.stored().tasks.length,0);assert.equal(reloaded.$('#syncRecovery').hidden,true);assert.equal(reloaded.$('.subject-open h2').textContent,'物理');
});

test('Sync UI leaves the current space and backup intact on storage failure and cancels pending imports on replacement',t=>{
 const h=harness(t);addSubject(h,'本机科目');const before=h.stored(),code=h.run("SyncCore.encode({courses:['导入科目'],sites:[]})");h.click('[data-open-sync]');h.click('[data-sync-mode="receive"]');h.set('#syncCodeInput',code);h.click('#syncRead');h.click('#syncReplaceConsent');
 h.run("const originalSyncSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===DEVICE_STORAGE_KEY)throw new DOMException('full','QuotaExceededError');return originalSyncSet.call(this,key,value)}");h.click('#syncConfirm');assert.deepEqual(h.stored(),before);assert.deepEqual(JSON.parse(h.run('JSON.stringify(state)')),before);assert.ok(h.$('#syncReadError').textContent.includes('未替换'));assert.equal(h.w.localStorage.getItem('campushub-sync-backup-v1'),null);
 h.run("Storage.prototype.setItem=originalSyncSet;importRequest=new AbortController();this.pendingCalendarRequest=importRequest;packReadVersion=10;packPreview={courses:[]};revealedCredentials.set('fake',{username:'temporary',password:'temporary'})");h.click('#syncConfirm');assert.equal(h.run('pendingCalendarRequest.signal.aborted'),true);assert.equal(h.run('packPreview'),null);assert.equal(h.run('packReadVersion>10'),true);assert.equal(h.run('revealedCredentials.size'),0);assert.deepEqual(h.stored().courses,['导入科目']);
});

test('HTTP phone sync works without Web Crypto and copy falls back to selectable text when clipboard is unavailable',async t=>{
 const h=harness(t,null,{},'http://192.168.1.10:4174/');assert.equal(h.w.crypto.subtle,undefined);addSubject(h,'手机科目');h.click('[data-open-mobile-menu]');h.click('#mobileMenu [data-open-sync]');h.click('#syncGenerate');const code=h.$('#syncCodeOutput').value;assert.match(code,/^CHUB1\./);h.w.document.execCommand=()=>false;await h.$('#syncCopy').onclick();assert.ok(h.$('#syncCopyStatus').textContent.includes('已选中'));assert.equal(h.$('#syncCodeOutput').selectionStart,0);assert.equal(h.$('#syncCodeOutput').selectionEnd,code.length);
 h.click('[data-sync-mode="receive"]');h.set('#syncCodeInput',code);h.click('#syncRead');h.click('#syncReplaceConsent');h.click('#syncConfirm');assert.deepEqual(h.stored().courses,['手机科目']);
});

test('Clipboard reports success only after writing and closing prevents stale asynchronous UI updates',async t=>{
 const h=harness(t);addSubject(h);h.click('[data-open-sync]');h.click('#syncGenerate');const code=h.$('#syncCodeOutput').value;let copied,finish;Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value}},configurable:true});await h.$('#syncCopy').onclick();assert.equal(copied,code);assert.ok(h.$('#syncCopyStatus').textContent.includes('已复制'));
 Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:()=>Promise.reject(Error('denied'))},configurable:true});h.w.document.execCommand=()=>false;await h.$('#syncCopy').onclick();assert.ok(h.$('#syncCopyStatus').textContent.includes('已选中'));
 Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:()=>new Promise(resolve=>finish=resolve)},configurable:true});const pending=h.$('#syncCopy').onclick();h.$('#syncDialog').close();finish();await pending;assert.equal(h.$('#syncCopyStatus').textContent,'');assert.equal(h.$('#syncCodeOutput').value,'');assert.equal(h.$('#syncCopy').disabled,false);
});

function orderFixture(){return {courses:['高数','英语','物理'],courseMeta:{高数:{note:'微积分',color:1},英语:{color:2}},sites:[
 {id:'a',name:'平台A',url:'https://a.example.edu/',course:'高数',note:'每周提交',purposes:['交作业'],credentials:{iv:'fake-iv',ciphertext:'fake-ciphertext'}},
 {id:'x',name:'校外资料',url:'https://x.example.edu/',course:'英语',note:'独立位置'},
 {id:'b',name:'平台B',url:'https://b.example.edu/',course:'高数',note:'看课',purposes:['看网课']},
 {id:'c',name:'平台C',url:'https://c.example.edu/',course:'高数',note:'作业',purposes:['交作业']}
 ],tasks:[{id:'task-a',title:'提交作业',course:'高数',siteId:'a',due:'2026-11-01T23:59',done:false,note:''}]};}
const orderIds=h=>[...h.w.document.querySelectorAll('#orderList [data-order-id]')].map(n=>n.dataset.orderId);
const gridIds=h=>[...h.w.document.querySelectorAll('#grid [data-site-id]')].map(n=>n.dataset.siteId);
const moved=(h,id,direction)=>h.click(`#orderList [data-order-id="${id}"] [data-order-move="${direction}"]`);
function fakeDrag(h,type,node,clientY=0){const e=new h.w.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{clientY:{value:clientY},dataTransfer:{value:{effectAllowed:'',dropEffect:'',setData(){}}}});node.dispatchEvent(e);return e;}

test('Subject arrows persist shared home/sidebar/menu order, retain colors, records and keyboard focus',t=>{
 const h=harness(t,null,{'campushub-device-v1':JSON.stringify(orderFixture())}),siteBefore=JSON.stringify(h.stored().sites),tasksBefore=JSON.stringify(h.stored().tasks);
 h.click('#homeOrder');assert.equal(h.$('#orderDialog').open,true);assert.deepEqual(orderIds(h),['高数','英语','物理']);assert.equal(h.$('[data-order-id="高数"] [data-order-move="up"]').disabled,true);
 moved(h,'物理','up');assert.deepEqual(h.stored().courses,['高数','物理','英语']);assert.deepEqual([...h.w.document.querySelectorAll('.subject-open h2')].map(n=>n.textContent),['高数','物理','英语']);assert.deepEqual([...h.w.document.querySelectorAll('#courses .course-name')].map(n=>n.textContent),['高数','物理','英语']);assert.equal(h.stored().courseMeta.物理.color,3);assert.equal(h.w.document.activeElement.getAttribute('data-order-move'),'up');
 moved(h,'物理','up');assert.equal(h.w.document.activeElement.getAttribute('data-order-move'),'down');assert.ok(h.$('#orderStatus').textContent.includes('第 1 位'));assert.equal(JSON.stringify(h.stored().sites),siteBefore);assert.equal(JSON.stringify(h.stored().tasks),tasksBefore);
 h.$('#orderDialog').close();h.click('[data-open-mobile-menu]');assert.deepEqual([...h.w.document.querySelectorAll('#mobileMenuCourses [data-view]')].map(n=>n.dataset.view),['物理','高数','英语']);h.click('#mobileMoreManageCourses');h.click('#managerOrder');moved(h,'英语','up');assert.deepEqual([...h.w.document.querySelectorAll('#courseList .managed-description b')].map(n=>n.textContent),['物理','英语','高数']);h.$('#orderDialog').close();assert.equal(h.$('#courseManager').open,true);
 const reload=harness(t,null,{'campushub-device-v1':JSON.stringify(h.stored())});assert.deepEqual([...reload.w.document.querySelectorAll('.subject-open h2')].map(n=>n.textContent),['物理','英语','高数']);
});

test('Website ordering preserves filtered-out positions, search, creation order, credentials and associations',t=>{
 const data=orderFixture(),h=harness(t,null,{'campushub-device-v1':JSON.stringify(data)});h.click('[data-home-course][data-view="高数"]');h.set('#search','平台');h.$('#search').dispatchEvent(new h.w.Event('input'));h.click('[data-purpose-filter="交作业"]');assert.deepEqual(gridIds(h),['a','c']);h.click('#siteOrder');assert.deepEqual(orderIds(h),['a','c']);moved(h,'a','down');assert.deepEqual(h.stored().siteOrder,['c','x','b','a']);assert.deepEqual(gridIds(h),['c','a']);assert.deepEqual(h.stored().sites,data.sites);assert.deepEqual(h.stored().tasks,data.tasks);assert.equal(h.$('#search').value,'平台');assert.equal(h.$('[data-purpose-filter="交作业"]').getAttribute('aria-pressed'),'true');h.$('#orderDialog').close();
 h.set('#sort','name');assert.deepEqual(gridIds(h),['a','c']);h.set('#sort','newest');assert.deepEqual(gridIds(h),['c','a']);h.set('#sort','default');assert.deepEqual(gridIds(h),['c','a']);h.click('[data-purpose-filter=""]');assert.deepEqual(gridIds(h),['c','b','a']);h.set('#sort','newest');assert.deepEqual(gridIds(h),['c','b','a']);h.click('#siteOrder');moved(h,'a','up');assert.equal(h.$('#sort').value,'default');assert.deepEqual(h.stored().siteOrder,['c','x','a','b']);assert.deepEqual(gridIds(h),['c','a','b']);h.$('#orderDialog').close();h.set('#sort','newest');assert.deepEqual(gridIds(h),['c','b','a']);
 const reload=harness(t,null,{'campushub-device-v1':JSON.stringify(h.stored())});reload.click('[data-home-course][data-view="高数"]');assert.deepEqual(gridIds(reload),['c','a','b']);assert.equal(reload.$('[data-site-id="a"] .site-link').href,'https://a.example.edu/');assert.equal(reload.$('[data-site-id="a"] .site-link').target,'_blank');assert.equal(reload.$('#grid .card').hasAttribute('draggable'),false);
});

test('Drag-and-drop moves before or after the indicated row; cancellation and unrelated drops do not change data',t=>{
 const h=harness(t,null,{'campushub-device-v1':JSON.stringify(orderFixture())});h.click('#homeOrder');let source=h.$('[data-order-id="物理"]'),target=h.$('[data-order-id="高数"]');target.getBoundingClientRect=()=>({top:100,height:80,bottom:180});fakeDrag(h,'dragstart',source);const over=fakeDrag(h,'dragover',target,110);assert.equal(over.defaultPrevented,true);assert.equal(target.classList.contains('drop-before'),true);fakeDrag(h,'drop',target,110);assert.deepEqual(h.stored().courses,['物理','高数','英语']);assert.equal(h.$('.drag-source'),null);assert.equal(h.$('.drop-before'),null);
 source=h.$('[data-order-id="物理"]');target=h.$('[data-order-id="英语"]');target.getBoundingClientRect=()=>({top:100,height:80,bottom:180});fakeDrag(h,'dragstart',source);fakeDrag(h,'dragover',target,170);assert.equal(target.classList.contains('drop-after'),true);fakeDrag(h,'drop',target,170);assert.deepEqual(h.stored().courses,['高数','英语','物理']);
 const before=JSON.stringify(h.stored());fakeDrag(h,'dragstart',h.$('[data-order-id="英语"]'));fakeDrag(h,'dragend',h.$('[data-order-id="英语"]'));assert.equal(JSON.stringify(h.stored()),before);fakeDrag(h,'drop',h.$('[data-order-id="物理"]'),170);assert.equal(JSON.stringify(h.stored()),before);
 fakeDrag(h,'dragstart',h.$('[data-order-id="英语"]'));h.$('#orderDialog').close();h.click('#homeOrder');fakeDrag(h,'drop',h.$('[data-order-id="物理"]'),170);assert.equal(JSON.stringify(h.stored()),before);
});

test('Ordering failures roll back without changing visible rows and zero/one-item lists cannot be reordered',t=>{
 const fresh=harness(t);assert.equal(fresh.$('#homeOrder').disabled,true);addSubject(fresh);assert.equal(fresh.$('#homeOrder').disabled,true);fresh.click('#manageCourses');assert.equal(fresh.$('#managerOrder').disabled,true);fresh.$('#courseManager').close();fresh.click('[data-home-course]');assert.equal(fresh.$('#siteOrder').disabled,true);
 const h=harness(t,null,{'campushub-device-v1':JSON.stringify(orderFixture())}),before=JSON.stringify(h.stored());h.click('#homeOrder');h.run('save=()=>false');moved(h,'英语','up');assert.equal(JSON.stringify(h.stored()),before);assert.deepEqual(orderIds(h),['高数','英语','物理']);assert.deepEqual(Array.from(h.run('state.courses')),['高数','英语','物理']);assert.ok(h.$('#orderError').textContent.includes('未保存'));h.$('#orderDialog').close();h.click('[data-home-course][data-view="高数"]');h.click('#siteOrder');moved(h,'c','up');assert.equal(h.run('state.siteOrder'),undefined);assert.deepEqual(orderIds(h),['a','b','c']);assert.ok(h.$('#orderError').textContent.includes('未保存'));
});
