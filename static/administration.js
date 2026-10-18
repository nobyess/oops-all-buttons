import {updateErrorLog} from './error-log-view.js';
import {mountUserAccess} from './user-access-manager.js';
import {mountBackupRestore} from './backup-restore.js';
import {mountSite} from './site-settings.js';
export function mountAdministration(parent,{node,button,api}) {
 const card=node('section',null,parent,{className:'card administration'});
 node('h2','Administration',card);
 const tabs=node('div',null,card,{className:'tabs'}),body=node('div',null,card);
 let closeAccess,statusView,errorVersion=0;
 let active='Users',closed=false,timer,previous,pending=false;
 const buttons=[];

 for(const title of ['Users','Access','Server Status','Backup/Restore','Site'])buttons.push(button(title,tabs,async()=>{if(closeAccess?.isDirty?.() && !await closeAccess.beforeLeave())return;active=title;render();}));
 const format=n=>Number(n || 0).toLocaleString();
 function row(parent,label,value){const item=node('div',null,parent,{className:'admin-stat'});node('span',label,item);node('strong',String(value),item);}
 async function update(){
  if(pending || closed || active!=='Server Status' || document.visibilityState==='hidden')return;
  pending=true;
  try {
   const version=errorVersion;
   const data=await api('admin/status');if(closed || active!=='Server Status')return;
   if(!statusView){
    body.replaceChildren();
    const summary=node('div',null,body,{className:'admin-stat-grid'});
    const errorHeading=node('div',null,body,{className:'admin-error-heading'});
    node('h3','Error Log',errorHeading);
    const clear=button('Clear Log',errorHeading,async()=>{
     clear.disabled=true;
     try{
      await api('admin/errors/clear',{});errorVersion++;
      if(!closed && active==='Server Status' && statusView?.errors===errors){updateErrorLog(errors,[],node);errors.scrollTop=0;clearMessage.textContent='';}
     }catch(error){if(clearMessage.isConnected)clearMessage.textContent=error.message;}
     finally{clear.disabled=false;}
    });
    const clearMessage=node('p','',body,{className:'bad'});
    node('p','Errors from this server run, newest occurrence first. Identical messages are grouped; up to 200 distinct errors are retained. Counts are occurrences, not necessarily HTTP requests.',body,{className:'hint'});
    const errors=node('div',null,body,{className:'admin-error-log'});
    node('h3','Driver Status',body);
    const drivers=node('div',null,body,{className:'admin-drivers'});
    node('p','Refreshes once per second while visible. Request counts include this page. Poll counters count scheduled read batches, not writes or discovery. CPU is server process usage relative to one core.',body,{className:'hint'});
    statusView={summary,errors,drivers};
   }
   const {summary,errors,drivers:scroll}=statusView;
   summary.replaceChildren();
   const groups={};
   for(const title of ['Server','CPU & Threads','System Memory','Requests & Errors','Polling & Project']){
    const group=node('section',null,summary,{className:'admin-summary-group'});node('h3',title,group);groups[title]=group;
   }
   const destinations={'Uptime':'Server','Database':'Server','Runtime':'Server','Process CPU (one core)':'CPU & Threads','Threads':'CPU & Threads','System RAM used':'System Memory','System RAM available':'System Memory','Requests in last second':'Requests & Errors','Errors in last second':'Requests & Errors','Total requests / errors':'Requests & Errors','Active polling clients':'Polling & Project','Tags / pages':'Polling & Project'};
   const stat=(label,value)=>row(groups[destinations[label]],label,value);
   stat('Uptime',`${Math.floor(data.uptime/3600)}h ${Math.floor(data.uptime/60)%60}m ${Math.floor(data.uptime)%60}s`);
   const cpu=previous?Math.max(0,(data.cpu_seconds-previous.cpu_seconds)/(data.uptime-previous.uptime)*100):null;
   stat('Process CPU (one core)',cpu===null?'Measuring...':cpu.toFixed(1)+'%');previous=data;
   const memory=data.memory;
   stat('System RAM used',memory?`${(memory.used_bytes/1073741824).toFixed(2)} / ${(memory.total_bytes/1073741824).toFixed(2)} GiB (${memory.used_percent.toFixed(1)}%)`:'Unavailable');
   stat('System RAM available',memory?`${(memory.available_bytes/1073741824).toFixed(2)} GiB`:'Unavailable');
   stat('Threads',data.threads);stat('Database', (data.database_bytes/1048576).toFixed(2)+' MB');
   stat('Requests in last second',format(data.requests.last_second));stat('Errors in last second',format(data.requests.errors_last_second));
   stat('Total requests / errors',`${format(data.requests.total)} / ${format(data.requests.errors)}`);
   stat('Active polling clients',data.polling.clients);stat('Tags / pages',`${data.tags} / ${data.pages}`);
   stat('Runtime',`Python ${data.python} on ${data.platform}`);
   if(version===errorVersion)updateErrorLog(errors,data.error_log || [],node);
   scroll.replaceChildren();
   for(const source of data.sources){
    const box=node('section',null,scroll,{className:'admin-driver'});
    node('h3',source.name,box);row(box,'Driver',source.kind==='pycomm3'?'PyComm3 '+(source.settings.protocol || 'logix').toUpperCase():source.kind);
    const status=node('p',source.status?.message || 'Unknown',box);status.className=source.status?.quality==='good'?'good':'bad';
    row(box,'Configured tags',source.tags.length);
    if(source.kind==='modbus'){row(box,'Modbus read / write requests',`${source.status.read_requests || 0} / ${source.status.write_requests || 0}`);}
    if(source.kind==='mqtt'){row(box,'Messages received / published',`${source.status.received || 0} / ${source.status.published || 0}`);row(box,'Topic subscriptions',source.status.subscriptions || 0);}
    if(source.status?.cov){const cov=source.status.cov;row(box,'COV active / polling fallback',`${cov.active} / ${cov.polling}`);row(box,'COV notifications',format(cov.notifications));if(cov.last_error)row(box,'Last COV subscription error',cov.last_error);}
    const stats=data.polling.sources[source.id];
    if(stats){
     row(box,'Live / background interval',`${source.settings.live ?? 0.5}s / ${source.settings.background ?? 20}s`);
     row(box,'Live / cached / bad tags',`${stats.live_tags} / ${stats.cached_tags} / ${stats.bad_tags}`);
     row(box,'Read batches / failed batches',`${format(stats.batches)} / ${format(stats.failed_batches)}`);
     row(box,'Tag reads',format(stats.tag_reads));row(box,'Last batch duration',stats.last_duration_ms===undefined?'No polls yet':stats.last_duration_ms+' ms');
     row(box,'Last poll',stats.last_poll?new Date(stats.last_poll*1000).toLocaleTimeString():'No polls yet');row(box,'Polling now',stats.busy?'Yes':'No');
    } else node('p','Values are local; no device polling.',box,{className:'hint'});
   }
  }catch(error){if(!closed && active==='Server Status'){statusView=null;body.replaceChildren();node('p',error.message,body,{className:'bad'});}}finally{pending=false;}
 }
 function render(){closeAccess?.();closeAccess=null;clearInterval(timer);previous=null;statusView=null;body.replaceChildren();buttons.forEach(b=>b.classList.toggle('active',b.textContent===active));
  if(active==='Users' || active==='Access'){closeAccess=mountUserAccess(body,{node,button,api,mode:active,onOpenRole:()=>{active='Access';render();}});}
  else if(active==='Backup/Restore'){closeAccess=mountBackupRestore(body,{node,button,api});}
  else if(active==='Site'){closeAccess=mountSite(body,{node,button,api});}
  else {node('p','Loading server status...',body);update();timer=setInterval(update,1000);}
 }
 render();const close=()=>{closed=true;closeAccess?.();clearInterval(timer);};close.isDirty=()=>Boolean(closeAccess?.isDirty?.());close.beforeLeave=()=>closeAccess?.beforeLeave?.() ?? Promise.resolve(true);return close;
}
