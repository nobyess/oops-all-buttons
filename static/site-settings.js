import {openContentPicker} from './content-picker.js';
import {confirmPageLeave} from './page-leave-dialog.js';
export function mountSite(parent,{node,button,api}){
 const panel=node('section',null,parent,{className:'site-settings'});
 const field=node('section',null,panel,{className:'site-logo-field'});node('h3','Login Logo',field);
 node('p','Shown above the sign-in fields. The image keeps its proportions.',field,{className:'hint'});
 const preview=node('div',null,field,{className:'site-logo-preview'}),image=node('img',null,preview,{alt:'Login logo preview',hidden:true}),empty=node('p','No logo selected.',preview,{className:'hint'});
 const label=node('label',null,field);node('span','Logo Image',label);
 const file=button('Select Content…',label,async()=>{const asset=await openContentPicker({api,kind:'image'});if(asset&&!closed){selected=asset;removed=false;dirty=true;status.textContent='';render();}});
 node('p','SVG, PNG, JPEG, GIF, WebP, or BMP · Up to 5 MiB',field,{className:'hint'});
 const remove=button('Remove Logo',field,()=>{selected=null;removed=true;file.value='';dirty=true;render();});
 const status=node('p','Loading site settings…',panel,{role:'status'}),commands=node('div',null,panel,{className:'row dialog-footer'});
 const revert=button('Revert',commands,()=>{selected=null;removed=false;file.value='';dirty=false;status.textContent='';render();});
 const save=button('Save',commands,()=>saveSettings());
 let current='',hasDefault=false,selected=null,removed=false,dirty=false,saving=false,closed=false,url='';
 function render(){
  if(url){URL.revokeObjectURL(url);url='';}
  const hasLogo=Boolean(selected || current && !removed || hasDefault);
  image.hidden=!hasLogo;empty.hidden=hasLogo;
  if(selected){if(selected.url)image.src=selected.url;else{url=URL.createObjectURL(selected);image.src=url;}}else if(hasLogo)image.src=(current && !removed?'/api/site/logo':'/images/default-logo.png')+'?v='+Date.now();else image.removeAttribute('src');
  remove.textContent=hasDefault?'Use Default Logo':'Remove Logo';remove.disabled=!(selected || current && !removed) || saving;save.disabled=revert.disabled=!dirty || saving;file.disabled=saving;
 }
 file.onchange=()=>{
  const next=file.files?.[0];if(!next)return;
  if(next.size>5*1024*1024){status.className='bad';status.textContent='Logo images must be 5 MiB or smaller.';file.value='';return;}
  selected=next;removed=false;dirty=true;status.textContent='';render();
 };
 async function saveSettings(){
  if(saving || !dirty)return false;saving=true;render();status.textContent='Saving…';status.className='';
  try{
   let logo=null;
   if(selected && !selected.url){const chosen=selected;const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read logo image'));reader.readAsDataURL(chosen);});logo={name:chosen.name,data};}
   const result=await api('admin/site',selected?.url?{asset_id:selected.id}:{logo});if(closed)return true;
   current=result.logo_name;selected=null;removed=false;dirty=false;file.value='';status.className='good';status.textContent='Site settings saved.';return true;
  }catch(e){status.className='bad';status.textContent=e.message;return false;}
  finally{saving=false;if(!closed)render();}
 }
 save.disabled=revert.disabled=remove.disabled=file.disabled=true;
 api('admin/site').then(data=>{if(closed)return;current=data.logo_name;hasDefault=Boolean(data.default_logo);status.textContent='';render();}).catch(e=>{if(!closed){status.className='bad';status.textContent=e.message;}});
 const close=()=>{closed=true;if(url)URL.revokeObjectURL(url);};close.isDirty=()=>dirty;
 close.beforeLeave=async()=>{if(saving)return false;if(!dirty)return true;const choice=await confirmPageLeave('Site settings');if(choice==='save')return saveSettings();if(choice==='discard'){dirty=false;return true;}return false;};
 return close;
}
