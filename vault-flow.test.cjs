const {readFileSync}=require('node:fs');const {webcrypto}=require('node:crypto');const vm=require('node:vm');const assert=require('node:assert/strict');
const source=readFileSync(__dirname+'/app.js','utf8');
function field(){return {value:'',required:false,focus(){}}}
function form(names){const elements=Object.fromEntries(names.map(n=>[n,field()]));return {elements,reset(){Object.values(elements).forEach(e=>e.value='')}}}
const nodes=new Map(),timers=new Map();let sequence=0,saved='',failSave=false;
for(const selector of ['#pinDialog','#credentialDialog'])nodes.set(selector,{open:false,handlers:{},showModal(){this.open=true},close(){this.open=false;this.handlers.close?.()},addEventListener(name,callback){this.handlers[name]=callback}});
nodes.set('#pinForm',form(['pin','pinConfirm']));nodes.set('#credentialForm',form(['recordUsername','recordPassword']));
const scope={crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
 $:selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',hidden:false,disabled:false});return nodes.get(selector)},
 state:{sites:[{id:'one',name:'Test site'}]},esc:s=>String(s),
 save(){if(failSave)return false;saved=JSON.stringify(scope.state);return true},toast(){},render(){},
 setTimeout(callback,delay){const id=++sequence;timers.set(id,{callback,delay});return id},clearTimeout(id){timers.delete(id)},
 document:{querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){}}
};vm.createContext(scope);
vm.runInContext(source.slice(source.indexOf('const VaultCrypto='),source.indexOf('function render()'))+'\nthis.revealed= revealedCredentials;',scope);
const pinForm=nodes.get('#pinForm'),credentialForm=nodes.get('#credentialForm');
const submitPin=()=>pinForm.onsubmit({preventDefault(){},target:pinForm});
const submitRecord=()=>credentialForm.onsubmit({preventDefault(){},target:credentialForm});
function enterPin(pin,confirmation=pin){pinForm.elements.pin.value=pin;pinForm.elements.pinConfirm.value=confirmation}
(async()=>{
 scope.requestVaultAccess({siteId:'one',type:'view'});
 assert.equal(nodes.get('#pinTitle').textContent,'设置六位查看密码');
 enterPin('314159','314150');await submitPin();assert.ok(nodes.get('#pinError').textContent.includes('不一致'));assert.equal(scope.state.vault,undefined);
 enterPin('314159');await submitPin();assert.ok(scope.state.vault);assert.equal(nodes.get('#credentialDialog').open,true);
 credentialForm.elements.recordUsername.value='test_account';credentialForm.elements.recordPassword.value='Fake-Test-Password!';
 await submitRecord();assert.ok(scope.state.sites[0].credentials);assert.equal(nodes.get('#credentialDialog').open,false);
 assert.equal(credentialForm.elements.recordPassword.value,'');assert.ok(!saved.includes('Fake-Test-Password!'));assert.ok(!saved.includes('test_account'));
 scope.requestVaultAccess({siteId:'one',type:'view'});enterPin('111111');await submitPin();assert.equal(scope.revealed.size,0);assert.equal(nodes.get('#pinDialog').open,true);assert.ok(nodes.get('#pinError').textContent.includes('不正确'));
 enterPin('314159');await submitPin();assert.equal(scope.revealed.get('one').username,'test_account');assert.equal(scope.revealed.get('one').password,'Fake-Test-Password!');
 const autoHide=[...timers.values()].find(t=>t.delay===30000);assert.ok(autoHide);autoHide.callback();assert.equal(scope.revealed.size,0);
 scope.requestVaultAccess({siteId:'one',type:'edit'});enterPin('314159');await submitPin();assert.equal(credentialForm.elements.recordUsername.value,'test_account');
 const before=JSON.stringify(scope.state.sites[0].credentials);credentialForm.elements.recordPassword.value='changed-test';failSave=true;await submitRecord();assert.equal(JSON.stringify(scope.state.sites[0].credentials),before);assert.equal(nodes.get('#credentialDialog').open,true);
 scope.lockVault();assert.equal(credentialForm.elements.recordPassword.value,'');assert.equal(scope.revealed.size,0);assert.equal(nodes.get('#credentialDialog').open,false);
 const vault=vm.runInContext('VaultCrypto',scope),context='campushub:legacy-personal',legacy=await vault.create('431285',context);
 scope.state.vault={...legacy.metadata,context};scope.state.sites[0].credentials=await vault.seal(legacy.key,{username:'legacy-test-user',password:'Fictional-Legacy-Secret'},context+':one');
 scope.requestVaultAccess({siteId:'one',type:'view'});enterPin('431285');await submitPin();assert.equal(scope.revealed.get('one').username,'legacy-test-user');scope.lockVault();
 console.log('Vault interaction tests passed: PIN setup/confirmation, encrypted save, wrong/correct PIN, reveal, auto-hide, protected edit, storage rollback and lock cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
