const $=s=>document.querySelector(s);
const palette=['blue','sage','clay','mauve','oat'].map(name=>[`var(--course-${name}-bg)`,`var(--course-${name}-ink)`]);
const DEVICE_STORAGE_KEY='campushub-device-v1';
function loadDeviceState(storage){
 const read=key=>{try{const value=JSON.parse(storage.getItem(key));return value&&Array.isArray(value.courses)&&Array.isArray(value.sites)?value:null}catch{return null}};
 const current=read(DEVICE_STORAGE_KEY);if(current)return current;
 const persist=value=>{try{storage.setItem(DEVICE_STORAGE_KEY,JSON.stringify(value))}catch{}return value};
 // Preserve the active legacy space and its encryption context. Old keys remain as a backup.
 let legacyId;try{legacyId=JSON.parse(storage.getItem('campushub-accounts-v1'))?.active}catch{}
 const ids=[...new Set([typeof legacyId==='string'?legacyId:null,'personal','original'].filter(Boolean))];
 for(const id of ids){const value=read('campushub-profile-'+id);if(value){if(value.vault)value.vault={...value.vault,context:value.vault.context||'campushub:'+id};return persist(value)}}
 const legacy=read('campushub-v1');if(legacy){if(legacy.vault)legacy.vault={...legacy.vault,context:legacy.vault.context||'campushub:original'};return persist(legacy)}
 return persist({courses:[],sites:[],courseMeta:{}});
}
let state;try{state=loadDeviceState(localStorage)}catch{state={courses:[],sites:[],courseMeta:{}}}
let view='home',editing=null,purposeFilter='';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const commonWebsites=[
 {name:'锐捷通',url:'https://www.rjt100.com/',aliases:['rjt','ruijietong','数刷刷','学考通']},
 {name:'学习通',url:'https://i.chaoxing.com/',aliases:['超星','chaoxing','xuexitong','xxt']},
 {name:'智慧树',url:'https://www.zhihuishu.com/',aliases:['知到','zhihuishu','zhidao','zhs']},
 {name:'中国大学MOOC',url:'https://www.icourse163.org/',aliases:['慕课','中国大学慕课','网易慕课','mooc','icourse163','zhongguodaxuemooc']},
 {name:'学堂在线',url:'https://www.xuetangx.com/',aliases:['xuetangx','xuetangzaixian','xtzx']},
 {name:'雨课堂',url:'https://www.yuketang.cn/',aliases:['yuketang','ykt']},
 {name:'智慧职教',url:'https://www.icve.com.cn/',aliases:['职教云','icve','zhihuizhijiao','zhijiaoyun']},
 {name:'蓝墨云班课',url:'https://www.mosoteach.cn/',aliases:['云班课','蓝墨','mosoteach','lanmo','yunbanke']},
 {name:'中国知网',url:'https://www.cnki.net/',aliases:['知网','cnki','zhongguozhiwang','zhiwang']},
 {name:'智慧高教',url:'https://higher.smartedu.cn/',aliases:['国家高等教育智慧教育平台','高教平台','smartedu','zhihuigaojiao']}
];
function matchCommonWebsites(value){
 const query=String(value??'').trim().toLowerCase().replace(/\s+/g,'');
 return commonWebsites.filter(site=>[site.name,...site.aliases,site.url].some(text=>text.toLowerCase().replace(/\s+/g,'').includes(query)));
}
function renderWebsiteSuggestions(){
 const form=$('#form'),matches=matchCommonWebsites(form.elements.name.value);
 $('#websiteSuggestions').innerHTML=matches.map(site=>`<button type="button" class="website-suggestion" data-website-preset="${esc(site.name)}" title="${esc(site.url)}" aria-label="选择${esc(site.name)}，自动填写官网地址" aria-pressed="${form.elements.name.value===site.name&&form.elements.url.value===site.url}">${esc(site.name)}</button>`).join('');
 $('#websiteSuggestions').hidden=!matches.length;
 $('#websiteSuggestionStatus').textContent=matches.length?'选择一个，自动填写网站地址。':'没有匹配的常用网站，可直接填写名称和地址。';
}
function safeUrl(value){
 const input=String(value??'').trim();
 if(!input||/[\s\\]/u.test(input))return null;
 let normalized=input;
 if(input.startsWith('//'))normalized='https:'+input;
 else if(!/^https?:\/\//i.test(input)){
  // A host with a port is a valid shorthand; other explicit schemes are not.
  if(/^[a-z][a-z\d+.-]*:/i.test(input)&&!/^([^/:]+|\[[\da-f:]+\]):\d+(?:[/?#]|$)/i.test(input))return null;
  normalized='https://'+input;
 }
 try{
  const url=new URL(normalized);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
  const host=url.hostname;
  if(host!=='localhost'&&!host.startsWith('[')&&(!host.includes('.')||host.startsWith('.')||host.endsWith('..')||host.includes('..')))return null;
  return url.href;
 }catch{return null}
}
function save(){try{localStorage.setItem(DEVICE_STORAGE_KEY,JSON.stringify(state));return true}catch{toast('浏览器存储不可用，本次修改仅保留至页面关闭');return false}}
let timer;function toast(t){$('#toast').textContent=t;$('#toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('visible'),2700)}
state.courseMeta ||= {};
let editingCourse=null,courseEditorOrigin='home';
function color(course){return palette[state.courseMeta[course]?.color ?? Math.max(0,state.courses.indexOf(course)+1)%palette.length]}
const VaultCrypto=(()=>{
 const encoder=new TextEncoder(),decoder=new TextDecoder();
 const iterations=600000;
 const pack=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
 const unpack=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 async function derive(pin,salt){
  if(!/^\d{6}$/.test(pin))throw Error('PIN_FORMAT');
  const material=await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:unpack(salt),iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(key,value,context){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},key,encoder.encode(JSON.stringify(value)));
  return {iv:pack(iv),ciphertext:pack(ciphertext)};
 }
 async function open(key,envelope,context){
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:unpack(envelope.iv),additionalData:encoder.encode(context)},key,unpack(envelope.ciphertext));
  return JSON.parse(decoder.decode(plaintext));
 }
 async function create(pin,context){
  const salt=pack(crypto.getRandomValues(new Uint8Array(16))),key=await derive(pin,salt);
  return {key,metadata:{version:1,iterations,salt,check:await seal(key,{purpose:'campushub-vault'},context+':check')}};
 }
 async function unlock(pin,metadata,context){
  if(metadata.version!==1||metadata.iterations!==iterations)throw Error('VAULT_FORMAT');
  const key=await derive(pin,metadata.salt),check=await open(key,metadata.check,context+':check');
  if(check.purpose!=='campushub-vault')throw Error('VAULT_FORMAT');return key;
 }
 return {seal,open,create,unlock};
})();
 function vaultContext(){return state.vault?.context||'campushub:device'}
let pendingVaultAction=null,credentialSession=null,credentialTimer=null,revealTimer=null;
const revealedCredentials=new Map();
const eyeIcon=hidden=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${hidden?'':'<path d="m3 3 18 18"/>'}</svg>`;
function credentialMarkup(site){
 const value=revealedCredentials.get(site.id),isVisible=Boolean(value);
 return `<div class="credential-lines" data-credential-lines="${esc(site.id)}"><div class="credential-values"><div><span>账号：</span><span class="credential-value">${isVisible?esc(value.username):'******'}</span></div><div><span>密码：</span><span class="credential-value">${isVisible?esc(value.password):'******'}</span></div></div><button class="credential-eye" data-reveal="${esc(site.id)}" aria-label="${isVisible?'隐藏':'查看'} ${esc(site.name)}的账密" aria-pressed="${isVisible}" title="${isVisible?'隐藏账密':site.credentials?'验证六位密码后查看':'记录账号和密码'}">${eyeIcon(!isVisible)}</button></div>`;
}
function syncCredentialRows(){
 document.querySelectorAll('[data-credential-lines]').forEach(node=>{const site=state.sites.find(s=>s.id===node.dataset.credentialLines);if(site)node.outerHTML=credentialMarkup(site)});
}
function concealCredentials(){clearTimeout(revealTimer);revealedCredentials.clear();syncCredentialRows()}
function closeCredentialEditor(){clearTimeout(credentialTimer);credentialSession=null;$('#credentialForm').reset();$('#credentialError').textContent='';}
function lockVault(){
 pendingVaultAction=null;concealCredentials();
 if($('#pinDialog').open)$('#pinDialog').close();
 if($('#credentialDialog').open)$('#credentialDialog').close();
 closeCredentialEditor();
}
function requestVaultAccess(action){
 if(!crypto.subtle){toast('账密功能需要 HTTPS 或本机 localhost 环境');return;}
 concealCredentials();pendingVaultAction={...action};
 const setup=!state.vault;
 $('#pinForm').reset();$('#pinError').textContent='';$('#pinConfirmation').hidden=!setup;
 $('#pinForm').elements.pinConfirm.required=setup;
 $('#pinTitle').textContent=setup?'设置六位查看密码':'输入六位查看密码';
 $('#pinDescription').textContent=setup?'设置一个六位数字密码，用于解锁本机保存的网站账密。请记住它，忘记后无法找回已加密的记录。':'验证后可查看或编辑这条记录。显示 30 秒后会自动隐藏。';
 $('#pinSubmit').textContent=setup?'设置并继续':'验证并继续';$('#pinDialog').showModal();$('#pinForm').elements.pin.focus();
}
function openCredentialEditor(site,key){
 const form=$('#credentialForm');form.reset();$('#credentialError').textContent='';$('#credentialSiteName').textContent=site.name;
 credentialSession={key,siteId:site.id};
 $('#credentialDialog').showModal();
 clearTimeout(credentialTimer);credentialTimer=setTimeout(()=>{lockVault();toast('编辑已超时，请重新验证')},120000);
}
$('#pinForm').onsubmit=async e=>{
 e.preventDefault();const form=e.target,action=pendingVaultAction,pin=form.elements.pin.value,setup=!state.vault;
 if(!action)return;
 if(!/^\d{6}$/.test(pin)){ $('#pinError').textContent='请输入六位数字。';return;}
 if(setup&&pin!==form.elements.pinConfirm.value){$('#pinError').textContent='两次输入不一致，请重新确认。';return;}
 $('#pinSubmit').disabled=true;$('#pinSubmit').textContent='正在验证…';$('#pinError').textContent='';
 try{
  const context=vaultContext();
  const result=setup?await VaultCrypto.create(pin,context):{key:await VaultCrypto.unlock(pin,state.vault,context)};
  if(pendingVaultAction!==action)return;
  const site=state.sites.find(s=>s.id===action.siteId);if(!site)throw Error('SITE_MISSING');
  let value=null;
  if(site.credentials)value=await VaultCrypto.open(result.key,site.credentials,context+':'+site.id);
  if(pendingVaultAction!==action)return;
  if(result.metadata){state.vault={...result.metadata,context};if(!save()){delete state.vault;throw Error('STORAGE')};}
  pendingVaultAction=null;$('#pinDialog').close();
  if(action.type==='edit'||!site.credentials){
   openCredentialEditor(site,result.key);
   if(value){$('#credentialForm').elements.recordUsername.value=value.username;$('#credentialForm').elements.recordPassword.value=value.password;}
   $('#credentialForm').elements.recordUsername.focus();
  }else{
   revealedCredentials.set(site.id,value);syncCredentialRows();clearTimeout(revealTimer);revealTimer=setTimeout(concealCredentials,30000);
  }
 }catch(error){if(pendingVaultAction===action)$('#pinError').textContent=error.message==='STORAGE'?'未能保存，请检查浏览器存储权限。':'密码不正确，或这条加密记录无法读取。';}
 finally{form.reset();$('#pinSubmit').disabled=false;$('#pinSubmit').textContent=state.vault?'验证并继续':'设置并继续';}
};
$('#credentialForm').onsubmit=async e=>{
 e.preventDefault();const session=credentialSession;if(!session)return;
 const form=e.target,site=state.sites.find(s=>s.id===session.siteId);if(!site)return;
 const username=form.elements.recordUsername.value.trim(),password=form.elements.recordPassword.value;
 if(!username||!password){$('#credentialError').textContent='请填写账号和密码。';return;}
 $('#credentialSubmit').disabled=true;
 try{
  const envelope=await VaultCrypto.seal(session.key,{username,password},vaultContext()+':'+site.id);
  if(credentialSession!==session)return;
  const previous=site.credentials;site.credentials=envelope;
  if(!save()){if(previous)site.credentials=previous;else delete site.credentials;$('#credentialError').textContent='保存失败，请检查浏览器存储权限。';return;}
  concealCredentials();$('#credentialDialog').close();render();toast('账密已加密保存，点击眼睛验证后查看');
 }catch{if(credentialSession===session)$('#credentialError').textContent='加密保存失败，请重试。';}
 finally{$('#credentialSubmit').disabled=false;}
};
$('#pinDialog').addEventListener('close',()=>{pendingVaultAction=null;$('#pinForm').reset();$('#pinError').textContent='';});
$('#credentialDialog').addEventListener('close',closeCredentialEditor);
document.addEventListener('visibilitychange',()=>{if(document.hidden)lockVault()});
window.addEventListener('pagehide',lockVault);
document.addEventListener('click',e=>{
 const eye=e.target.closest('[data-reveal]');
 if(eye){const site=state.sites.find(s=>s.id===eye.dataset.reveal);if(!site)return;if(revealedCredentials.has(site.id))concealCredentials();else requestVaultAccess({siteId:site.id,type:'view'});}
 const edit=e.target.closest('[data-edit-credentials]');if(edit)requestVaultAccess({siteId:edit.dataset.editCredentials,type:'edit'});
});
function renderHome(){
 const hasCourses=state.courses.length>0;
 $('#home').classList.toggle('has-subjects',hasCourses);
 $('#homeEmpty').hidden=hasCourses;
 $('#homeSubjects').hidden=!hasCourses;
 $('#homeCourseCount').textContent=`${state.courses.length} 门科目`;
 $('#homeOrder').disabled=state.courses.length<2;
 $('#homeCourseGrid').innerHTML=state.courses.map(course=>{
  const [tint,ink]=color(course),count=state.sites.filter(site=>site.course===course).length;
  return `<article class="subject-card" style="--tint:${tint};--color:${ink}"><button class="subject-open" data-view="${esc(course)}" data-home-course aria-label="进入科目 ${esc(course)}，${count} 个网站"><span class="subject-icon" aria-hidden="true">${esc(course[0])}</span><h2>${esc(course)}</h2><p>${esc(state.courseMeta[course]?.note||'把这门课的学习入口收在一起。')}</p><span class="subject-bottom"><span>${count} 个网站</span><span class="subject-enter">${count?'进入科目':'添加第一个网站'} <span aria-hidden="true">↗</span></span></span></button><button class="subject-share" data-export-course="${esc(course)}" aria-label="导出 ${esc(course)}的科目包" title="导出科目包"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M5 13v7h14v-7"/></svg></button><button class="subject-edit" data-edit-course="${esc(course)}" aria-label="编辑课程 ${esc(course)}" title="编辑科目">⋯</button></article>`;
 }).join('');
}
function navigationIcon(id){
 const paths={home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',timetable:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2"/>',tasks:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 3h6v3H9zm-1 9 2 2 5-5m-7 9h8"/>',campus:'<path d="m3 10 9-6 9 6M5 10v10h14V10M9 20v-6h6v6M2 21h20"/>',archives:'<path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6"/>',all:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'};
 return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${id==='more'?'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>':paths[id]||''}</svg></span>`;
}
function renderMobileMenu(){
 $('#mobileMenuCourses').innerHTML=state.courses.length?state.courses.map(c=>`<button data-view="${esc(c)}" data-home-course><span class="dot" style="background:${color(c)[1]}"></span><span>${esc(c)}</span><small>${state.sites.filter(s=>s.course===c).length} 个网站</small></button>`).join(''):'<p class="input-help">添加科目后，可在这里快速切换。</p>';
}
function render(){
 $('#navigation').innerHTML=[['home','首页',null],['timetable','课程表',null],['tasks','任务清单',(state.tasks||[]).filter(t=>!t.done).length],['campus','校园入口',null],['archives','学期档案',null],['all','全部网站',state.sites.length]].map(([id,name,n])=>`<button data-view="${id}" class="${view===id?'active':''}" aria-current="${view===id?'page':'false'}">${navigationIcon(id)}<span class="nav-name">${name}</span>${n===null?'':`<span class="num" data-count="${n}">${n}</span>`}</button>`).join('')+`<button class="mobile-more ${['all','archives'].includes(view)||state.courses.includes(view)?'active':''}" data-open-mobile-menu aria-haspopup="dialog" aria-controls="mobileMenu" aria-expanded="false">${navigationIcon('more')}<span class="nav-name">更多</span></button>`;
 $('#courses').innerHTML=state.courses.map(c=>`<div class="course-nav-row"><button data-view="${esc(c)}" class="${view===c?'active':''}"><span class="dot" style="background:${color(c)[1]}"></span><span class="course-name">${esc(c)}</span><span class="num">${state.sites.filter(s=>s.course===c).length}</span></button><button class="course-edit" data-edit-course="${esc(c)}" aria-label="编辑课程 ${esc(c)}" title="编辑课程">⋯</button></div>`).join('');
 $('#manageCourses').textContent=`管理课程 · ${state.courses.length}`;
 const isHome=view==='home';
 document.body.classList.toggle('timetable-view',view==='timetable');
 $('#timetable').hidden=view!=='timetable';
 document.body.classList.toggle('home-view',isHome);
 $('#home').hidden=!isHome;
 renderHome();
 const label=isHome?'首页':view==='timetable'?'课程表':view==='tasks'?'任务清单':view==='campus'?'校园入口':view==='archives'?'学期档案':view==='all'?'全部网站':view;
 $('#crumb').textContent=label;$('#sectionName').textContent=label;$('#heading').textContent=label;
 const isCourse=state.courses.includes(view);
 $('#subtitle').textContent=isCourse?(state.courseMeta[view]?.note||'这门课的网站与资料入口。'):'按科目整理的网站入口，点击卡片即可打开。';
 $('#editCurrentCourse').hidden=!isCourse;
 $('#exportCurrentCourse').hidden=!isCourse;
 $('#addCourseTask').hidden=!isCourse;
 $('#purposeFilters').innerHTML=['',...CampusCore.purposes].map(p=>`<button data-purpose-filter="${esc(p)}" aria-pressed="${purposeFilter===p}" class="${purposeFilter===p?'selected':''}">${p||'全部用途'}</button>`).join('');

 const query=$('#search').value.trim().toLowerCase();let sites=state.sites.filter(s=>(view==='all'||s.course===view)&&(!purposeFilter||s.purposes?.includes(purposeFilter))&&`${s.name} ${s.course} ${s.note} ${s.url} ${(s.purposes||[]).join(' ')}`.toLowerCase().includes(query));
 if($('#sort').value==='name')sites.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));if($('#sort').value==='newest')sites.reverse();
 if($('#sort').value==='default')sites=CampusCore.orderedSites(sites,state.siteOrder);
 $('#siteOrder').disabled=sites.length<2;
 $('#count').textContent=`${sites.length} 个`;
 $('#grid').innerHTML=sites.length?sites.map(s=>{const [t,c]=color(s.course),url=safeUrl(s.url);return `<article class="card" data-site-id="${esc(s.id)}" style="--tint:${t};--color:${c}"><div class="card-top"><div class="site-icon">${esc(s.icon||s.name[0])}</div><div><h3 class="site-name"><a class="site-link" href="${esc(url||'#')}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${esc(s.name)}（新标签页）">${esc(s.name)}</a></h3><div class="domain">${esc(url?new URL(url).hostname:'地址无效')}</div></div></div><p>${esc(s.note||'还没有备注，写下这个网站的用途吧。')}</p><div class="site-purposes">${CampusCore.cleanPurposes(s.purposes).map(p=>`<span>${esc(p)}</span>`).join('' )}</div>${credentialMarkup(s)}<div class="card-bottom"><span class="tag">${esc(s.course)}</span><div class="card-actions"><button data-detail="${esc(s.id)}" aria-label="${esc(s.name)}的详情">详情</button></div></div></article>`}).join(''):`<div class="empty"><div class="empty-symbol">▤</div><h3>${query||purposeFilter?'没有匹配的网站':isCourse?'课程已准备好，添加第一个入口吧':'这里还没有网站'}</h3><p>${query||purposeFilter?'试试其他关键词，或切换到全部用途。':'课程平台、作业入口、参考资料，都可以收在这里。'}</p>${!query&&!purposeFilter?'<button class="primary" id="emptyAdd">＋ 添加网站</button>':''}</div>`;
 if($('#emptyAdd'))$('#emptyAdd').onclick=()=>openEditor();
 if(typeof renderTimetable==='function')renderTimetable();
 if(typeof renderCampus==='function')renderCampus();
}
function openEditor(id){editing=id||null;const site=state.sites.find(s=>s.id===id),f=$('#form');f.reset();f.elements.url.setCustomValidity('');f.elements.course.innerHTML=['公共资源',...state.courses].map(c=>`<option>${esc(c)}</option>`).join('');$('#formTitle').textContent=site?'编辑网站':'添加网站';if(site){['name','url','course','note'].forEach(k=>f.elements[k].value=site[k])}else if(state.courses.includes(view))f.elements.course.value=view;$('#sitePurposeChoices').innerHTML=CampusCore.purposes.map(p=>`<label><input type="checkbox" name="purposes" value="${esc(p)}" ${site?.purposes?.includes(p)?'checked':''}><span>${esc(p)}</span></label>`).join('');renderWebsiteSuggestions();$('#editor').showModal();f.elements.name.focus();}
function detail(id){
 const site=state.sites.find(s=>s.id===id);concealCredentials();
 $('#detailContent').innerHTML=`<div class="dialog-head"><div><small>WEBSITE DETAILS</small><h2>${esc(site.name)}</h2></div><button class="close" aria-label="关闭">×</button></div><p class="detail-note">${esc(site.note||'暂无备注')}</p><div class="detail-row"><small>所属课程</small><span>${esc(site.course)}</span></div><div class="detail-row"><small>账号密码</small><span>${site.credentials?'已加密保存':'尚未记录'}</span><button class="secondary" id="detailCredentials">${site.credentials?'编辑账密':'记录账密'}</button></div><div class="detail-foot"><button class="secondary danger" id="deleteSite">删除网站</button><button class="primary" id="editSite">编辑网站</button></div>`;
 $('#detail').showModal();
 $('#detailCredentials').onclick=()=>{$('#detail').close();requestVaultAccess({siteId:id,type:'edit'})};
 $('#editSite').onclick=()=>{$('#detail').close();openEditor(id)};
 $('#deleteSite').onclick=()=>{if(confirm(`确定删除“${site.name}”？`)){concealCredentials();state.sites=state.sites.filter(x=>x.id!==id);save();render();$('#detail').close();toast('网站已删除')}};
}

document.addEventListener('click',e=>{const b=e.target.closest('[data-view],[data-detail],.close');if(!b)return;if(b.dataset.view){if(b.closest('#mobileMenu'))$('#mobileMenu').close();concealCredentials();view=b.dataset.view;if(b.hasAttribute('data-home-course')){$('#search').value='';purposeFilter='';}render();if(window.matchMedia?.('(max-width:760px)')?.matches)window.scrollTo(0,0)}if(b.dataset.detail)detail(b.dataset.detail);if(b.classList.contains('close'))b.closest('dialog').close()});
$('#add').onclick=()=>openEditor();$('#search').oninput=render;$('#sort').onchange=render;
$('#form').elements.name.oninput=renderWebsiteSuggestions;
$('#websiteSuggestions').onclick=e=>{
 const button=e.target.closest('[data-website-preset]');if(!button)return;
 const preset=commonWebsites.find(site=>site.name===button.dataset.websitePreset);if(!preset)return;
 const form=$('#form');form.elements.name.value=preset.name;form.elements.url.value=preset.url;form.elements.url.setCustomValidity('');
 renderWebsiteSuggestions();$('#websiteSuggestionStatus').textContent='已填入'+preset.name+'的网站地址，可继续修改。';form.elements.url.focus();
};
$('#form').onsubmit=e=>{e.preventDefault();const f=e.target,url=safeUrl(f.elements.url.value);if(!url){f.elements.url.setCustomValidity('请输入有效网址，例如 rjt100.com 或 https://rjt100.com');f.elements.url.reportValidity();return}const data={name:f.elements.name.value.trim(),url,course:f.elements.course.value,note:f.elements.note.value.trim(),purposes:[...f.querySelectorAll('input[name="purposes"]:checked')].map(input=>input.value)};if(!data.name)return;const s=state.sites.find(s=>s.id===editing);if(s)Object.assign(s,data);else state.sites.push({...data,id:crypto.randomUUID()});save();render();$('#editor').close();toast(s?'修改已保存':'新入口已添加')};$('#form').elements.url.oninput=e=>e.target.setCustomValidity('');
function openCourseEditor(name=null){
 editingCourse=name;courseEditorOrigin=view;const f=$('#courseForm');f.reset();$('#courseError').textContent='';$('#courseTitle').textContent=name?'编辑课程':'添加课程';$('#courseSubmit').textContent=name?'保存修改':'创建课程';
 f.elements.courseName.value=name||'';f.elements.courseNote.value=name?state.courseMeta[name]?.note||'':'';
 const selected=name?palette.indexOf(color(name)):(state.courses.length+1)%palette.length;
 $('#courseColors').innerHTML=palette.map(([t,c],i)=>`<label class="color-option" style="--swatch:${c};--pale:${t}"><input type="radio" name="courseColor" value="${i}" ${i===selected?'checked':''} aria-label="${['雾蓝','鼠尾草','陶土','灰紫','燕麦'][i]}"><span>${['雾蓝','鼠尾草','陶土','灰紫','燕麦'][i]}</span></label>`).join('');
 $('#courseEditor').showModal();f.elements.courseName.focus();
}
function renderCourseManager(){
 $('#managerOrder').disabled=state.courses.length<2;
 $('#courseList').innerHTML=state.courses.length?state.courses.map(c=>`<div class="managed-course"><span class="course-tile" style="background:${color(c)[0]};color:${color(c)[1]}">${esc(c[0])}</span><div class="managed-description"><b>${esc(c)}</b><small>${state.sites.filter(s=>s.course===c).length} 个网站${state.courseMeta[c]?.note?' · '+esc(state.courseMeta[c].note):''}</small></div><button class="secondary" data-edit-course="${esc(c)}">编辑</button><button class="remove-course" data-remove-course="${esc(c)}" aria-label="删除课程 ${esc(c)}">删除</button></div>`).join(''):'<div class="empty">还没有课程，创建你的第一门课吧。</div>';
}
$('#homeAddCourse').onclick=()=>openCourseEditor();
$('#homeAddSubject').onclick=()=>openCourseEditor();
$('#addCourse').onclick=()=>openCourseEditor();$('#addCourseMain').onclick=()=>openCourseEditor();$('#editCurrentCourse').onclick=()=>openCourseEditor(view);
$('#manageCourses').onclick=()=>{renderCourseManager();$('#courseManager').showModal()};$('#managerAddCourse').onclick=()=>openCourseEditor();
$('#courseForm').onsubmit=e=>{
 e.preventDefault();const f=e.target,name=f.elements.courseName.value.trim(),note=f.elements.courseNote.value.trim();
 const duplicate=state.courses.some(c=>c!==editingCourse&&c.toLocaleLowerCase()===name.toLocaleLowerCase());
 if(!name||duplicate||!CampusCore.validCourse(name)){ $('#courseError').textContent=!name?'请输入课程名称。':duplicate?'这门课程已经存在，请换一个名称。':'请使用 30 字以内的名称，避免系统保留名称。';f.elements.courseName.focus();return;}
 const metadata={note,color:Number(f.elements.courseColor.value)};
 if(editingCourse){const index=state.courses.indexOf(editingCourse);state.courses[index]=name;state.sites.forEach(s=>{if(s.course===editingCourse)s.course=name});(state.tasks||[]).forEach(t=>{if(t.course===editingCourse)t.course=name});delete state.courseMeta[editingCourse];if(view===editingCourse)view=name;}else{state.courses.push(name);view=courseEditorOrigin==='home'?'home':name;$('#search').value='';}
 state.courseMeta[name]=metadata;const saved=save();render();renderCourseManager();$('#courseEditor').close();if(saved)toast(editingCourse?'课程已更新，网站分类同步更新':view==='home'?'科目已添加到首页':'课程已创建，现在可以添加网站');
};
$('#courseForm').elements.courseName.oninput=()=>$('#courseError').textContent='';
document.addEventListener('click',e=>{const button=e.target.closest('[data-open-mobile-menu]');if(button){renderMobileMenu();$('#mobileMenu').showModal();button.setAttribute('aria-expanded','true')}});
$('#mobileMenu').addEventListener('close',()=>{$('[data-open-mobile-menu]')?.setAttribute('aria-expanded','false')});
$('#mobileMoreAddCourse').onclick=()=>{$('#mobileMenu').close();openCourseEditor()};
$('#mobileMoreManageCourses').onclick=()=>{$('#mobileMenu').close();renderCourseManager();$('#courseManager').showModal()};
document.addEventListener('click',e=>{
 const edit=e.target.closest('[data-edit-course]');if(edit)openCourseEditor(edit.dataset.editCourse);
 const remove=e.target.closest('[data-remove-course]');if(remove){const name=remove.dataset.removeCourse;const count=state.sites.filter(s=>s.course===name).length;$('#removeCourseName').textContent=name;$('#removeCourseMessage').textContent=`删除后，${count} 个网站将移至「公共资源」，链接和备注会保留。`;$('#removeCourseConfirm').onclick=()=>{state.courses=state.courses.filter(c=>c!==name);delete state.courseMeta[name];state.sites.forEach(s=>{if(s.course===name)s.course='公共资源'});(state.tasks||[]).forEach(t=>{if(t.course===name)t.course=''});if(view===name)view='all';save();render();renderCourseManager();$('#removeCourseDialog').close();toast('课程已删除，网站已保留至公共资源')};$('#removeCourseDialog').showModal();}
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!['home','timetable','tasks','campus','archives'].includes(view)&&!document.querySelector('dialog[open]')){e.preventDefault();$('#search').focus()}});
if(window.visualViewport){const updateDialogViewport=()=>document.documentElement.style.setProperty('--dialog-viewport-height',window.visualViewport.height+'px');updateDialogViewport();window.visualViewport.addEventListener('resize',updateDialogViewport);}
let orderSession=null,orderDrag=null;
function orderedEntries(){
 if(!orderSession)return [];
 return orderSession.kind==='courses'?state.courses.map(name=>({id:name,name,description:`${state.sites.filter(s=>s.course===name).length} 个网站`})):
  CampusCore.orderedSites(state.sites,state.siteOrder).filter(s=>orderSession.siteIds.has(s.id)).map(s=>({id:s.id,name:s.name,description:s.course+' · '+(safeUrl(s.url)?new URL(s.url).hostname:'地址无效')}));
}
function renderOrderList(){
 const items=orderedEntries(),list=$('#orderList'),scroll=list.scrollTop;
 list.innerHTML=items.map((item,i)=>`<div class="order-row" data-order-id="${esc(item.id)}" draggable="true" role="listitem" tabindex="-1"><span class="order-grip" aria-hidden="true"><svg viewBox="0 0 16 24" fill="currentColor"><circle cx="5" cy="6" r="1.5"/><circle cx="11" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/><circle cx="11" cy="18" r="1.5"/></svg></span><span class="order-number" aria-hidden="true">${i+1}</span><div class="order-description"><b>${esc(item.name)}</b><small>${esc(item.description)}</small></div><div class="order-actions"><button type="button" data-order-move="up" aria-label="上移 ${esc(item.name)}" title="上移" ${i===0?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button><button type="button" data-order-move="down" aria-label="下移 ${esc(item.name)}" title="下移" ${i===items.length-1?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button></div></div>`).join('');
 list.scrollTop=scroll;
}
function openOrder(kind){
 if(!['courses','sites'].includes(kind))return;
 const siteIds=new Set([...document.querySelectorAll('#grid [data-site-id]')].map(n=>n.dataset.siteId));
 if((kind==='courses'?state.courses.length:siteIds.size)<2){toast('至少有两项时才能调整顺序');return;}
 concealCredentials();orderSession={kind,siteIds};orderDrag=null;
 $('#orderTitle').textContent=kind==='courses'?'科目排序':'网站排序';
 $('#orderHelp').textContent=kind==='courses'?'拖动左侧手柄，或点击上移、下移。首页、侧栏和科目列表使用同一顺序，修改自动保存。':`拖动左侧手柄，或点击上移、下移。只调整当前列表中的 ${siteIds.size} 个网站，筛选外的网站保留原位置；修改后使用自定义顺序。`;
 $('#orderError').textContent='';$('#orderStatus').textContent='';renderOrderList();$('#orderDialog').showModal();
}
function commitOrder(source,target,after=false){
 if(!orderSession)return false;const entries=orderedEntries(),visible=entries.map(e=>e.id),kind=orderSession.kind;
 const current=kind==='courses'?state.courses:CampusCore.orderedSites(state.sites,state.siteOrder).map(s=>s.id),nextOrder=CampusCore.reorderSubset(current,visible,source,target,after);
 if(nextOrder.every((id,i)=>id===current[i]))return false;
 const previous=state,next={...state};
 if(kind==='courses'){
  next.courses=nextOrder;next.courseMeta={...state.courseMeta};
  for(const course of state.courses)if(!Number.isInteger(state.courseMeta[course]?.color))next.courseMeta[course]={...state.courseMeta[course],color:palette.indexOf(color(course))};
 }else next.siteOrder=nextOrder;
 state=next;if(!save()){state=previous;$('#orderStatus').textContent='';$('#orderError').textContent='顺序未保存，已保留原顺序。请检查浏览器存储空间后重试。';return false;}
 if(kind==='sites')$('#sort').value='default';
 $('#orderError').textContent='';render();if($('#courseManager').open)renderCourseManager();if($('#mobileMenu').open)renderMobileMenu();renderOrderList();
 const moved=orderedEntries(),index=moved.findIndex(item=>item.id===source);$('#orderStatus').textContent=`${moved[index].name}已移至第 ${index+1} 位，顺序已保存。`;return true;
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-order-kind]');if(button)openOrder(button.dataset.orderKind);});
$('#orderList').addEventListener('click',e=>{
 const button=e.target.closest('[data-order-move]');if(!button||button.disabled)return;
 const source=button.closest('[data-order-id]').dataset.orderId,direction=button.dataset.orderMove,entries=orderedEntries(),index=entries.findIndex(item=>item.id===source),target=entries[index+(direction==='up'?-1:1)];if(!target)return;
 if(commitOrder(source,target.id,direction==='down')){const row=[...$('#orderList').children].find(n=>n.dataset.orderId===source);(row.querySelector(`[data-order-move="${direction}"]:not(:disabled)`)||row.querySelector('button:not(:disabled)')||row).focus();}
});
function clearOrderDrag(){orderDrag=null;$('#orderList').classList.remove('is-dragging');document.querySelectorAll('#orderList .order-row').forEach(n=>n.classList.remove('drag-source','drop-before','drop-after'));}
$('#orderList').addEventListener('dragstart',e=>{
 const row=e.target.closest('[data-order-id]');if(!row||!orderSession||e.target.closest('button')){e.preventDefault();return;}
 orderDrag={id:row.dataset.orderId,session:orderSession};row.classList.add('drag-source');$('#orderList').classList.add('is-dragging');
 if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','campushub-order');}
});
$('#orderList').addEventListener('dragover',e=>{
 if(!orderDrag||orderDrag.session!==orderSession)return;const row=e.target.closest('[data-order-id]');if(!row||row.dataset.orderId===orderDrag.id)return;
 e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
 document.querySelectorAll('#orderList .order-row').forEach(n=>n.classList.remove('drop-before','drop-after'));
 const bounds=row.getBoundingClientRect();row.classList.add(e.clientY>=bounds.top+bounds.height/2?'drop-after':'drop-before');
 // Native drag keeps normal page scrolling; this also scrolls the bounded list near its edges.
 const list=$('#orderList'),edge=list.getBoundingClientRect();if(e.clientY<edge.top+44)list.scrollTop-=16;else if(e.clientY>edge.bottom-44)list.scrollTop+=16;
});
$('#orderList').addEventListener('drop',e=>{
 if(!orderDrag||orderDrag.session!==orderSession)return;e.preventDefault();const row=e.target.closest('[data-order-id]'),source=orderDrag.id;
 if(row){const bounds=row.getBoundingClientRect();commitOrder(source,row.dataset.orderId,e.clientY>=bounds.top+bounds.height/2);}clearOrderDrag();
});
$('#orderList').addEventListener('dragend',clearOrderDrag);
$('#orderDialog').addEventListener('close',()=>{clearOrderDrag();orderSession=null;$('#orderList').innerHTML='';});
render();
