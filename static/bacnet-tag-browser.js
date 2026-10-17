import {displayValue} from './value-format.js';
// Lazy object/property discovery; only explicitly saved scalar properties become polled tags.
export function bacnetTagBrowser({source,dialog,node,button,api,reload,onDone}) {
 dialog('Add BACnet tag — '+(source.name || source.id),(body,submit)=>{
  body.closest('dialog').classList.add('plc-tag-dialog','bacnet-tag-dialog');
  const footer=submit.parentElement,refresh=button('Refresh Devices',footer,()=>reset(true));refresh.classList.add('plc-tag-refresh');footer.insertBefore(refresh,footer.firstChild);submit.textContent='Save';submit.disabled=true;
  node('p','Expand devices, select an object, then select a property.',body,{className:'hint'});
  const filter=node('input',null,body,{type:'search',placeholder:'Filter devices, objects, or properties…',className:'plc-tag-search'});filter.setAttribute('aria-label','Filter tags');
  const columns=node('div',null,body,{className:'bacnet-tag-columns'});
  const tree=node('div',null,columns,{className:'plc-tag-list',role:'tree',tabIndex:0});tree.setAttribute('aria-label','BACnet devices and objects');
  const properties=node('div',null,columns,{className:'plc-tag-list bacnet-property-list',role:'listbox',tabIndex:0});properties.setAttribute('aria-label','Object properties');
  const status=node('p','Discovering devices…',body,{className:'hint'}),nameRow=node('div',null,body,{className:'bacnet-tag-name-row'}),selected=node('strong','Select a property.',nameRow,{className:'plc-selected-tag'}),nameField=node('div',null,nameRow,{className:'bacnet-tag-name-field'}),nameArrow=node('span','➡️',nameField,{className:'bacnet-tag-name-arrow'}),tagName=node('input',null,nameField,{type:'text',placeholder:'Tag name',required:true}),current=node('p','Current value: —',body,{role:'status'}),preview=node('pre','',body,{className:'bacnet-property-preview',hidden:true});
  nameArrow.setAttribute('aria-hidden','true');
  tagName.setAttribute('aria-label','Tag name');
  function updateSave(){submit.disabled=!selection?.available || selection.selectable===false || Boolean(selection.added) || !tagName.value.trim();}
  tagName.oninput=updateSave;
  const branches=new Map(),expanded=new Set(),propertyCache=new Map();let generation=0,propertyRevision=0,previewRevision=0,selectedObject=null,selection=null,propertyItems=[],visible=[],timestamp=null;
  const objectPath=item=>(source.name || source.id)+'\\'+item.node.split('/')[0]+(item.object?'\\'+item.type:'');
  function selectProperty(item){
   selection=item;selected.textContent=item?.path || (selectedObject?objectPath(selectedObject):'Select a property.');
   const simple=item?.available && item.selectable!==false;updateSave();
   current.textContent=!item?'Current value: —':!item.available?'Current value: unavailable':simple?'Current value: '+displayValue(item.value):'Current value: Preview only';current.title=item?.error || '';
   preview.hidden=!item?.preview;preview.textContent=item?.preview || '';
   for(const row of properties.querySelectorAll('[role="option"]'))row.setAttribute('aria-selected',String(row.dataset.address===item?.address));
   const revision=++previewRevision;
   if(simple)api('sources/preview-tag',{source:source.id,address:item.address}).then(sample=>{
    if(revision!==previewRevision || !body.isConnected)return;
    current.textContent=sample.quality==='good'?'Current value: '+displayValue(sample.value):'Current value: unavailable';current.title=sample.error || '';
   }).catch(error=>{if(revision===previewRevision && body.isConnected){current.textContent='Current value: unavailable';current.title=error.message;}});
  }
  function renderProperties(){
   const scroll=properties.scrollTop;properties.replaceChildren();const search=filter.value.trim().toLowerCase();
   const objectMatches=selectedObject && `${selectedObject.name} ${selectedObject.type}`.toLowerCase().includes(search);
   for(const item of propertyItems){
    if(search && !objectMatches && !`${item.label} ${item.property}`.toLowerCase().includes(search))continue;
    const row=node('div',null,properties,{className:'plc-tag-row bacnet-property-row',role:'option',tabIndex:-1});row.dataset.address=item.address;
    row.setAttribute('aria-selected',String(selection?.address===item.address));row.setAttribute('aria-disabled',String(!item.available || Boolean(item.added)));
    node('span',item.label+(item.added?' (Already Added)':item.selectable===false && item.available?' (Preview Only)':''),row,{className:'plc-tag-name'});node('span',item.data_type || '',row,{className:'plc-tag-type'});
    row.onclick=()=>{selectProperty(item);properties.focus();};
   }
   properties.scrollTop=scroll;
  }
  async function chooseObject(item){
   selectedObject=item;propertyItems=[];selectProperty(null);render();renderProperties();const revision=++propertyRevision,version=generation;
   if(!item?.object)return;
   node('p','Reading properties…',properties,{className:'hint'});
   try{
    let result=propertyCache.get(item.node);
    if(!result)result=await api('sources/browse',{source:source.id,node:item.node,properties:true});
    if(revision!==propertyRevision || version!==generation || !body.isConnected)return;
    propertyCache.set(item.node,result);
    propertyItems=result.items.map(prop=>({...prop,objectName:result.name,path:objectPath(item)+'\\'+prop.property}));
    status.textContent=result.warning || (result.timestamp?'Cached '+new Date(result.timestamp*1000).toLocaleString():'Select a property.');renderProperties();
   }catch(error){if(revision===propertyRevision){properties.replaceChildren();status.textContent=error.message;}}
  }
  function render(){
   const scroll=tree.scrollTop;tree.replaceChildren();visible=[];const search=filter.value.trim().toLowerCase();
   function rows(parent,depth){
    const branch=branches.get(parent);if(!branch)return;
    for(const item of branch.items){
     const propertyMatch=(propertyCache.get(item.node)?.items || []).some(p=>`${p.label} ${p.property}`.toLowerCase().includes(search));
     if(item.object && search && item.node!==selectedObject?.node && !`${item.name} ${item.node} ${item.type}`.toLowerCase().includes(search) && !propertyMatch)continue;
     const row=node('div',null,tree,{className:'plc-tag-row',role:'treeitem',tabIndex:-1});row.dataset.node=item.node;row.style.paddingLeft=(9+depth*18)+'px';row.setAttribute('aria-level',depth+1);row.setAttribute('aria-selected',String(selectedObject?.node===item.node));
     if(item.children)row.setAttribute('aria-expanded',String(expanded.has(item.node)));
     const arrow=node('span',item.children?(expanded.has(item.node)?'▾':'▸'):'',row,{className:'plc-tag-arrow'});arrow.setAttribute('aria-hidden','true');
     node('span',item.name,row,{className:'plc-tag-name'});node('span',item.type || '',row,{className:'plc-tag-type'});visible.push({item,parent,row});
     row.onclick=()=>{chooseObject(item);if(item.children)toggle(item);tree.focus();};arrow.onclick=event=>{event.stopPropagation();chooseObject(item);if(item.children)toggle(item);tree.focus();};
     if(expanded.has(item.node))rows(item.node,depth+1);
    }
    if(branch.loading || branch.items.length<branch.total){const marker=node('div',branch.loading?'Loading…':'Scroll for more…',tree,{className:'hint plc-tree-more'});marker.dataset.branch=parent;}
   }
   rows('',0);tree.scrollTop=scroll;
  }
  async function load(parent='',force=false){
   const branch=branches.get(parent) || {items:[],total:Infinity,loading:false};branches.set(parent,branch);if(branch.loading || branch.items.length>=branch.total)return;
   branch.loading=true;render();const version=generation;
   try{
    const result=await api('sources/browse',{source:source.id,node:parent,offset:branch.items.length,refresh:force});if(version!==generation || !body.isConnected)return;
    branch.items.push(...result.items.map(item=>({...item,object:item.node.includes('/'),children:!item.node.includes('/')})));branch.total=result.total;if(result.timestamp)timestamp=result.timestamp;
    status.textContent=timestamp?'Cached '+new Date(timestamp*1000).toLocaleString():result.total+' device(s) discovered.';
   }catch(error){if(version===generation){status.textContent=error.message;branch.total=branch.items.length;}}
   finally{branch.loading=false;if(version===generation && body.isConnected){render();loadVisible();}}
  }
  function loadVisible(){const rect=tree.getBoundingClientRect();for(const marker of tree.querySelectorAll('.plc-tree-more')){const bounds=marker.getBoundingClientRect();if(bounds.top<rect.bottom+40 && bounds.bottom>rect.top)load(marker.dataset.branch);}}
  function toggle(item,open=!expanded.has(item.node)){if(!item.children)return;if(open){expanded.add(item.node);if(!branches.has(item.node))load(item.node);}else{expanded.delete(item.node);if(selectedObject?.node.startsWith(item.node+'/'))chooseObject(item);}render();}
  async function reset(force=false){generation++;propertyRevision++;previewRevision++;branches.clear();expanded.clear();propertyCache.clear();selectedObject=null;propertyItems=[];selectProperty(null);renderProperties();tree.scrollTop=0;refresh.disabled=true;try{await load('',force);}finally{refresh.disabled=false;}}
  tree.onscroll=loadVisible;
  tree.onkeydown=event=>{
   const index=visible.findIndex(entry=>entry.item.node===selectedObject?.node),entry=visible[index];
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)));if(visible[next]){chooseObject(visible[next].item);visible[next].row.scrollIntoView({block:'nearest'});}}
   else if(entry && ['Enter','ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();if(entry.item.children)toggle(entry.item,event.key==='ArrowLeft'?false:true);else if(event.key!=='ArrowLeft' && propertyItems.length){selectProperty(propertyItems[0]);properties.focus();}}
  };
  properties.onkeydown=event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const shown=propertyItems.filter(item=>[...properties.querySelectorAll('[role="option"]')].some(row=>row.dataset.address===item.address)),index=shown.indexOf(selection);const next=event.key==='Home'?0:event.key==='End'?shown.length-1:Math.max(0,Math.min(shown.length-1,index+(event.key==='ArrowDown'?1:-1)));if(shown[next]){selectProperty(shown[next]);properties.querySelectorAll('[role="option"]')[next]?.scrollIntoView({block:'nearest'});}};
  filter.oninput=()=>{render();renderProperties();};reset();filter.focus();
  return async()=>{if(!selection?.available || selection.selectable===false || selection.added)throw new Error('Select an available scalar property that has not already been added');const name=tagName.value.trim();if(!name){tagName.focus();throw new Error('Tag name is required');}await api('tags',{source:source.id,address:selection.address,name});await reload();onDone();};
 });
}
