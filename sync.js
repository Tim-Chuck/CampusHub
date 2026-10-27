'use strict';
let syncPreview=null,syncClipboardVersion=0;
const syncLabels={courses:'门科目',sites:'个网站',tasks:'条任务',schedule:'节课程安排',campusLinks:'个校园入口',archives:'份学期档案'};
function syncCountsMarkup(data){const counts=SyncCore.counts(data);return Object.entries(syncLabels).map(([key,label])=>`<div><b>${counts[key]}</b><span>${label}</span></div>`).join('');}
function syncDate(value){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));}
function clearSyncPreview(){syncPreview=null;$('#syncPreview').hidden=true;$('#syncReplaceConsent').checked=false;$('#syncConfirm').disabled=true;$('#syncReadError').textContent='';}
function clearSyncOutput(){syncClipboardVersion++;$('#syncCodeOutput').value='';$('#syncOutput').hidden=true;$('#syncCopyStatus').textContent='';$('#syncGenerateError').textContent='';$('#syncCopy').disabled=false;}
function refreshSyncBackup(){
 $('#syncRestoreConsent').checked=false;$('#syncRestore').disabled=true;$('#syncRestoreError').textContent='';
 try{const backup=SyncCore.backup(localStorage);$('#syncRecovery').hidden=!backup;if(backup){const c=SyncCore.counts(backup.data);$('#syncBackupSummary').textContent=`${syncDate(backup.createdAt)} 导入前 · ${c.courses} 门科目、${c.sites} 个网站。仅保留最近一次导入前的完整数据。`;}}
 catch{$('#syncRecovery').hidden=true;$('#syncStatus').textContent='导入前备份暂时无法读取。';}
}
function setSyncMode(mode){const receiving=mode==='receive';$('#syncSend').hidden=receiving;$('#syncReceive').hidden=!receiving;document.querySelectorAll('[data-sync-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.syncMode===mode)));}
function openSync(){
 if($('#mobileMenu').open)$('#mobileMenu').close();lockVault();clearSyncOutput();clearSyncPreview();$('#syncCodeInput').value='';$('#syncStatus').textContent='';$('#syncRecovery').open=false;$('#syncCurrentCounts').innerHTML=syncCountsMarkup(state);$('#syncIncludeCredentials').checked=true;refreshSyncBackup();setSyncMode('send');$('#syncDialog').showModal();
}
function activateSyncState(next){
 lockVault();invalidateImport();packReadVersion++;packPreview=null;
 for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.id!=='syncDialog')dialog.close();
 state=next;view='home';purposeFilter='';$('#search').value='';taskFilter='pending';taskCourse='';campusCategory='';scheduleWeek=Schedule.monday(Schedule.today());editing=null;editingCourse=null;editingTask=null;editingCampusLink=null;editingLesson=null;activeArchive=null;
 clearSyncPreview();clearSyncOutput();$('#syncCodeInput').value='';$('#syncCurrentCounts').innerHTML=syncCountsMarkup(state);refreshSyncBackup();render();
}
document.addEventListener('click',e=>{const opener=e.target.closest('[data-open-sync]');if(opener)openSync();const mode=e.target.closest('[data-sync-mode]');if(mode)setSyncMode(mode.dataset.syncMode);});
$('#syncIncludeCredentials').onchange=clearSyncOutput;
$('#syncGenerate').onclick=()=>{
 clearSyncOutput();$('#syncStatus').textContent='';
 try{const code=SyncCore.encode(state,{includeCredentials:$('#syncIncludeCredentials').checked});$('#syncCodeOutput').value=code;$('#syncCodeSize').textContent=`${code.length.toLocaleString('zh-CN')} 个字符`;$('#syncOutput').hidden=false;$('#syncCopyStatus').textContent='复制后，在另一台设备的「同步码 → 读取同步码」中粘贴。';}
 catch(error){$('#syncGenerateError').textContent=error.message;}
};
$('#syncCopy').onclick=async()=>{
 const field=$('#syncCodeOutput'),code=field.value,version=++syncClipboardVersion;if(!code)return;
 $('#syncCopy').disabled=true;let copied=false;
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);copied=true;}}
 catch{}
 if(version!==syncClipboardVersion||!$('#syncDialog').open)return;
 if(!copied){field.focus();field.select();field.setSelectionRange(0,code.length);try{copied=Boolean(document.execCommand?.('copy'));}catch{}}
 $('#syncCopy').disabled=false;$('#syncCopyStatus').textContent=copied?'已复制。在另一台设备粘贴并读取即可。':'已选中同步码，请长按选择「复制」，或按 Ctrl+C / ⌘C。';
};
$('#syncCodeInput').maxLength=Math.floor(SyncCore.MAX_CODE*1.1);
$('#syncCodeInput').oninput=clearSyncPreview;
$('#syncRead').onclick=()=>{
 clearSyncPreview();$('#syncStatus').textContent='';
 try{const value=SyncCore.decode($('#syncCodeInput').value);syncPreview=value;$('#syncIncomingCounts').innerHTML=syncCountsMarkup(value.data);$('#syncCreatedAt').textContent=`生成于 ${syncDate(value.createdAt)}（北京时间）`;$('#syncSubjectNames').textContent=value.data.courses.length?'科目：'+value.data.courses.join('、'):'这是一份空科目空间，也可以导入。';const count=SyncCore.counts(value.data).credentials;$('#syncCredentialNotice').textContent=count?`含 ${count} 条账密密文（含档案），导入后使用来源设备的六位查看密码；本机原查看密码随备份保留。`:'未携带网站账密；替换后本机原账密仅保留在导入前备份中。';$('#syncPreview').hidden=false;}
 catch(error){$('#syncReadError').textContent=error.message;}
};
$('#syncReplaceConsent').onchange=()=>{$('#syncConfirm').disabled=!syncPreview||!$('#syncReplaceConsent').checked;};
$('#syncConfirm').onclick=()=>{
 if(!syncPreview||!$('#syncReplaceConsent').checked)return;
 try{const next=SyncCore.replace(localStorage,DEVICE_STORAGE_KEY,syncPreview.data,state);activateSyncState(next);setSyncMode('receive');$('#syncStatus').textContent='已导入，首页已更新。需要撤销时，可在上方恢复导入前的数据。';toast('数据已导入，可恢复导入前内容');}
 catch(error){$('#syncReadError').textContent=error.name==='QuotaExceededError'||error.name==='SecurityError'?'浏览器空间不足或存储不可用，未替换本机数据。请检查后重试。':'导入未完成，本机数据未替换。'+error.message;}
};
$('#syncRestoreConsent').onchange=()=>{$('#syncRestore').disabled=!$('#syncRestoreConsent').checked;};
$('#syncRestore').onclick=()=>{
 if(!$('#syncRestoreConsent').checked)return;
 try{activateSyncState(SyncCore.restore(localStorage,DEVICE_STORAGE_KEY));$('#syncStatus').textContent='已恢复导入前的数据，首页已更新。';toast('已恢复导入前的数据');}
 catch{$('#syncRestoreError').textContent='恢复未完成，当前数据与备份仍保留，请检查浏览器存储后重试。';}
};
$('#syncDialog').addEventListener('close',()=>{clearSyncPreview();clearSyncOutput();$('#syncCodeInput').value='';$('#syncIncomingCounts').innerHTML='';$('#syncSubjectNames').textContent='';$('#syncCredentialNotice').textContent='';});
