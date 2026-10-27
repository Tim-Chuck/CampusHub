const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');const S=require('./schedule-core.js');const {parseCalendar}=require('./calendar-import.cjs');
function field(){return {value:'',files:[],checked:false,disabled:false,focus(){}}}
function form(names){const elements=Object.fromEntries(names.map(n=>[n,field()]));return {elements,reset(){for(const item of Object.values(elements)){item.value='';item.files=[]}},onsubmit:null}}
function harness(){
 const nodes=new Map();let saved='',failSave=false,boxes=[];
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,open:false,textContent:'',innerHTML:'',disabled:false,style:{setProperty(){}},classList:{toggle(){}},setAttribute(){},focus(){},handlers:{},addEventListener(name,fn){this.handlers[name]=fn},showModal(){this.open=true},close(){this.open=false;this.handlers.close?.()}});return nodes.get(selector)};
 nodes.set('#lessonForm',form(['title','location','teacher','startTime','endTime','repeat','weekday','startWeek','endWeek','pattern','date','color','note']));
 nodes.set('#scheduleSettingsForm',form(['semesterStart','weeks']));nodes.set('#scheduleImportForm',form(['calendarUrl','calendarFile','from','to','calendarText']));
 const events=parseCalendar(fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8'),'2026-10-01','2026-11-30').events;
 const scope={ScheduleCore:{...S,today:()=> '2026-10-23'},state:{courses:['高等数学'],schedule:[],scheduleSettings:{semesterStart:'2026-08-31',weeks:20}},view:'timetable',crypto:webcrypto,structuredClone,AbortController,
  palette:[['#fff','#111'],['#fff','#111'],['#fff','#111'],['#fff','#111'],['#fff','#111']],esc:value=>String(value),$:node,toast(){},render(){},
  save(){if(failSave)return false;saved=JSON.stringify(scope.state);return true},
  document:{addEventListener(){},querySelectorAll(selector){return boxes.filter(box=>(!selector.includes(':not(:disabled)')||!box.disabled)&&(!selector.includes(':checked')||box.checked))}},
  fetch:async()=>({ok:true,json:async()=>({events,warnings:{}})}),setTimeout(){return 1},clearTimeout(){}
 };vm.createContext(scope);vm.runInContext(fs.readFileSync(__dirname+'/timetable.js','utf8'),scope);
 return {scope,node,events,saved:()=>saved,setFail:value=>failSave=value,setBoxes:value=>boxes=value};
}
test('Timetable controller adds, edits, rolls back failed saves and validates semester settings',()=>{
 const h=harness(),{scope,node}=h;scope.openLessonEditor();const f=node('#lessonForm');f.elements.title.value='高等数学';f.elements.location.value='A301';f.elements.endTime.value='07:00';f.onsubmit({preventDefault(){},target:f});assert.equal(scope.state.schedule.length,0);assert.ok(node('#lessonError').textContent);
 f.elements.endTime.value='09:40';f.onsubmit({preventDefault(){},target:f});assert.equal(scope.state.schedule.length,1);const id=scope.state.schedule[0].id;assert.equal(JSON.parse(h.saved()).schedule[0].title,'高等数学');
 scope.openLessonEditor(id);f.elements.location.value='A302';f.onsubmit({preventDefault(){},target:f});assert.equal(scope.state.schedule.length,1);assert.equal(scope.state.schedule[0].location,'A302');
 scope.openLessonEditor(id);f.elements.location.value='not-saved';h.setFail(true);f.onsubmit({preventDefault(){},target:f});assert.equal(scope.state.schedule[0].location,'A302');assert.ok(node('#lessonDialog').open);h.setFail(false);
 node('#scheduleSettingsButton').onclick();const settings=node('#scheduleSettingsForm');settings.elements.semesterStart.value='2026-09-01';settings.onsubmit({preventDefault(){},target:settings});assert.ok(node('#scheduleSettingsError').textContent.includes('周一'));settings.elements.semesterStart.value='2026-09-07';settings.onsubmit({preventDefault(){},target:settings});assert.equal(scope.state.scheduleSettings.semesterStart,'2026-09-07');
 node('#lessonDelete').onclick();assert.equal(node('#lessonDeletePrompt').hidden,false);node('#lessonDeleteConfirm').onclick();assert.equal(scope.state.schedule.length,0);
});
test('Import controller previews without writing, skips duplicates, and persists selected lessons',async()=>{
 const h=harness(),{scope,node,events}=h;scope.state.schedule=[{...events[0],id:'existing'}];node('#scheduleImportButton').onclick();const f=node('#scheduleImportForm');f.elements.calendarUrl.value='https://example.com/calendar.ics';h.setBoxes(events.map((_,i)=>({disabled:i===0,checked:i!==0,dataset:{importIndex:String(i)}})));
 await f.onsubmit({preventDefault(){},target:f});assert.equal(scope.state.schedule.length,1);assert.equal(node('#scheduleImportResults').hidden,false);assert.ok(node('#scheduleImportSummary').textContent.includes('1 节重复'));assert.equal(node('#scheduleImportConfirm').textContent,'导入 3 节课程');
 node('#scheduleImportConfirm').onclick();assert.equal(scope.state.schedule.length,4);assert.equal(JSON.parse(h.saved()).schedule.length,4);assert.equal(new Set(scope.state.schedule.map(i=>i.importKey)).size,4);assert.equal(node('#scheduleImportDialog').open,false);assert.equal(f.elements.calendarUrl.value,'');
});
