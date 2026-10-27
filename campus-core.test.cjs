const test=require('node:test');const assert=require('node:assert/strict');const C=require('./campus-core.js');
function fixture(){return {courses:['高等数学','英语'],courseMeta:{高等数学:{note:'作业每周五提交',color:2},英语:{note:'听力练习',color:1}},sites:[{id:'math-site',name:'作业平台',url:'https://example.edu/work',course:'高等数学',note:'第二章',purposes:['交作业'],credentials:{iv:'fake-iv',ciphertext:'fake-ciphertext'}},{id:'english-site',name:'听力平台',url:'https://example.edu/listen',course:'英语'}],tasks:[{id:'task-1',title:'高数作业',course:'高等数学',siteId:'math-site',due:'2026-10-24T23:59',done:false},{id:'task-2',title:'听力',course:'英语',due:'2026-10-25T18:00',done:true}],schedule:[{id:'lesson',title:'高等数学'}],campusLinks:[{id:'library',name:'图书馆'}],vault:{salt:'fake-salt',check:{ciphertext:'check'}},archives:[]}}
let sequence=0;const id=()=>`new-${++sequence}`;
test('Task reminders use Shanghai dates and keep overdue work until explicitly completed',()=>{
 assert.equal(C.localNow(new Date('2026-10-23T16:30:00Z')),'2026-10-24T00:30');
 assert.equal(C.validDue('2026-02-30T10:00'),false);assert.equal(C.validDue('2026-10-24T24:00'),false);assert.equal(C.validDue('2026-10-24T10:30'),true);
 const tasks=[{id:'overdue',due:'2026-10-22T23:59'},{id:'today',due:'2026-10-24T23:59'},{id:'later',due:'2026-11-01T08:00'},{id:'done',due:'2026-10-24T22:00',done:true}];
 assert.deepEqual(C.upcoming(tasks,'2026-10-24T09:00').map(t=>t.id),['overdue','today']);assert.equal(C.taskStatus(tasks[0],'2026-10-24T09:00'),'已逾期');assert.equal(C.taskStatus(tasks[1],'2026-10-24T09:00'),'今天截止');
 const state=fixture();assert.equal(C.validateTask({...state.tasks[0],siteId:'english-site'},state.courses,state.sites),'关联网站已变更，请重新选择。');assert.equal(C.validateTask(state.tasks[0],state.courses,state.sites),null);
});
test('Today overview shows ongoing and upcoming lessons and respects recurrence boundaries',()=>{
 const state={scheduleSettings:{semesterStart:'2026-08-31',weeks:20},schedule:[{id:'past',title:'早课',repeat:'once',date:'2026-10-24',startTime:'08:00',endTime:'09:00'},{id:'ongoing',title:'高数',repeat:'weekly',weekday:6,startWeek:1,endWeek:20,pattern:'all',startTime:'09:00',endTime:'10:40'},{id:'tomorrow',title:'英语',repeat:'once',date:'2026-10-25',startTime:'10:00',endTime:'11:00'}]};
 assert.deepEqual(C.todayLessons(state,'2026-10-24T09:30').map(l=>l.id),['ongoing']);
});
test('Archiving is an explicit immutable snapshot and retains active subjects by default',()=>{
 const state=fixture(),next=C.archive(state,{name:'秋季',names:['高等数学']},id,'2026-10-24T12:00');
 assert.deepEqual(next.courses,state.courses);assert.equal(next.sites.length,2);assert.equal(next.tasks.length,2);assert.equal(state.archives.length,0);assert.equal(next.archives[0].courses.length,1);
 next.sites[0].note='改动';assert.equal(next.archives[0].sites[0].note,'第二章');assert.equal(next.archives[0].sites[0].credentials.ciphertext,'fake-ciphertext');
 assert.throws(()=>C.archive(state,{name:'秋季',names:[]},id),/至少/);
});
test('Optional move and selective reuse preserve encrypted IDs, schedules, and current records',()=>{
 const state=fixture(),moved=C.archive(state,{name:'秋季',names:['高等数学'],keepActive:false},id),snapshot=moved.archives[0];
 assert.deepEqual(moved.courses,['英语']);assert.equal(moved.sites.length,1);assert.equal(moved.tasks.length,1);assert.deepEqual(moved.schedule,state.schedule);assert.deepEqual(moved.campusLinks,state.campusLinks);assert.deepEqual(moved.vault,state.vault);
 const reuse=C.restore(moved,snapshot,['高等数学'],false,id);assert.equal(reuse.sites,1);assert.equal(reuse.tasks,0);assert.equal(reuse.next.sites.find(s=>s.id==='math-site').credentials.ciphertext,'fake-ciphertext');assert.equal(reuse.next.tasks.length,1);
 reuse.next.courseMeta.高等数学.note='下学期的说明';const withTasks=C.restore(reuse.next,snapshot,['高等数学'],true,id);assert.equal(withTasks.sites,0);assert.equal(withTasks.tasks,1);assert.equal(withTasks.next.courseMeta.高等数学.note,'下学期的说明');assert.equal(withTasks.next.tasks.find(t=>t.id==='task-1').siteId,'math-site');assert.equal(C.restore(withTasks.next,snapshot,['高等数学'],true,id).tasks,0);
});
test('Share export and import use an allowlist and exclude credentials, vaults, tasks, and sensitive query keys',()=>{
 const state=fixture();state.sites[0].url+='?token=FAKE_TOKEN&chapter=2';state.sites[0].password='FAKE_PASSWORD';
 const pack=C.makePack(state,['高等数学']),text=JSON.stringify(pack);for(const secret of ['FAKE_PASSWORD','FAKE_TOKEN','credentials','ciphertext','vault','salt','tasks'])assert.equal(text.includes(secret),false);
 const incoming=JSON.parse(text);incoming.vault={salt:'injected'};incoming.courses[0].credentials={password:'injected'};incoming.courses[0].sites[0].credentials={ciphertext:'injected'};
 const parsed=C.parsePack(JSON.stringify(incoming));assert.deepEqual(Object.keys(parsed.courses[0]).sort(),['color','name','note','sites']);assert.deepEqual(Object.keys(parsed.courses[0].sites[0]).sort(),['name','note','purposes','url']);
 const target=fixture();target.sites[0].url=parsed.courses[0].sites[0].url;const merged=C.mergePack(target,parsed,['高等数学'],id);assert.equal(merged.duplicates,1);assert.equal(merged.sites,0);assert.equal(merged.next.sites[0].credentials.ciphertext,'fake-ciphertext');assert.equal(merged.next.vault.salt,'fake-salt');
 const empty={courses:[],sites:[],courseMeta:{}};const first=C.mergePack(empty,parsed,['高等数学'],id);assert.equal(first.courses,1);assert.equal(first.sites,1);assert.equal(first.next.sites[0].credentials,undefined);assert.equal(C.mergePack(first.next,parsed,['高等数学'],id).sites,0);
});
test('Reusing a renamed subject creates independent entries without reusing encrypted IDs',()=>{
 const state=fixture(),kept=C.archive(state,{name:'旧学期',names:['高等数学']},id),snapshot=kept.archives[0];
 kept.courses[0]='高等数学二';kept.sites[0].course='高等数学二';kept.tasks[0].course='高等数学二';
 const result=C.restore(kept,snapshot,['高等数学'],true,id),copy=result.next.sites.find(s=>s.course==='高等数学');
 assert.equal(result.sites,1);assert.equal(result.credentialsSkipped,1);assert.notEqual(copy.id,'math-site');assert.equal(copy.credentials,undefined);assert.equal(result.next.sites.find(s=>s.id==='math-site').credentials.ciphertext,'fake-ciphertext');assert.equal(result.next.tasks.find(t=>t.course==='高等数学').siteId,copy.id);assert.equal(C.restore(result.next,snapshot,['高等数学'],true,id).sites,0);
});
test('Invalid packs reject unsafe URLs, prototype keys, duplicate names and unsupported formats',()=>{
 const good=C.makePack(fixture(),['高等数学']);
 for(const name of ['__proto__',' __proto__ ','constructor','tasks']){const p=structuredClone(good);p.courses[0].name=name;assert.throws(()=>C.parsePack(JSON.stringify(p)));}
 for(const value of ['javascript:alert(1)','data:text/html,hi','https://user:password@example.edu/']){const p=structuredClone(good);p.courses[0].sites[0].url=value;assert.throws(()=>C.parsePack(JSON.stringify(p)));}
 assert.throws(()=>C.parsePack('not json'));assert.throws(()=>C.parsePack(' '.repeat(1024*1024+1)));const duplicate=structuredClone(good);duplicate.courses.push(structuredClone(duplicate.courses[0]));assert.throws(()=>C.parsePack(JSON.stringify(duplicate)));
 assert.deepEqual(C.cleanPurposes(['交作业','交作业','未知']),['交作业']);
});
test('Custom ordering keeps original site creation order and only moves the visible subset',()=>{
 const sites=[{id:'a'},{id:'hidden'},{id:'b'},{id:'c'}],original=JSON.stringify(sites);
 assert.deepEqual(C.orderedSites(sites,['c','missing','a','c']).map(s=>s.id),['c','a','hidden','b']);assert.equal(JSON.stringify(sites),original);
 const ids=sites.map(s=>s.id);assert.deepEqual(C.reorderSubset(ids,['a','c'],'c','a'),['c','hidden','b','a']);assert.deepEqual(C.reorderSubset(ids,['a','c'],'a','c',true),['c','hidden','b','a']);assert.deepEqual(C.reorderSubset(ids,['a','c'],'missing','a'),ids);assert.deepEqual(C.reorderSubset(ids,['a','c'],'a','a'),ids);assert.deepEqual(ids,['a','hidden','b','c']);
});

test('Course packs and optional archive snapshots retain the manual website sequence',()=>{
 const data=fixture();data.sites.push({...data.sites[0],id:'math-second',name:'第二个入口',url:'https://example.edu/second'});data.siteOrder=['math-second','english-site','math-site'];
 assert.deepEqual(C.makePack(data,['高等数学']).courses[0].sites.map(s=>s.name),['第二个入口','作业平台']);const archived=C.archive(data,{name:'期末',names:['高等数学'],keepActive:true},id);assert.deepEqual(archived.archives[0].sites.map(s=>s.id),['math-second','math-site']);assert.deepEqual(data.sites.map(s=>s.id),['math-site','english-site','math-second']);
});
