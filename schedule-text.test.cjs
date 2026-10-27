const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const S=require('./schedule-core.js');const {parseCalendar}=require('./calendar-import.cjs');
const fixture=fs.readFileSync(__dirname+'/test-fixtures/timetable.ics','utf8');

test('Raw ICS text becomes a UTF-8 calendar file with CRLF while preserving recurrence and timezone data',()=>{
 const result=S.normalizeICSText(fixture.replace(/\r\n/g,'\n'));
 assert.equal(result,fixture.replace(/\r\n|\r|\n/g,'\n').trim().replace(/\n/g,'\r\n')+'\r\n');
 assert.match(result,/RRULE:/);assert.match(result,/EXDATE/);assert.ok(!/(^|[^\r])\n/.test(result));
 assert.deepEqual(parseCalendar(result,'2026-10-01','2026-11-30'),parseCalendar(fixture,'2026-10-01','2026-11-30'));
});

test('Copied code fences and BOM are removed without altering folded Unicode or escaped text',()=>{
 const raw='BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:test\nDTSTART:20261026T000000Z\nDTEND:20261026T010000Z\nSUMMARY:中文😀课程\n 续行\nDESCRIPTION:第一行\\n第二行\\,含逗号\nEND:VEVENT\nEND:VCALENDAR';
 const result=S.normalizeICSText('\uFEFF  '+String.fromCharCode(96).repeat(3)+'ics\n'+raw+'\n'+String.fromCharCode(96).repeat(3)+'  ');
 assert.ok(result.includes('SUMMARY:中文😀课程\r\n 续行\r\n'));assert.ok(result.includes('第一行\\n第二行\\,含逗号'));assert.equal(parseCalendar(result,'2026-10-26','2026-10-26').events[0].title,'中文😀课程续行');
 assert.equal(S.normalizeICSText(raw.replace(/\n/g,'\r')),S.normalizeICSText(raw));
});

test('Calendar file generation keeps all-day, alarm and timezone components, independent of preview dates',()=>{
 const raw='BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:all-day\nDTSTART;VALUE=DATE:20261026\nDTEND;VALUE=DATE:20261027\nSUMMARY:全天活动\nBEGIN:VALARM\nTRIGGER:-PT10M\nACTION:DISPLAY\nDESCRIPTION:提醒\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR';
 const result=S.normalizeICSText(raw);assert.ok(result.includes('BEGIN:VALARM'));assert.ok(result.includes('DTSTART;VALUE=DATE:20261026'));assert.equal(parseCalendar(result,'2026-10-26','2026-10-26').warnings.allDay,1);
});

test('Empty, incomplete, non-calendar and oversized text are rejected before creating a file',()=>{
 for(const value of ['',null,'<html>login</html>','高数 周一 08:00-09:00','BEGIN:VCALENDAR\nVERSION:2.0','END:VCALENDAR'])assert.throws(()=>S.normalizeICSText(value),/ICS/);
 assert.throws(()=>S.normalizeICSText('BEGIN:VCALENDAR\n'+('字'.repeat(800000))+'\nEND:VCALENDAR'),/2MB/);
 assert.throws(()=>S.normalizeICSText('x'.repeat(2*1024*1024+1)),/2MB/);
});
