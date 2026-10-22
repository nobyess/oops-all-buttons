import {confirmMessage} from './message-dialog.js';
export function mountBackupRestore(parent,{node,button,api,firstRun=false,onRestore}){
 let closed=false;const downloads=new Map();
 const section=node('section',null,parent,{className:'backup-restore'});
 if(!firstRun){
  const backup=node('section',null,section,{className:'backup-section'});node('h3','Back Up',backup);
  node('p','Download pages, sources, tags, sheets, assets, images, users and access roles, alarm history, and persistent SQLite tag values.',backup);
  node('p','Backups contain account password hashes and driver credentials. Store them securely. System Memory values are temporary and are not included.',backup,{className:'hint'});
  const save=button('Download Backup',node('div',null,backup,{className:'row centered-commands'}),async()=>{save.disabled=true;show('Creating backup…');try{
   const result=await api('admin/backup',{});if(closed)return;const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();const timer=setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},60000);downloads.set(url,timer);show('Backup downloaded.');
  }catch(e){show(e.message,true);}finally{save.disabled=false;}});
 }
 const restore=node('section',null,section,{className:'backup-section'});node('h3','Restore from Backup',restore);
 node('p','Choose an Oops! All Buttons backup. Restore replaces this installation’s data after you stop and restart the server. Sign in afterward using an account from the backup.',restore);
 node('p','The current data folder is preserved on the server before replacement. Restored driver connections will resume when the server starts.',restore,{className:'hint'});
 const label=node('label',null,restore,{className:'backup-file-field'});node('span','Backup File',label);
 const file=node('input',null,label,{type:'file',accept:'.oab-backup,.zip'});
 const run=button('Restore Backup',node('div',null,restore,{className:'row centered-commands'}),async()=>{
  const selected=file.files?.[0];if(!selected)return;
  if(selected.size>64*1024*1024){show('Backup files must be 64 MiB or smaller.',true);return;}
  if(!await confirmMessage('Stage this backup for restore? The server will replace its data on the next restart. Use the accounts from the backup to sign in afterward.',{title:'Restore Backup?',confirmText:'Restore'}))return;
  run.disabled=file.disabled=true;show('Validating backup…');
  try{
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read backup file'));reader.readAsDataURL(selected);});
   if(firstRun)await onRestore({data,safety_acknowledged:true});else await api('admin/restore',{data});
   show('Backup validated and ready. Stop and restart the server to finish restoring, then sign in with an account from the backup.');
  }catch(e){show(e.message,true);run.disabled=false;file.disabled=false;}
 });run.disabled=true;file.onchange=()=>{run.disabled=!file.files?.length;};
 const status=node('p','',section,{role:'status'});
 function show(text,error=false){if(closed)return;status.textContent=text;status.className=error?'bad':'good';}
 if(!firstRun)api('admin/backup/status').then(data=>{if(data.pending)show('A backup is ready to restore. Stop and restart the server to apply it.');}).catch(e=>show(e.message,true));
 return ()=>{closed=true;for(const [url,timer] of downloads){clearTimeout(timer);URL.revokeObjectURL(url);}downloads.clear();};
}
