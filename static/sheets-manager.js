import {mountSheetGrid,confirmSheetSave} from './sheet-ui.js';
let selectedId='',filterText='',activeTab='sheet';
export function mountSheets(parent,{items,node,button,getSheet,saveSheet,onInterest,onTag,onAdd,onImport,onSettings,onRemove,onExport,references}){
 const card=node('section',null,parent,{className:'card sheets-workspace'});node('h2','Sheets',card);
 const search=node('input',null,card,{type:'search',placeholder:'Search sheets or filenames…',value:filterText});search.setAttribute('aria-label','Search sheets');
 const columns=node('div',null,card,{className:'sheets-columns'}),left=node('section',null,columns),right=node('section',null,columns);
 node('div','Sheets',left);const list=node('div',null,left,{className:'library-list',role:'listbox'});list.setAttribute('aria-label','Sheets');
 const commands=node('div',null,left,{className:'row'});button('+ Add Sheet',commands,()=>run(onAdd));button('Import',commands,()=>run(onImport));
 const tabs=node('div',null,right,{className:'library-detail-tabs'}),content=node('div',null,right);
 let grid=null,source=null,saving=null,closed=false,transition=false;
 async function save(ask=true){
  if(saving)return saving;if(transition)return false;if(!grid || !grid.isDirty())return true;
  transition=true;
  try{
   if(ask){const answer=await confirmSheetSave(grid.selectedCell());if(answer==='revert'){grid.revertSelected();return false;}if(!answer)return false;}
   grid.setLocked(true);
   saving=(async()=>{try{grid.setData(await saveSheet(source.id,grid.getCells()));return true;}catch(error){grid.showError(error.message);grid.formula.focus();return false;}})();
   return await saving;
  }finally{grid?.setLocked(false);saving=null;transition=false;}
 }
 async function run(fn){if(transition)return;if(await save())await fn(source);}
 function mount(){grid?.close();grid=null;content.replaceChildren();tabs.replaceChildren();
  if(!source){node('p','Add a sheet to begin.',content,{className:'hint'});return;}
  for(const [key,label]of [['sheet','Sheet'],['references',`References (${source.usage?.length || 0})`],['settings','Settings']]){
   const b=button(label,tabs,async()=>{if(transition)return;if(await save()){activeTab=key;mount();}});b.setAttribute('aria-selected',String(activeTab===key));
  }
  if(activeTab==='references'){references(content,source.usage || [],false);return;}
  if(activeTab==='settings'){node('strong',source.name,content);node('p',source.settings.filename,content);const row=node('div',null,content,{className:'row'});button('Settings',row,()=>run(onSettings));button('Export',row,()=>run(onExport));const remove=button('Remove Sheet',row,()=>run(onRemove));remove.disabled=(source.usage || []).some(use=>use.source!==source.id);return;}
  grid=mountSheetGrid(content,{source,getSheet,onInterest,onTag,editable:true,beforeLeave:()=>save(),onSave:()=>save(false)});
  grid.formula.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();grid.revertSelected();}if(e.key==='Enter'){e.preventDefault();save(false).then(ok=>{if(ok)grid.focusSelected();});}};
 }
 async function select(id){if(transition)return;if(!await save())return;if(closed)return;selectedId=id;source=items.find(s=>s.id===id);renderList();mount();}
 function renderList(){list.replaceChildren();const shown=items.filter(s=>(s.name+' '+s.settings.filename).toLowerCase().includes(filterText.toLowerCase()));
  for(const s of shown){const b=button(null,list,()=>select(s.id));b.className='library-entry';b.setAttribute('role','option');b.setAttribute('aria-selected',String(s.id===selectedId));node('span',s.name,b);node('small',s.settings.filename,b);b.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const i=shown.indexOf(s),next=e.key==='Home'?0:e.key==='End'?shown.length-1:Math.max(0,Math.min(shown.length-1,i+(e.key==='ArrowDown'?1:-1)));select(shown[next].id);};}
 }
 search.oninput=()=>{filterText=search.value;renderList();};
 function unload(e){if(grid?.isDirty()){e.preventDefault();e.returnValue='';}}window.addEventListener('beforeunload',unload);
 selectedId=items.some(s=>s.id===selectedId)?selectedId:items[0]?.id || '';source=items.find(s=>s.id===selectedId);renderList();mount();
 const close=()=>{closed=true;grid?.close();window.removeEventListener('beforeunload',unload);};close.beforeLeave=()=>save();close.isDirty=()=>Boolean(grid?.isDirty());return close;
}
