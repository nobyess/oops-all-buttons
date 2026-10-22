import {contextMenu} from './context-menu.js';
import {tagPath} from './tag-selector.js';
import {displayValue} from './value-format.js';
export const sourceManagerState={source:'',tag:'',search:''};
export function driverName(source){return source.kind==='lightyak'?'LightYak (Serial)':source.kind==='pycomm3'?'PyComm3 '+({logix:'Logix',slc:'SLC',cip:'CIP'}[source.settings?.protocol || 'logix']):source.kind==='bacnet'?'BAC0':source.kind==='simulation'?'Simulation':source.kind==='system'?'System':source.kind==='database'?'Database (SQLite)':source.kind==='memory'?'Memory':source.kind==='mqtt'?'MQTT (Paho)':source.kind==='modbus'?(source.settings?.transport==='rtu'?'Modbus RTU':'Modbus TCP'):source.kind;}
export function mountSourceManager(parent,{node,button,getSources,getTags,getValues,onAddSource,onEditSource,onRemoveSource,onAddTag,onEditTag,onRemoveTag,usageList,onSelectTag,onPauseSource,state=sourceManagerState}) {
 const card=node('section',null,parent,{className:'card wide source-manager'});
 node('h2','Data Sources & Tags',card);
 const search=node('input',null,card,{type:'search',placeholder:'Search tags, addresses, or sources…',value:state.search,className:'source-manager-search'});search.setAttribute('aria-label','Search tags, addresses, or sources');
 const columns=node('div',null,card,{className:'source-manager-columns'});
 const left=node('section',null,columns,{className:'source-manager-sources'}),right=node('section',null,columns,{className:'source-manager-tags'});
 node('div','Sources',left);const sourceList=node('div',null,left,{className:'source-manager-list',role:'listbox'});sourceList.setAttribute('aria-label','Data sources');
 const sourceCommands=node('div',null,left,{className:'row source-manager-commands'});
 button('+ Add Source',sourceCommands,onAddSource);
 const sourceEdit=button('Edit',sourceCommands,()=>onEditSource(selectedSource())),sourceRemove=button('Remove',sourceCommands,()=>onRemoveSource(selectedSource()));sourceEdit.className='push-right';
 node('div','Tags',right);const tagList=node('select',null,right,{size:12,className:'listbox source-manager-tag-list'});tagList.setAttribute('aria-label','Tags');
 const tagCommands=node('div',null,right,{className:'row source-manager-commands'});
 const tagAdd=button('+ Add Tag',tagCommands,()=>onAddTag(selectedSource())),tagEdit=button('Edit',tagCommands,()=>onEditTag(selectedTag())),tagRemove=button('Remove',tagCommands,()=>onRemoveTag(selectedTag()));tagEdit.className='push-right';
 const details=node('div',null,right,{className:'source-manager-details'});
 const available=()=>getSources().filter(source=>source.kind!=='sheet').sort((a,b)=>(b.kind==='system')-(a.kind==='system'));
 const selectedSource=()=>available().find(source=>source.id===state.source);
 const selectedTag=()=>getTags().find(tag=>tag.id===state.tag && tag.source===state.source);
 const bindingWarning=tag=>selectedSource()?.kind==='lightyak' && getValues()[tag.id]?.error?.startsWith('LightYak tag binding warning:') ? getValues()[tag.id].error : '';
 const tagLabel=tag=>(bindingWarning(tag)?'⚠ ':'')+(tag.folder?tag.folder+'\\':'')+(tag.name || tag.id);
 const matches=(source,tag)=>`${source.name || source.id} ${driverName(source)} ${tag?.name || ''} ${tag?.address || ''} ${tag?tagPath(tag):''}`.toLowerCase().includes(state.search.trim().toLowerCase());
 let lastDetails='',valueNode=null;
 function renderDetails(){
  const source=selectedSource(),tag=selectedTag(),sample=tag?getValues()[tag.id]:null;
  const signature=JSON.stringify([tag?[source?.id,source?.name]:source,tag,getTags().filter(tag=>tag.source===source?.id).length]);
  const warning=tag?bindingWarning(tag):'';
  const valueText=warning || (sample?.quality==='good'?'Current value: '+displayValue(sample.value):'Current value: unavailable');
  if(signature===lastDetails){if(valueNode){if(valueNode.textContent!==valueText)valueNode.textContent=valueText;valueNode.className=warning?'source-manager-value error':'source-manager-value';}return;}
  lastDetails=signature;details.replaceChildren();valueNode=null;
  sourceEdit.disabled=!source || source.kind==='system';sourceRemove.disabled=!source || source.kind==='system' || Boolean(source.usage?.length);sourceRemove.title=sourceRemove.disabled && source?'Used by saved pages or sheets':'';
  tagAdd.disabled=!source || source.kind==='simulation';tagEdit.disabled=!tag || tag.builtin;tagRemove.disabled=!tag || tag.builtin || Boolean(tag.usage?.length);tagRemove.title=tag?.usage?.length?'Used by saved pages or sheets':'';
  if(tag){
   node('strong',tagPath(tag),details);
   valueNode=node('p',valueText,details,{className:warning?'source-manager-value error':'source-manager-value'});
   node('hr',null,details);node('p','References:',details);usageList(details,tag.usage || [],true);
  }else if(source){
   node('strong',source.kind==='simulation'?(source.name || 'Simulation'):source.kind==='system'?'System':`${source.name || source.id} (${driverName(source)})`,details);
   const status=source.status || {};node('p',status.paused?(status.message || 'Paused'):(status.quality==='good'?'Good':status.quality==='idle'?'Idle':'Fault')+' — '+(status.message || ''),details,{className:status.paused?'hint':status.quality==='good'?'good':status.quality==='idle'?'hint':'error'});
   const info=node('dl',null,details,{className:'source-manager-info'});
   const settings=source.settings || {};
   const pairs=[['Serial port',settings.serial_port],['Baud rate',settings.baudrate],['Tags',getTags().filter(tag=>tag.source===source.id).length],['Device path',settings.path],['Local interface',settings.local_ip],[['mqtt','modbus'].includes(source.kind)?'TCP port':'UDP port',settings.port],[source.kind==='modbus'?'Device host':'Broker',settings.host],['Unit ID',settings.unit_id],['Device instance',settings.device_id],['Discovery target',settings.target],['Background polling',settings.background===undefined?undefined:settings.background+' s'],['Live polling',settings.live===undefined?undefined:settings.live+' s']];
   if(settings.transport==='rtu')pairs.push(['Serial port',settings.serial_port],['Baud rate',settings.baudrate],['Parity',settings.parity],['Stop bits',settings.stopbits],['Startup delay',(settings.startup_delay ?? 0)+' s'],['Startup remaining',status.startup_remaining_seconds?status.startup_remaining_seconds+' s':undefined],['Shared port sources',status.serial_sources],['Queued requests',status.bus_queued],['Bus requests',status.bus_requests],['Bus failures',status.bus_failures],['Last bus request',status.bus_last_duration_ms===undefined?undefined:status.bus_last_duration_ms+' ms'],['Retry after',status.retry_after_seconds===undefined?undefined:status.retry_after_seconds+' s']);
   if(status.cov)pairs.push(['COV subscriptions',status.cov.active],['COV polling fallback',status.cov.polling],['COV notifications',status.cov.notifications],['Last COV subscription error',status.cov.last_error]);
   for(const [label,value] of pairs)if(value!==undefined && value!==''){node('dt',label,info);node('dd',String(value),info);}
  }else node('p','Select a data source.',details,{className:'hint'});
 }
 function renderTags(){
  tagList.replaceChildren();const source=selectedSource();
  if(source)for(const tag of getTags().filter(tag=>tag.source===source.id && matches(source,tag)))node('option',tagLabel(tag),tagList,{value:tag.id});
  tagList.value=state.tag;renderDetails();
 }
 function selectSource(id){state.source=id;state.tag='';onSelectTag?.(null);render();}
 function render(){
  const all=available();if(!all.some(source=>source.id===state.source)){state.source=all[0]?.id || '';state.tag='';}
  sourceList.replaceChildren();
  const shown=all.filter(source=>matches(source) || getTags().some(tag=>tag.source===source.id && matches(source,tag)));
  if(shown.length && !shown.some(source=>source.id===state.source)){state.source=shown[0].id;state.tag='';onSelectTag?.(null);}
  for(const source of shown){
   const row=node('button',null,sourceList,{type:'button',role:'option',className:'source-manager-source'});row.dataset.source=source.id;row.setAttribute('aria-selected',String(source.id===state.source));
   const dot=node('span',source.status?.paused?'⏸':'●',row,{className:source.status?.paused?'source-paused':source.status?.quality==='good'?'good':'error'});dot.dataset.sourceDot=source.id;dot.setAttribute('aria-label',source.status?.paused?'Paused':source.status?.quality==='good'?'Connected':'Not connected');dot.title=source.status?.message || '';
   node('span',source.kind==='simulation'?(source.name || 'Simulation'):source.kind==='system'?'System':`${source.name || source.id} (${driverName(source)})`,row);row.onclick=()=>selectSource(source.id);
   const pausable=['pycomm3','bacnet','mqtt','modbus','lightyak','database'].includes(source.kind);
   const menu=point=>{if(!pausable || !onPauseSource)return;selectSource(source.id);const paused=Boolean(source.status?.paused);contextMenu(point,[{label:paused?'Unpause':'Pause',run:()=>onPauseSource(source,!paused)}],{label:'Data source commands'});};
   row.oncontextmenu=event=>{if(!pausable)return;event.preventDefault();menu({x:event.clientX,y:event.clientY});};
   row.onkeydown=event=>{
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=row.getBoundingClientRect();menu({x:rect.left,y:rect.bottom});return;}
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const index=shown.indexOf(source);
    const next=event.key==='Home'?0:event.key==='End'?shown.length-1:Math.max(0,Math.min(shown.length-1,index+(event.key==='ArrowDown'?1:-1)));
    selectSource(shown[next].id);sourceList.querySelectorAll('[data-source]')[next]?.focus();
   };
  }
  if(!shown.length)node('p','No matching sources.',sourceList,{className:'hint'});
  renderTags();
 }
 search.oninput=()=>{state.search=search.value;render();};
 tagList.onchange=()=>{state.tag=tagList.value;renderDetails();onSelectTag?.(selectedTag());};
 tagList.ondblclick=()=>{const tag=selectedTag();if(tag)onEditTag(tag);};
 render();
 return {selectedTag,refresh(){for(const option of tagList.children){const tag=getTags().find(tag=>tag.id===option.value);if(tag){const text=tagLabel(tag);if(option.textContent!==text)option.textContent=text;option.title=bindingWarning(tag);}}for(const dot of sourceList.querySelectorAll('[data-source-dot]')){const source=available().find(source=>source.id===dot.dataset.sourceDot);if(source){dot.textContent=source.status?.paused?'⏸':'●';dot.className=source.status?.paused?'source-paused':source.status?.quality==='good'?'good':'error';dot.title=source.status?.message || '';dot.setAttribute('aria-label',source.status?.paused?'Paused':source.status?.quality==='good'?'Connected':'Not connected');}}renderDetails();}};
}

// Refresh device status without discarding catalog settings or references.
export function applySourceStatuses(sources,statuses){
 const byId=new Map(statuses.map(source=>[source.id,source.status]));
 for(const source of sources)if(byId.has(source.id))source.status=byId.get(source.id);
}
