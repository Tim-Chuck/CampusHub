const test=require('node:test');const assert=require('node:assert/strict');
const C=require('./campus-core.js'),Sync=require('./sync-core.js');
const now='2026-10-26T10:00',parse=text=>C.parseNotice(text,now);

test('Notice recognition extracts links and explicit Chinese deadlines without network access',()=>{
 const text='【材料提交】\n请于2026年10月30日（星期五）晚上八点半前提交：https://example.edu/apply?id=3&from=notice。';
 const result=parse(text);assert.equal(result.due,'2026-10-30T20:30');assert.equal(result.candidates.length,1);assert.equal(result.title,'【材料提交】');assert.equal(result.note,text);
 assert.deepEqual(result.links,['https://example.edu/apply?id=3&from=notice']);
 for(const [date,due] of [['2026/11/01 17:30','2026-11-01T17:30'],['2026-11-01 24:00','2026-11-02T00:00'],['１１月１日下午五点三十分','2026-11-01T17:30'],['10月30日晚8点','2026-10-30T20:00']])assert.equal(parse('截止'+date).due,due);
});

test('Relative dates use supplied Shanghai date and state assumptions about missing time or year',()=>{
 for(const [date,due] of [['明天下午五点半','2026-10-27T17:30'],['后天18:00','2026-10-28T18:00'],['本周五20:00','2026-10-30T20:00'],['下星期一上午9点','2026-11-02T09:00'],['今晚八点','2026-10-26T20:00'],['明晚八点','2026-10-27T20:00']])assert.equal(parse('截至'+date).due,due);
 const result=parse('截至10月30日');assert.equal(result.due,'2026-10-30T23:59');assert.match(result.warnings.join(' '),/23:59/);
 const past=C.parseNotice('截至1月2日','2026-12-30T22:00');assert.equal(past.due,'2026-01-02T23:59');assert.match(past.warnings.join(' '),/已过去/);
 assert.equal(C.parseNotice('今天23:00',C.localNow(new Date('2026-10-26T18:00:00Z'))).due,'2026-10-27T23:00');
 assert.equal(parse('今晚十二点截止').due,'2026-10-27T00:00');
});

test('Start and end dates are separated and ambiguous multiple deadlines require selection',()=>{
 const result=parse('10月26日开始，10月30日18:00截止。详情见 https://example.edu/2026/10/27');assert.equal(result.due,'2026-10-30T18:00');assert.equal(result.candidates.length,2);
 for(const text of ['10月27日开会，10月30日提交','报名截止10月28日。材料截止10月30日。']){const result=parse(text);assert.equal(result.due,'');assert.equal(result.candidates.length,2);assert.match(result.warnings.join(' '),/多个日期/);}
});

test('URL extraction removes sentence punctuation, deduplicates and rejects unsafe credentials or schemes',()=>{
 const result=parse('入口：https://example.edu/a?id=1&b=2；备用：www.example.com/test。另一个：jw.example.edu.cn。邮箱：a@example.net 重复：https://example.edu/a?id=1&b=2');
 assert.deepEqual(result.links,['https://example.edu/a?id=1&b=2','https://www.example.com/test','https://jw.example.edu.cn/']);assert.equal(result.due,'');
 assert.deepEqual(parse('javascript:alert(1) data:text/html,abc https://user:secret@example.edu/').links,[]);
 assert.equal(parse('网址 https://example.edu/2026/10/30?due=2026-12-25').candidates.length,0);
});

test('Missing or invalid dates never silently turn into today; malformed notices are bounded',()=>{
 for(const text of ['下周再通知','2026年2月30日截止','截止2026-10-30 25:00','大后天提交','下下周五提交']){const result=parse(text);assert.equal(result.due,'');assert.match(result.warnings.join(' '),/手动填写/);}
 assert.throws(()=>parse('  '),/粘贴/);assert.throws(()=>parse('a'.repeat(2001)),/2000/);assert.throws(()=>parse(null),/粘贴/);
});

test('Task notice links survive offline sync and archive reuse and reject executable links',()=>{
 const task={id:'notice-task',title:'提交材料',due:'2026-10-30T20:00',done:false,course:'高数',siteId:'',note:'通知原文',url:'https://example.edu/apply?id=1'};
 const state={courses:['高数'],sites:[],tasks:[task],courseMeta:{},campusLinks:[],schedule:[],archives:[]};
 const restored=Sync.decode(Sync.encode(state));assert.equal(restored.data.tasks[0].url,task.url);
 const archived=C.archive(state,{name:'秋季',names:['高数'],keepActive:false},()=> 'archive-1');
 assert.equal(C.restore(archived,archived.archives[0],['高数'],true,()=> 'new-id').next.tasks[0].url,task.url);
 assert.match(C.validateTask({...task,url:'javascript:alert(1)'},state.courses,[]),/HTTP/);
 assert.throws(()=>Sync.encode({...state,tasks:[{...task,url:'javascript:alert(1)'}]}),/HTTP/);
});
