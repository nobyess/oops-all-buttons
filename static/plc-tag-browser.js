import {displayValue} from './value-format.js';
import {tagPath} from './tag-selector.js';
// Lazy, cached tree. Expanding a branch keeps its siblings visible.
export const plcTagName = address => address.replace(/^Program:/, '');

export function plcTagBrowser({source,dialog,node,field,button,api,reload,onDone}) {
  dialog('Add PyComm3 tag — '+(source.name || source.id),(body,submit)=> {
    body.closest('dialog').classList.add('plc-tag-dialog');
    const footer=submit.parentElement;
    const refresh=button('Refresh PLC Tags',footer,()=>reset(true));refresh.classList.add('plc-tag-refresh');
    footer.insertBefore(refresh,footer.firstChild);submit.textContent='Save';
    node('p','Expand programs, structures, and arrays to select a tag.',body,{className:'hint'});
    const columns=node('div',null,body,{className:'plc-tag-columns'});
    const browser=node('div',null,columns),details=node('div',null,columns);
    const search=node('input',null,browser,{type:'search',placeholder:'Filter tags…',className:'plc-tag-search'});
    search.setAttribute('aria-label','Filter tags');
    const list=node('div',null,browser,{className:'plc-tag-list',tabIndex:0,role:'tree'});
    list.setAttribute('aria-label','PLC tags');
    const status=node('p','Loading cached PLC tags…',browser,{className:'hint'});
    const selected=node('strong','Select a tag.',details,{className:'plc-selected-tag'});
    const current=node('p','Current value: —',details,{role:'status'});
    let selection=null,generation=0,previewRevision=0,timer,visible=[],timestamp;
    const branches=new Map(),expanded=new Set();
    function picked(item) {
      selection=item;
      for(const row of list.querySelectorAll('[role="treeitem"]'))row.setAttribute('aria-selected',String(row.dataset.address===item?.address));
      const leaf=item?.selectable && !item.added;
      submit.disabled=!leaf;
      selected.textContent=item?tagPath({source:source.id,source_name:source.name,name:plcTagName(item.address)}):'Select a tag.';
      const revision=++previewRevision;current.textContent=item?.selectable?'Current value: Loading…':'Current value: —';current.title='';
      if(item?.selectable)api('sources/preview-tag',{source:source.id,address:item.address}).then(sample=>{
        if(revision!==previewRevision || !body.isConnected)return;
        current.textContent=sample.quality==='good'?'Current value: '+displayValue(sample.value):'Current value: unavailable';
        current.title=sample.error || '';
      }).catch(error=>{if(revision===previewRevision && body.isConnected){current.textContent='Current value: unavailable';current.title=error.message;}});
    }
    function render() {
      const scroll=list.scrollTop;list.replaceChildren();visible=[];
      function rows(parent,depth) {
        const branch=branches.get(parent);
        if(!branch)return;
        for(const item of branch.items) {
          const disabled=item.added || (!item.selectable && !item.children);
          const row=node('div',null,list,{className:'plc-tag-row',role:'treeitem',tabIndex:-1});
          row.dataset.address=item.address;row.style.paddingLeft=(9+depth*18)+'px';
          row.setAttribute('aria-level',depth+1);row.setAttribute('aria-selected',String(selection?.address===item.address));
          row.setAttribute('aria-disabled',String(disabled));
          if(item.children)row.setAttribute('aria-expanded',String(expanded.has(item.address)));
          const arrow=node('span',item.children?(expanded.has(item.address)?'▾':'▸'):'',row,{className:'plc-tag-arrow','aria-hidden':'true'});
          const label=parent && item.address.startsWith(parent+'.')?item.address.slice(parent.length+1):plcTagName(item.address);
          node('span',label+(item.added?' (Already Added)':''),row,{className:'plc-tag-name'});
          node('span',item.type,row,{className:'plc-tag-type'});
          visible.push({item,parent,row});
          row.onclick=()=>{if(!disabled){picked(item);if(item.children)toggle(item);}list.focus();};
          arrow.onclick=event=>{event.stopPropagation();if(item.children){picked(item);toggle(item);}list.focus();};
          if(expanded.has(item.address))rows(item.address,depth+1);
        }
        if(branch.loading || branch.items.length<branch.total) {
          const marker=node('div',branch.loading?'Loading…':'Scroll for more…',list,{className:'hint plc-tree-more'});
          marker.dataset.branch=parent;marker.style.paddingLeft=(9+depth*18)+'px';
        }
      }
      rows('',0);list.scrollTop=scroll;
      status.textContent=timestamp?'Cached '+new Date(timestamp*1000).toLocaleString():'Loading cached PLC tags…';
    }
    async function load(parent,force=false) {
      let branch=branches.get(parent);
      if(!branch){branch={items:[],total:Infinity,loading:false};branches.set(parent,branch);}
      if(branch.loading || branch.items.length>=branch.total)return;
      const revision=generation;branch.loading=true;render();
      try {
        const result=await api('sources/browse',{source:source.id,node:parent,offset:branch.items.length,search:search.value,refresh:force,tree:true});
        if(revision!==generation || !body.isConnected)return;
        branch.items.push(...result.items);branch.total=result.total;timestamp=result.timestamp;
      } catch(error) {
        if(revision===generation)status.textContent=error.message;
        branch.loading=false;return;
      } finally {branch.loading=false;}
      if(revision===generation){render();loadVisible();}
    }
    function loadVisible() {
      const rect=list.getBoundingClientRect();
      for(const marker of list.querySelectorAll('.plc-tree-more')) {
        const bounds=marker.getBoundingClientRect();
        if(bounds.top<rect.bottom+40 && bounds.bottom>rect.top)load(marker.dataset.branch);
      }
    }
    function toggle(item,open=!expanded.has(item.address)) {
      if(!item.children)return;
      if(open){expanded.add(item.address);if(!branches.has(item.address))load(item.address);}
      else {
        expanded.delete(item.address);
        if(selection && selection.address!==item.address && (selection.address.startsWith(item.address+'.') || selection.address.startsWith(item.address+'[')))picked(item);
      }
      render();
    }
    async function reset(force=false) {
      generation++;branches.clear();expanded.clear();picked(null);list.scrollTop=0;timestamp=null;
      refresh.disabled=true;
      try {await load('',force);}finally{refresh.disabled=false;}
    }
    list.onscroll=loadVisible;
    list.onkeydown=event=> {
      const index=visible.findIndex(entry=>entry.item.address===selection?.address);
      const entry=visible[index];
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        const target=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)));
        if(visible[target]){picked(visible[target].item);visible[target].row.scrollIntoView({block:'nearest'});}
      } else if(['Enter','ArrowRight','ArrowLeft'].includes(event.key) && entry) {
        event.preventDefault();
        if(event.key==='ArrowLeft') {
          if(expanded.has(entry.item.address))toggle(entry.item,false);
          else {const parent=visible.find(row=>row.item.address===entry.parent);if(parent)picked(parent.item);}
        } else if(entry.item.children)toggle(entry.item,event.key==='ArrowRight'?true:undefined);
      }
    };
    search.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>reset(),250);};
    reset();search.focus();
    return async()=> {
      if(!selection?.selectable || selection.added)throw new Error('Select a tag that has not already been added');
      await api('tags',{name:plcTagName(selection.address),source:source.id,address:selection.address});
      await reload();onDone();
    };
  });
}
