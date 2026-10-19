// Shared selection/preview frame for Pages and Sheets.
export const libraryStates={pages:{selected:'',search:'',tab:'references'},sheets:{selected:'',search:'',cell:'A1'}};
export function mountLibrary(parent,{kind,items,node,button,describe,onAdd,onImport,onSettings,onRemove,onOpen,onView,onExport,mountPreview,showDetails,canRemove}) {
 const state=libraryStates[kind],card=node('section',null,parent,{className:'card library-manager '+kind+'-library'});
 node('h2',kind==='pages'?'Pages':'Sheets',card);
 const search=node('input',null,card,{type:'search',placeholder:kind==='pages'?'Search pages…':'Search sheets or filenames…',value:state.search,className:'library-search'});search.setAttribute('aria-label',search.placeholder);
 const columns=node('div',null,card,{className:'library-columns'}),left=node('section',null,columns,{className:'library-left'}),right=node('section',null,columns,{className:'library-right'});
 node('div',kind==='pages'?'Pages':'Sheets',left);const list=node('div',null,left,{role:'listbox',className:'library-list'});list.setAttribute('aria-label',kind==='pages'?'Pages':'Sheets');
 const commands=node('div',null,left,{className:'row library-commands'});
 button(kind==='pages'?'+ Add Page':'+ Add Sheet',commands,onAdd);button('Import',commands,onImport);
 const settings=button(kind==='pages'?'Rename':'Settings',commands,()=>onSettings(current()));settings.className='push-right';
 const remove=button('Remove',commands,()=>onRemove(current()));
 node('div',kind==='pages'?'Page preview':'Sheet preview',right);const preview=node('div',null,right,{className:'library-preview'});
 const actions=node('div',null,right,{className:'row library-commands'});
 const open=button(kind==='pages'?'Edit Page':'Open Sheet',actions,()=>onOpen(current()));
 const view=onView?button('View',actions,()=>onView(current())):null;
 const exp=button('Export',actions,()=>onExport(current()));
 const details=node('div',null,right,{className:'library-details'});let dispose,closed=false,listSignature=null;
 const current=()=>items.find(item=>item.id===state.selected);
 if(kind==='pages'){preview.tabIndex=0;preview.setAttribute('role','button');preview.setAttribute('aria-label','Edit previewed page');preview.title='Edit page';preview.onclick=()=>{if(current())onOpen(current());};preview.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(current())onOpen(current());}};} 
 function renderDetails(extra){details.replaceChildren();if(current())showDetails(details,current(),state,()=>renderDetails(extra),extra);}
 function select(id){if(id===state.selected && current() && preview.children.length)return;dispose?.();dispose=null;state.selected=id;preview.replaceChildren();render();const item=current();if(item){dispose=mountPreview(preview,item,state,extra=>{if(!closed && current()?.id===item.id)renderDetails(extra);});}renderDetails();}
 function render(){
  const shown=items.filter(item=>(item.name+' '+describe(item)).toLowerCase().includes(state.search.toLowerCase()));
  const signature=JSON.stringify(shown.map(item=>[item.id,item.name,describe(item)]));
  if(signature!==listSignature){listSignature=signature;const top=list.scrollTop;list.replaceChildren();
  for(const item of shown){const row=button(null,list,()=>select(item.id));row.libraryId=item.id;row.className='library-entry';row.setAttribute('role','option');row.setAttribute('aria-selected',String(item.id===state.selected));node('span',item.name,row);node('small',describe(item),row);row.ondblclick=()=>onOpen(item);row.onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const index=shown.indexOf(item),next=e.key==='Home'?0:e.key==='End'?shown.length-1:Math.max(0,Math.min(shown.length-1,index+(e.key==='ArrowDown'?1:-1)));select(shown[next].id);list.children[next]?.focus();};}
  if(!shown.length)node('p','No matching '+kind+'.',list,{className:'hint'});
  list.scrollTop=top;}
  for(const row of list.children)if(row.libraryId)row.setAttribute('aria-selected',String(row.libraryId===state.selected));
  for(const b of [settings,remove,open,view,exp].filter(Boolean))b.disabled=!current();
  if(current()){remove.disabled=!canRemove(current());remove.title=remove.disabled?'Used by saved pages or sheets':'';}
 }
 search.oninput=()=>{state.search=search.value;render();};
 select(items.some(item=>item.id===state.selected)?state.selected:items[0]?.id || '');
 return ()=>{closed=true;dispose?.();};
}
