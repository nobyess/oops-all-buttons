import {updateErrorLog} from './error-log-view.js';
import {mountAccessManager} from './access-ui.js';
export function mountAdministration(parent,{node,button,api}) {
 const card=node('section',null,parent,{className:'card administration'});
 node('h2','Administration',card);
 const tabs=node('div',null,card,{className:'tabs'}),body=node('div',null,card);
 let closeAccess,statusView,errorVersion=0;
 let active='Users and Access',closed=false,timer,previous,pending=false;
 const buttons=[];

 for(const title of ['Users and Access','Server Status'])buttons.push(button(title,tabs,()=>{active=title;render();}));
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
   row(summary,'Uptime',`${Math.floor(data.uptime/3600)}h ${Math.floor(data.uptime/60)%60}m ${Math.floor(data.uptime)%60}s`);
   const cpu=previous?Math.max(0,(data.cpu_seconds-previous.cpu_seconds)/(data.uptime-previous.uptime)*100):null;
   row(summary,'Process CPU (one core)',cpu===null?'Measuring...':cpu.toFixed(1)+'%');previous=data;
   const memory=data.memory;
   row(summary,'System RAM used',memory?`${(memory.used_bytes/1073741824).toFixed(2)} / ${(memory.total_bytes/1073741824).toFixed(2)} GiB (${memory.used_percent.toFixed(1)}%)`:'Unavailable');
   row(summary,'System RAM available',memory?`${(memory.available_bytes/1073741824).toFixed(2)} GiB`:'Unavailable');
   row(summary,'Threads',data.threads);row(summary,'Database', (data.database_bytes/1048576).toFixed(2)+' MB');
   row(summary,'Requests in last second',format(data.requests.last_second));row(summary,'Errors in last second',format(data.requests.errors_last_second));
   row(summary,'Total requests / errors',`${format(data.requests.total)} / ${format(data.requests.errors)}`);
   row(summary,'Active polling clients',data.polling.clients);row(summary,'Tags / pages',`${data.tags} / ${data.pages}`);
   row(summary,'Runtime',`Python ${data.python} on ${data.platform}`);
   if(version===errorVersion)updateErrorLog(errors,data.error_log || [],node);
   scroll.replaceChildren();
   for(const source of data.sources){
    const box=node('section',null,scroll,{className:'admin-driver'});
    node('h3',source.name,box);row(box,'Driver',source.kind==='pycomm3'?'PyComm3 '+(source.settings.protocol || 'logix').toUpperCase():source.kind);
    const status=node('p',source.status?.message || 'Unknown',box);status.className=source.status?.quality==='good'?'good':'bad';
    row(box,'Configured tags',source.tags.length);
    if(source.kind==='modbus'){row(box,'Modbus read / write requests',`${source.status.read_requests || 0} / ${source.status.write_requests || 0}`);}
    if(source.kind==='mqtt'){row(box,'Messages received / published',`${source.status.received || 0} / ${source.status.published || 0}`);row(box,'Topic subscriptions',source.status.subscriptions || 0);}
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
  if(active==='Users and Access'){
   closeAccess=mountAccessManager(body,{node,button,api});
   node('h3','Login Sessions',body);
   const form=node('form',null,body),label=node('label','Expiry mode',form),mode=node('select',null,label);
   for(const [value,text] of [['fixed','Fixed duration after login'],['inactivity','Expire after inactivity'],['never','No automatic expiry']])node('option',text,mode,{value});
   const durationLabel=node('label','Duration (hours)',form),hours=node('input',null,durationLabel,{type:'number',min:.01,max:8760,step:'any',required:true,value:8});
   const save=node('button','Save Session Settings',form,{type:'submit',disabled:true});
   const result=node('p','Loading settings...',form,{className:'hint'});
   mode.onchange=()=>{durationLabel.hidden=mode.value==='never';};
   api('admin/session-settings').then(settings=>{if(closed || !form.isConnected)return;mode.value=settings.mode;hours.value=settings.hours;mode.onchange();save.disabled=false;result.textContent='Settings apply to existing sessions. Restarting the server still requires signing in again.';}).catch(error=>{result.textContent=error.message;});
   form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await api('admin/session-settings',{mode:mode.value,hours:Number(hours.value)});result.textContent='Session settings saved.';}catch(error){result.textContent=error.message;}finally{save.disabled=false;}};
  }
  else {node('p','Loading server status...',body);update();timer=setInterval(update,1000);}
 }
 render();return ()=>{closed=true;closeAccess?.();clearInterval(timer);};
}
