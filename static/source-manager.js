import {tagPath} from './tag-selector.js';
import {displayValue} from './value-format.js';
export const sourceManagerState={source:'',tag:'',search:''};
export function driverName(source){return source.kind==='pycomm3'?'PyComm3 '+({logix:'Logix',slc:'SLC',cip:'CIP'}[source.settings?.protocol || 'logix']):source.kind==='bacnet'?'BAC0':source.kind==='memory'?'Memory':source.kind==='mqtt'?'MQTT (Paho)':source.kind==='modbus'?'Modbus TCP':source.kind;}
export function mountSourceManager(parent,{node,button,getSources,getTags,getValues,onAddSource,onEditSource,onRemoveSource,onAddTag,onEditTag,onRemoveTag,usageList,onSelectTag,state=sourceManagerState}) {
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
 const available=()=>getSources().filter(source=>source.kind!=='sheet');
 const selectedSource=()=>available().find(source=>source.id===state.source);
 const selectedTag=()=>getTags().find(tag=>tag.id===state.tag && tag.source===state.source);
 const matches=(source,tag)=>`${source.name || source.id} ${driverName(source)} ${tag?.name || ''} ${tag?.address || ''} ${tag?tagPath(tag):''}`.toLowerCase().includes(state.search.trim().toLowerCase());
 let lastDetails='';
 function renderDetails(){
  const source=selectedSource(),tag=selectedTag(),sample=tag?getValues()[tag.id]:null;
  const signature=JSON.stringify([source,tag,sample?.quality,sample?.value,sample?.error,getTags().filter(tag=>tag.source===source?.id).length]);
  if(signature===lastDetails)return;
  lastDetails=signature;details.replaceChildren();
  sourceEdit.disabled=!source;sourceRemove.disabled=!source || Boolean(source.usage?.length);sourceRemove.title=sourceRemove.disabled && source?'Used by saved pages or sheets':'';
  tagAdd.disabled=!source;tagEdit.disabled=!tag;tagRemove.disabled=!tag || Boolean(tag.usage?.length);tagRemove.title=tag?.usage?.length?'Used by saved pages or sheets':'';
  if(tag){
   node('strong',tagPath(tag),details);
   node('p',sample?.quality==='good'?'Current value: '+displayValue(sample.value):'Current value: unavailable',details,{className:'source-manager-value'});
   node('hr',null,details);node('p','References:',details);usageList(details,tag.usage || [],true);
  }else if(source){
   node('strong',`${source.name || source.id} (${driverName(source)})`,details);
   const status=source.status || {};node('p',(status.quality==='good'?'Good':status.quality==='idle'?'Idle':'Fault')+' — '+(status.message || ''),details,{className:status.quality==='good'?'good':status.quality==='idle'?'hint':'error'});
   const info=node('dl',null,details,{className:'source-manager-info'});
   const settings=source.settings || {};
   const pairs=[['Tags',getTags().filter(tag=>tag.source===source.id).length],['Device path',settings.path],['Local interface',settings.local_ip],[['mqtt','modbus'].includes(source.kind)?'TCP port':'UDP port',settings.port],[source.kind==='modbus'?'Device host':'Broker',settings.host],['Unit ID',settings.unit_id],['Device instance',settings.device_id],['Discovery target',settings.target],['Background polling',settings.background===undefined?undefined:settings.background+' s'],['Live polling',settings.live===undefined?undefined:settings.live+' s']];
   for(const [label,value] of pairs)if(value!==undefined && value!==''){node('dt',label,info);node('dd',String(value),info);}
  }else node('p','Select a data source.',details,{className:'hint'});
 }
 function renderTags(){
  tagList.replaceChildren();const source=selectedSource();
  if(source)for(const tag of getTags().filter(tag=>tag.source===source.id && matches(source,tag)))node('option',tag.name || tag.id,tagList,{value:tag.id});
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
   const dot=node('span','●',row,{className:source.status?.quality==='good'?'good':'error'});dot.dataset.sourceDot=source.id;dot.setAttribute('aria-label',source.status?.quality==='good'?'Connected':'Not connected');dot.title=source.status?.message || '';
   node('span',`${source.name || source.id} (${driverName(source)})`,row);row.onclick=()=>selectSource(source.id);
   row.onkeydown=event=>{
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
 return {selectedTag,refresh(){for(const dot of sourceList.querySelectorAll('[data-source-dot]')){const source=available().find(source=>source.id===dot.dataset.sourceDot);if(source){dot.className=source.status?.quality==='good'?'good':'error';dot.title=source.status?.message || '';dot.setAttribute('aria-label',source.status?.quality==='good'?'Connected':'Not connected');}}renderDetails();}};
}

// Refresh device status without discarding catalog settings or references.
export function applySourceStatuses(sources,statuses){
 const byId=new Map(statuses.map(source=>[source.id,source.status]));
 for(const source of sources)if(byId.has(source.id))source.status=byId.get(source.id);
}
