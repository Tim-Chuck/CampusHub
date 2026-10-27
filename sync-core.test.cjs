const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const Sync=require('./sync-core.js'),KEY='campushub-device-v1';
function fixture(){return {
 courses:['高等数学','英语'],courseMeta:{高等数学:{color:1,note:'函数与极限 📚'}},
 sites:[{id:'site-1',name:'学习入口',url:'https://example.edu/course',course:'高等数学',note:'交作业',purposes:['交作业']},{id:'public-1',name:'公共入口',url:'http://library.example.edu/',course:'公共资源',note:''}],
 tasks:[{id:'task-1',title:'第二章作业',course:'高等数学',siteId:'site-1',due:'2026-10-30T23:59',done:true,note:'附上解题过程'}],
 schedule:[{id:'lesson-1',title:'高等数学',location:'教学楼 201',teacher:'陈老师',startTime:'08:00',endTime:'09:40',repeat:'weekly',weekday:1,startWeek:1,endWeek:20,pattern:'odd',date:'',color:1,note:''},{id:'lesson-2',title:'英语补课',startTime:'10:00',endTime:'11:40',repeat:'once',date:'2026-10-28',color:2,importKey:'uid-xyz/20261028'}],
 scheduleSettings:{semesterStart:'2026-08-31',weeks:20},campusLinks:[{id:'campus-1',name:'图书馆',url:'https://library.example.edu/',category:'图书馆',note:'座位预约'}],
 archives:[{id:'archive-1',name:'春季学期',createdAt:'2026-07-01T12:00',keptActive:true,courses:[{name:'高等数学',note:'旧备注',color:2}],sites:[{id:'site-1',name:'学习入口',url:'https://example.edu/course',course:'高等数学',note:'旧章节'}],tasks:[]}]
};}
function memory(){const data=new Map();let failKey=null;return {getItem:k=>data.get(k)??null,setItem(k,v){if(k===failKey)throw new DOMException('Full','QuotaExceededError');data.set(k,v)},removeItem:k=>data.delete(k),failOn:k=>{failKey=k}};}
function rawCode(value){const bytes=Buffer.from(JSON.stringify(value));let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1}return 'CHUB1.'+bytes.toString('base64url')+'.'+((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');}

test('Offline code round-trips every data collection and Unicode without requiring Web Crypto or a server',()=>{
 const source=fixture(),code=Sync.encode(source),decoded=Sync.decode(' \n'+code.match(/.{1,79}/g).join('\n')+'\n');
 assert.match(code,/^CHUB1\.[\w-]+\.[a-f\d]{8}$/);assert.deepEqual(decoded.data,Sync.snapshot(source));assert.ok(Number.isFinite(Date.parse(decoded.createdAt)));
 assert.deepEqual(Sync.counts(decoded.data),{courses:2,sites:2,tasks:1,schedule:2,campusLinks:1,archives:1,credentials:0});assert.equal(decoded.data.courseMeta.英语.color,2);
 assert.equal(decoded.data.tasks[0].done,true);assert.equal(decoded.data.schedule[1].importKey,'uid-xyz/20261028');assert.equal(decoded.data.courseMeta.高等数学.note,'函数与极限 📚');
 const contaminated=fixture();contaminated.password='PLAINTEXT_SECRET';contaminated.sites[0].username='PLAINTEXT_SECRET';contaminated.sites[0].password='PLAINTEXT_SECRET';contaminated.tasks[0].extra='PLAINTEXT_SECRET';assert.ok(!JSON.stringify(Sync.decode(Sync.encode(contaminated))).includes('PLAINTEXT_SECRET'));
});

test('Encrypted active and archived credentials retain site IDs and legacy encryption context on another device',async()=>{
 const source=fs.readFileSync(__dirname+'/app.js','utf8'),scope={crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob};vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('const VaultCrypto='),source.indexOf('let pendingVaultAction='))+'\nthis.vault=VaultCrypto;',scope);
 const context='campushub:original',pin='812379',{key,metadata}=await scope.vault.create(pin,context),secret={username:'test-student',password:'Automated-test-only!'},encrypted=await scope.vault.seal(key,secret,context+':site-1'),data=fixture();data.vault={...metadata,context};data.sites[0].credentials=encrypted;data.archives[0].sites[0].credentials=encrypted;
 const decoded=Sync.decode(Sync.encode(data)).data,unlocked=await scope.vault.unlock(pin,decoded.vault,decoded.vault.context);
 for(const site of [decoded.sites[0],decoded.archives[0].sites[0]])assert.equal(JSON.stringify(await scope.vault.open(unlocked,site.credentials,decoded.vault.context+':'+site.id)),JSON.stringify(secret));
 assert.equal(Sync.counts(decoded).credentials,2);assert.ok(!JSON.stringify(decoded).includes(secret.password));await assert.rejects(()=>scope.vault.unlock('000000',decoded.vault,decoded.vault.context));
 const without=Sync.decode(Sync.encode(data,{includeCredentials:false})).data;assert.equal(without.vault,undefined);assert.equal(without.sites[0].credentials,undefined);assert.equal(without.archives[0].sites[0].credentials,undefined);
 const defaultContext=fixture();defaultContext.vault=metadata;assert.equal(Sync.snapshot(defaultContext).vault.context,'campushub:device');
});

test('Damaged, incomplete, unsupported and oversized codes are rejected before state can be used',()=>{
 const code=Sync.encode(fixture()),parts=code.split('.');assert.throws(()=>Sync.decode(code.slice(0,-1)),/同步码/);parts[1]=(parts[1][0]==='A'?'B':'A')+parts[1].slice(1);assert.throws(()=>Sync.decode(parts.join('.')),/修改/);
 assert.throws(()=>Sync.decode('CHUB2.aaaa.00000000'),/格式/);assert.throws(()=>Sync.decode('x'.repeat(Sync.MAX_CODE*1.1+1)),/过长/);
 for(const payload of [{type:'other',version:1,data:fixture(),createdAt:new Date().toISOString()},{type:'campushub-sync',version:9,data:fixture(),createdAt:new Date().toISOString()},{type:'campushub-sync',version:1,data:fixture(),createdAt:'invalid'}])assert.throws(()=>Sync.decode(rawCode(payload)),/版本或生成时间/);
 const tooLarge=fixture();tooLarge.tasks=Array.from({length:2000},(_,i)=>({...tooLarge.tasks[0],id:'task-'+i,note:'数'.repeat(1000)}));assert.throws(()=>Sync.encode(tooLarge),/2MB/);
});

test('Snapshot validation rejects unsafe URLs, prototype names, duplicate IDs and invalid dates, and repairs stale associations',()=>{
 const mutations=[d=>d.courses.push('__proto__'),d=>d.courses.push('home'),d=>d.courses.push('英语'),d=>d.sites[0].url='javascript:alert(1)',d=>d.sites[0].url='https://user:password@example.edu/',d=>d.sites.push(d.sites[0]),d=>d.sites[0].course='未知科目',d=>d.tasks[0].due='2026-02-30T12:00',d=>d.schedule[0].repeat='daily',d=>d.schedule[0].pattern='invalid',d=>d.schedule[0].endTime='07:00',d=>d.scheduleSettings.semesterStart='2026-09-01',d=>d.archives[0].courses[0].name='constructor',d=>d.sites[0].credentials={iv:'bad',ciphertext:'bad'},d=>d.vault={version:1,iterations:1}];
 for(const mutate of mutations){const d=fixture();mutate(d);assert.throws(()=>Sync.decode(rawCode({type:'campushub-sync',version:1,createdAt:new Date().toISOString(),data:d})));}
 const stale=fixture();stale.tasks[0].siteId='deleted';assert.equal(Sync.snapshot(stale).tasks[0].siteId,'');assert.equal(Sync.snapshot(fixture()).tasks[0].siteId,'site-1');
 const minimal={courses:[],sites:[]};assert.equal(Sync.counts(Sync.decode(Sync.encode(minimal)).data).courses,0);
});

test('Replacement saves a full recovery snapshot first; both write failures preserve current data and prior backup',()=>{
 const storage=memory(),before=Sync.snapshot(fixture()),next={courses:['物理'],sites:[]};storage.setItem(KEY,JSON.stringify(before));storage.setItem(Sync.BACKUP_KEY,'old-backup');
 storage.failOn(Sync.BACKUP_KEY);assert.throws(()=>Sync.replace(storage,KEY,next,before));assert.equal(storage.getItem(KEY),JSON.stringify(before));assert.equal(storage.getItem(Sync.BACKUP_KEY),'old-backup');
 storage.failOn(KEY);assert.throws(()=>Sync.replace(storage,KEY,next,before));assert.equal(storage.getItem(KEY),JSON.stringify(before));assert.equal(storage.getItem(Sync.BACKUP_KEY),'old-backup');
 storage.failOn(null);Sync.replace(storage,KEY,next,before);assert.equal(JSON.parse(storage.getItem(KEY)).courses[0],'物理');assert.deepEqual(Sync.backup(storage).data,before);
 storage.failOn(KEY);assert.throws(()=>Sync.restore(storage,KEY));assert.equal(JSON.parse(storage.getItem(KEY)).courses[0],'物理');assert.deepEqual(Sync.backup(storage).data,before);
 storage.failOn(null);assert.deepEqual(Sync.restore(storage,KEY),before);assert.deepEqual(JSON.parse(storage.getItem(KEY)),before);assert.equal(storage.getItem(Sync.BACKUP_KEY),null);
});
test('Manual website order survives sync, backup and restore while stale deleted IDs are discarded',()=>{
 const data=fixture();data.siteOrder=['public-1','site-1','deleted'];const decoded=Sync.decode(Sync.encode(data)).data;assert.deepEqual(decoded.siteOrder,['public-1','site-1']);assert.deepEqual(decoded.sites.map(s=>s.id),['site-1','public-1']);
 const storage=memory();storage.setItem(KEY,JSON.stringify(decoded));Sync.replace(storage,KEY,{courses:[],sites:[]},decoded);assert.deepEqual(Sync.restore(storage,KEY).siteOrder,['public-1','site-1']);assert.throws(()=>Sync.snapshot({...data,siteOrder:['site-1','site-1']}),/重复/);assert.throws(()=>Sync.snapshot({...data,siteOrder:['<bad>']}),/标识/);
});
