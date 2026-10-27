const test=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
const source=readFileSync(__dirname+'/app.js','utf8'),KEY='campushub-device-v1';
const scope={DEVICE_STORAGE_KEY:KEY,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob};vm.createContext(scope);
vm.runInContext(source.slice(source.indexOf('function loadDeviceState('),source.indexOf('let state;')),scope);
vm.runInContext(source.slice(source.indexOf('const VaultCrypto='),source.indexOf('let pendingVaultAction='))+'\nthis.vault=VaultCrypto;',scope);
function memory(entries=[],failWrite=false){const data=new Map(entries);return {getItem:key=>data.get(key)??null,setItem(key,value){if(failWrite)throw Error('Quota');data.set(key,value)}}}
const legacy=value=>JSON.stringify(value);
test('A fresh browser gets one empty device store without creating account records',()=>{
 const storage=memory();scope.loadDeviceState(storage);assert.deepEqual(JSON.parse(storage.getItem(KEY)),{courses:[],sites:[],courseMeta:{}});assert.equal(storage.getItem('campushub-accounts-v1'),null);assert.equal(storage.getItem('campushub-profile-personal'),null);
});
test('Existing device data takes precedence and is never replaced by an old space',()=>{
 const value={courses:['高数'],sites:[],tasks:[{title:'作业'}],schedule:[{title:'高数'}],archives:[{name:'旧学期'}]},storage=memory([[KEY,legacy(value)],['campushub-profile-personal',legacy({courses:['旧数据'],sites:[]})]]);
 scope.loadDeviceState(storage);assert.deepEqual(JSON.parse(storage.getItem(KEY)),value);
});
test('The active legacy space migrates all fields and retains inactive legacy data as a local backup',()=>{
 const value={courses:['英语'],sites:[{id:'one',name:'入口'}],tasks:[{id:'task'}],schedule:[{id:'lesson'}],campusLinks:[{id:'library'}],archives:[{id:'term'}],courseMeta:{英语:{color:1}}},old=legacy(value),personal=legacy({courses:['个人数据'],sites:[]});
 const storage=memory([['campushub-accounts-v1',legacy({active:'original'})],['campushub-profile-original',old],['campushub-profile-personal',personal]]);
 scope.loadDeviceState(storage);assert.deepEqual(JSON.parse(storage.getItem(KEY)),value);assert.equal(storage.getItem('campushub-profile-original'),old);assert.equal(storage.getItem('campushub-profile-personal'),personal);
});
test('An intentionally empty active space stays empty and oldest-format data remains supported',()=>{
 const empty={courses:[],sites:[]},storage=memory([['campushub-accounts-v1',legacy({active:'personal'})],['campushub-profile-personal',legacy(empty)],['campushub-profile-original',legacy({courses:['演示'],sites:[]})]]);
 scope.loadDeviceState(storage);assert.deepEqual(JSON.parse(storage.getItem(KEY)),empty);
 const old=legacy({courses:['旧版科目'],sites:[]}),oldStorage=memory([['campushub-accounts-v1','invalid'],['campushub-v1',old]]);scope.loadDeviceState(oldStorage);assert.equal(oldStorage.getItem(KEY),old);assert.equal(oldStorage.getItem('campushub-v1'),old);
});
test('Storage write failures leave legacy data intact and still return the working data',()=>{
 const old=legacy({courses:['不能丢失'],sites:[]}),storage=memory([['campushub-profile-personal',old]],true),loaded=scope.loadDeviceState(storage);assert.equal(loaded.courses[0],'不能丢失');assert.equal(storage.getItem(KEY),null);assert.equal(storage.getItem('campushub-profile-personal'),old);
});
test('Legacy encrypted credentials retain their original binding and remain decryptable after migration',async()=>{
 const context='campushub:personal',pin='283149',{key,metadata}=await scope.vault.create(pin,context),record={username:'fictional-user',password:'Only-A-Fake-Test-Secret'},envelope=await scope.vault.seal(key,record,context+':old-site');
 const old=legacy({courses:['高数'],sites:[{id:'old-site',course:'高数',credentials:envelope}],vault:metadata,archives:[{sites:[{id:'old-site',credentials:envelope}]}]}),storage=memory([['campushub-accounts-v1',legacy({active:'personal'})],['campushub-profile-personal',old]]);
 scope.loadDeviceState(storage);const migrated=JSON.parse(storage.getItem(KEY));assert.equal(migrated.vault.context,context);const restored=await scope.vault.unlock(pin,migrated.vault,migrated.vault.context);
 assert.equal(JSON.stringify(await scope.vault.open(restored,migrated.sites[0].credentials,context+':old-site')),JSON.stringify(record));assert.equal(JSON.stringify(await scope.vault.open(restored,migrated.archives[0].sites[0].credentials,context+':old-site')),JSON.stringify(record));assert.equal(storage.getItem('campushub-profile-personal'),old);
 assert.equal(storage.getItem(KEY).includes(record.password),false);
});
