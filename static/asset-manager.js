import {categoryInput} from './category-input.js';
import {promoteAsset} from './asset-promote.js';
import {assetNode as node,assetKinds,assetAccept,assetPreview,assetSize,filterAssets,saveAssetFile} from './asset-ui.js';
import {confirmMessage} from './message-dialog.js';
import {confirmPageLeave} from './page-leave-dialog.js';

function addAsset(api,categories){return new Promise(resolve=>{
 const modal=node('dialog',null,document.body,{className:'designer-dialog asset-upload-dialog'});modal.setAttribute('aria-label','Add Asset');
 const form=node('form',null,modal);node('h2','Add Asset',form);
 const type=node('select',null,node('label','Type',form));for(const [value,title] of Object.entries(assetKinds))node('option',title,type,{value});
 const file=node('input',null,node('label','File',form),{type:'file',required:true,accept:assetAccept.image});
 const name=node('input',null,node('label','Name',form),{required:true,maxLength:200});
 const category=categoryInput(form,{categories});
 const hint=node('p','Images: up to 5 MiB',form,{className:'hint'}),status=node('p','',form,{role:'status'}),footer=node('div',null,form,{className:'row dialog-footer'});
 const cancel=node('button','Cancel',footer,{type:'button'}),confirm=node('button','Add Asset',footer,{type:'submit'});confirm.dataset.dialogDefault='true';let done=false,busy=false;
 const finish=value=>{if(done)return;done=true;modal.close();modal.remove();resolve(value);};
 type.onchange=()=>{file.accept=assetAccept[type.value];file.value='';hint.textContent=assetKinds[type.value]+': up to '+(type.value==='movie'?25:5)+' MiB';};
 file.onchange=()=>{if(file.files?.[0])name.value=file.files[0].name.replace(/\.[^.]+$/,'');};
 cancel.onclick=()=>finish(null);modal.oncancel=e=>{e.preventDefault();finish(null);};modal.onclose=()=>finish(null);
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;confirm.disabled=true;status.textContent='Adding asset…';try{const item=await saveAssetFile(api,file.files[0],type.value,{name:name.value.trim(),category:category.value.trim()});finish(item);}catch(error){status.textContent=error.message;}finally{busy=false;confirm.disabled=false;}};
 modal.showModal();
});}

export function mountAssetCenter(parent,{api,onChanged}){
 const root=node('section',null,parent,{className:'asset-center'}),columns=node('div',null,root,{className:'asset-columns'}),left=node('section',null,columns,{className:'asset-left'}),right=node('section',null,columns,{className:'asset-right'});
 node('h3','Assets',left);const filters=node('div',null,left,{className:'asset-filters'}),filter=node('input',null,filters,{type:'search',placeholder:'Filter assets or filenames…'});filter.setAttribute('aria-label','Filter assets');
 const type=node('select',null,filters);type.setAttribute('aria-label','Asset type');node('option','Everything',type,{value:''});for(const [value,title] of Object.entries(assetKinds))node('option',title,type,{value});
 const list=node('div',null,left,{className:'asset-manager-list'});list.setAttribute('role','listbox');list.setAttribute('aria-label','Assets');
 const commands=node('div',null,left,{className:'asset-commands'}),add=node('button','+ Add Asset',commands,{type:'button'}),remove=node('button','Remove',commands,{type:'button'});
 const status=node('p','Loading assets…',root,{role:'status',className:'asset-status'});
 let items=[],categories=[],capabilities={can_promote:false,builtins:[]},selected='',dirty=false,closed=false,saving=false,cleanup=()=>{},currentName,currentCategory;
 function item(){return items.find(i=>i.id===selected);}
 async function save(){if(saving||!item())return false;if(!currentName.value.trim()||!currentCategory.value.trim()){status.textContent='Enter a name and category.';return false;}saving=true;root.inert=true;try{await api('assets/save',{id:selected,name:currentName.value.trim(),category:currentCategory.value.trim()});dirty=false;await load(selected,true);status.textContent='Asset saved.';return true;}catch(error){status.textContent=error.message;return false;}finally{saving=false;root.inert=false;remove.disabled=!item();}}
 async function beforeLeave(){if(saving)return false;if(!dirty)return true;const choice=await confirmPageLeave(item()?.name||'this asset');if(choice==='cancel')return false;if(choice==='save')return save();dirty=false;return true;}
 function renderList(){list.replaceChildren();for(const asset of filterAssets(items,filter.value,'',type.value)){
  const b=node('button',null,list,{type:'button',className:'asset-manager-row'});b.setAttribute('role','option');b.setAttribute('aria-selected',String(asset.id===selected));
  const info=node('span',null,b);node('span',asset.name,info);node('small',asset.filename+' · '+asset.category,info);node('small',assetKinds[asset.kind],b);
  b.onclick=async()=>{if(asset.id===selected||!await beforeLeave())return;selected=asset.id;renderList();renderDetail();};
 }if(!list.children.length)node('p','No matching assets.',list,{className:'hint'});remove.disabled=!item()||saving;}
 function renderDetail(){cleanup();right.replaceChildren();dirty=false;const asset=item();if(!asset){node('p','Add or select an asset.',right,{className:'hint'});return;}
  const tabs=node('div',null,right,{className:'tabs'}),details=node('div',null,right),references=node('div',null,right,{hidden:true});
  const buttons=[];for(const title of ['Asset','References ('+asset.references.length+')']){const b=node('button',title,tabs,{type:'button'});buttons.push(b);b.onclick=()=>{details.hidden=b!==buttons[0];references.hidden=b===buttons[0];buttons.forEach(x=>x.classList.toggle('active',x===b));};}buttons[0].classList.add('active');
  const preview=node('div',null,details,{className:'asset-detail-preview'});cleanup=assetPreview(preview,asset);
  const field=(title,value)=>node('input',null,node('label',title,details,{className:'asset-field'}),{value,maxLength:title==='Name'?200:100});
  currentName=field('Name',asset.name);currentCategory=categoryInput(details,{value:asset.category,categories});currentName.oninput=currentCategory.oninput=()=>{dirty=true;};
  const meta=node('div',null,details,{className:'asset-meta'});node('p',asset.filename+' · '+assetSize(asset.size),meta,{className:'hint'});
  const address=node('label','Served Address',details,{className:'asset-field'});node('input',null,address,{value:asset.url,readOnly:true});
  const fileCommands=node('div',null,details,{className:'asset-file-commands'});
  const replace=node('button','Replace File…',fileCommands,{type:'button'}),file=node('input',null,details,{type:'file',accept:assetAccept[asset.kind],hidden:true});replace.onclick=()=>file.click();
  file.onchange=async()=>{const chosen=file.files?.[0];if(!chosen||saving)return;saving=true;root.inert=true;replace.disabled=true;try{await saveAssetFile(api,chosen,asset.kind,{id:asset.id,name:currentName.value,category:currentCategory.value});dirty=false;await load(asset.id,true);status.textContent='File replaced. Saved references retain this asset.';}catch(error){status.textContent=error.message;}finally{saving=false;root.inert=false;remove.disabled=!item();replace.disabled=false;file.value='';}};
  if(capabilities.can_promote){
   const promote=node('button','Make Built-in…',fileCommands,{type:'button'});
   promote.onclick=async()=>{if(!await beforeLeave())return;const result=await promoteAsset(api,item(),{categories,builtins:capabilities.builtins});if(result&&!closed){await load(selected);status.textContent=result.reused?'Existing identical built-in reused.':'Built-in asset saved. Include the changed static files in your next commit.';}};
  }
  node('h3','Used by',references);if(!asset.references.length)node('p','No saved references.',references,{className:'hint'});
  for(const ref of asset.references)node(ref.page?'a':'p',ref.name,references,ref.page?{href:'#editor/'+ref.page+'/'+encodeURIComponent(ref.control)}:{});
  const footer=node('div',null,right,{className:'asset-commands asset-detail-commands'});node('button','Revert',footer,{type:'button'}).onclick=renderDetail;node('button','Save Asset',footer,{type:'button'}).onclick=save;
 }
 async function load(identity=selected,changed=false){if(changed)await onChanged?.();const [data,flags]=await Promise.all([api('assets'),api('admin/assets/capabilities')]);if(closed)return;capabilities=flags;categories=[...new Set([...data,...flags.builtins||[]].map(item=>item.category))];items=data.filter(item=>!item.builtin);selected=items.some(i=>i.id===identity)?identity:items[0]?.id||'';renderList();renderDetail();status.textContent='';}
 filter.oninput=type.onchange=renderList;
 add.onclick=async()=>{if(!await beforeLeave())return;const asset=await addAsset(api,categories);if(asset&&!closed)await load(asset.id,true);};
 remove.onclick=async()=>{const asset=item();if(!asset||saving||!await beforeLeave())return;if(asset.references.length){status.textContent='Remove saved references before deleting this asset. See References.';return;}if(!await confirmMessage('Remove '+asset.name+'?',{title:'Remove Asset',confirmText:'Remove'}))return;try{await api('assets/remove',{id:asset.id});await load(selected,true);status.textContent='Asset removed.';}catch(error){status.textContent=error.message;}};
 load().catch(error=>{if(!closed)status.textContent=error.message;});
 const close=()=>{closed=true;cleanup();};close.isDirty=()=>dirty||saving;close.beforeLeave=beforeLeave;return close;
}
