import {displayValue} from './value-format.js';
let nextLightYakTree=0;
export function lightyakTagBrowser({source,tag,dialog,node,button,api,reload,onDone}) {
  dialog((tag?'Edit':'Add')+' LightYak tag — '+(source.name || source.id),(body,submit)=>{
    const modal=body.closest('dialog');modal.classList.add('lightyak-tag-dialog');
    let items=[],selected=null,closed=false,generation=0,preview=0,loading=false,saving=false;
    let deviceName=source.name || source.id,expanded=false,active='',visible=[];
    const prefix='lightyak-tree-'+(++nextLightYakTree),folder='device';
    const filter=node('input',null,body,{type:'search',placeholder:'Filter tags…'});
    const list=node('div',null,body,{className:'plc-tag-list lightyak-tag-tree',tabIndex:0,role:'tree'});
    filter.setAttribute('aria-label','Filter LightYak tags');list.setAttribute('aria-label','LightYak tags');
    const catalogStatus=node('p','Loading device catalog…',body,{className:'hint',role:'status'});
    const footer=submit.parentElement;
    const summary=node('div',null,null,{className:'lightyak-tag-summary'});footer.prepend(summary);
    const detail=node('strong','Select a tag.',summary,{className:'plc-selected-tag'});
    const status=node('p','Current value: —',summary,{className:'lightyak-tag-value',role:'status'});
    submit.disabled=true;
    modal.addEventListener('close',()=>{closed=true;generation++;preview++;visible=[];},{once:true});
    const signature=address=>String(address || '').split('@')[1]?.split(':').slice(1).join(':');
    const sameTarget=item=>tag && signature(item.address)===signature(tag.address);
    const unavailable=item=>item.added && !sameTarget(item);
    function paintSelection(){
      for(const entry of visible)entry.row.setAttribute('aria-selected',String(entry.key===active));
      list.setAttribute('aria-activedescendant',visible.find(entry=>entry.key===active)?.row.id || '');
    }
    function choose(item){
      if(closed || loading || saving || (item && unavailable(item)))return;
      selected=item;active=item?.address || folder;submit.disabled=!item;paintSelection();
      const revision=++preview;
      if(!item){detail.textContent='Select a tag.';detail.title='';status.textContent='Current value: —';return;}
      detail.textContent=(source.name || source.id)+'\\'+item.name;
      detail.title=`Selected device tag: ${item.name} · Target ${item.reference}:${item.property} · ${item.type} · ${item.writable?'Read/Write':'Read only'}`;
      status.textContent='Current value: Loading…';
      api('sources/preview-tag',{source:source.id,address:item.address}).then(sample=>{
        if(closed || revision!==preview)return;
        status.textContent=sample.quality==='good'?'Current value: '+displayValue(sample.value):'Current value: unavailable';status.title=sample.error || '';
      }).catch(error=>{if(!closed && revision===preview){status.textContent='Current value: unavailable';status.title=error.message;}});
    }
    function toggle(open=!expanded){
      if(loading || saving)return;
      expanded=open;
      if(!expanded && selected?.reference===0)choose(null);
      render();
    }
    function render(){
      const scroll=list.scrollTop;list.replaceChildren();visible=[];
      const search=filter.value.trim().toLowerCase();
      const matches=item=>`${item.name} ${item.type} ${item.writable?'Read/Write':'Read only'} ${item.reference}:${item.property}`.toLowerCase().includes(search);
      const system=items.filter(item=>item.reference===0 && (!search || deviceName.toLowerCase().includes(search) || matches(item)));
      const showChildren=expanded || Boolean(search && system.length);
      function row(item,index,level){
        const branch=!item,key=item?.address || folder,disabled=item?unavailable(item):false;
        const element=node('div',null,list,{className:'plc-tag-row',role:'treeitem',tabIndex:-1,id:prefix+'-'+index});
        element.setAttribute('aria-level',String(level));element.setAttribute('aria-disabled',String(disabled));
        if(branch)element.setAttribute('aria-expanded',String(showChildren));
        element.style.paddingLeft=(8+(level-1)*18)+'px';
        node('span',branch?(showChildren?'▾':'▸'):'',element,{className:'plc-tag-arrow'}).setAttribute('aria-hidden','true');
        node('span',branch?deviceName:`${item.name} · ${item.writable?'Read/Write':'Read only'}${item.added?' (Already added)':''}`,element,{className:'plc-tag-name'});
        node('span',branch?'Device tags':item.type,element,{className:'plc-tag-type'});
        element.onclick=()=>{if(disabled || loading || saving)return;choose(item);if(branch)toggle();list.focus();};
        visible.push({key,item,row:element,disabled});
      }
      if(system.length){row(null,'device',1);if(showChildren)for(const item of system)row(item,items.indexOf(item),2);}
      for(const item of items.filter(item=>item.reference!==0 && matches(item)))row(item,items.indexOf(item),1);
      if(!visible.length)node('p','No matching tags.',list,{className:'hint'});
      if(selected && !visible.some(entry=>entry.key===selected.address)){
        selected=null;preview++;submit.disabled=true;detail.textContent='Select a tag.';detail.title='';status.textContent='Current value: —';
      }
      if(!visible.some(entry=>entry.key===active))active='';
      paintSelection();list.scrollTop=scroll;
    }
    filter.oninput=()=>{render();list.scrollTop=0;if(!selected){preview++;status.textContent='Current value: —';}};
    list.onkeydown=event=>{
      if(closed || loading || saving || event.altKey || event.ctrlKey || event.metaKey || event.isComposing)return;
      const entries=visible.filter(entry=>!entry.disabled),index=entries.findIndex(entry=>entry.key===active);
      const current=entries[index];let target;
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?entries.length-1:index<0?0:Math.max(0,Math.min(entries.length-1,index+(event.key==='ArrowDown'?1:-1)));
        target=entries[next];
      }else if(event.key==='ArrowRight' && current?.key===folder){
        event.preventDefault();if(!expanded)toggle(true);else target=entries.find(entry=>entry.item?.reference===0);
      }else if(event.key==='ArrowLeft'){
        event.preventDefault();if(current?.item?.reference===0)target=entries.find(entry=>entry.key===folder);else if(current?.key===folder)toggle(false);
      }else if((event.key==='Enter' || event.key===' ') && current?.key===folder){event.preventDefault();toggle();}
      if(target){choose(target.item);target.row.scrollIntoView?.({block:'nearest'});}
    };
    async function load(refresh=false){
      const revision=++generation;selected=null;loading=true;active='';list.setAttribute('aria-busy','true');submit.disabled=true;preview++;detail.textContent='Select a tag.';status.textContent='Current value: —';catalogStatus.hidden=false;catalogStatus.textContent='Loading device catalog…';
      try{
        const result=await api('sources/browse',{source:source.id,refresh});
        if(closed || revision!==generation)return;
        items=result.items;deviceName=result.device_name || source.name || source.id;
        const matches=tag?items.filter(sameTarget):[];
        selected=matches.length===1?matches[0]:null;
        if(selected?.reference===0)expanded=true;
        active=selected?.address || '';render();catalogStatus.textContent='';catalogStatus.hidden=true;
        loading=false;if(selected)choose(selected);
      }catch(error){if(!closed && revision===generation){catalogStatus.hidden=false;catalogStatus.textContent=error.message;}}
      finally{if(!closed && revision===generation){loading=false;list.setAttribute('aria-busy','false');}}
    }
    const refresh=button('Refresh Tags',submit.parentElement,()=>load(true));footer.prepend(refresh);footer.prepend(summary);
    load();
    return async()=>{
      if(saving)return;
      if(closed || loading)throw new Error('Wait for the device catalog to finish loading');
      if(!selected || !items.includes(selected) || unavailable(selected))throw new Error('Select an available tag');
      const localName=selected.name;
      const payload={...(tag?{id:tag.id}:{}),source:source.id,name:localName,address:selected.address};
      saving=true;submit.disabled=true;list.setAttribute('aria-disabled','true');
      try{await api(tag?'tags/edit':'tags',payload);await reload();onDone();}
      finally{saving=false;if(!closed){list.setAttribute('aria-disabled','false');submit.disabled=!selected || unavailable(selected);}}
    };
  });
}
