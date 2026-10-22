import {confirmMessage} from './message-dialog.js';
import {mountServerSettings} from './server-settings.js';
import {openContentPicker} from './content-picker.js';
import {confirmPageLeave} from './page-leave-dialog.js';
export function mountSite(parent,{node,button,api}){
 const panel=node('section',null,parent,{className:'site-settings'});
 const closeServer=mountServerSettings(panel,{node,button,api,onChange:()=>render()});
 const field=node('section',null,panel,{className:'site-logo-field'});node('h3','Login Logo',field);
 node('p','Shown above the sign-in fields. The image keeps its proportions.',field,{className:'hint'});
 const preview=node('div',null,field,{className:'site-logo-preview'}),image=node('img',null,preview,{alt:'Login logo preview',hidden:true}),empty=node('p','No logo selected.',preview,{className:'hint'});
 const label=node('label',null,field,{className:'site-logo-picker-field'});node('span','Logo Image',label);
 const file=button('Select Content…',label,async()=>{const asset=await openContentPicker({api,kind:'image'});if(asset&&!closed){selected=asset;removed=false;dirty=true;status.textContent='';render();}});
 node('p','SVG, PNG, JPEG, GIF, WebP, or BMP · Up to 5 MiB',field,{className:'hint'});
 const remove=button('Remove Logo',node('div',null,field,{className:'row centered-commands'}),()=>{selected=null;removed=true;file.value='';dirty=true;render();});
 const status=node('p','Loading site settings…',panel,{role:'status'}),commands=node('div',null,panel,{className:'row dialog-footer'});
 const revert=button('Revert',commands,()=>{selected=null;removed=false;file.value='';dirty=false;closeServer.revert();status.textContent='';render();});
 const save=button('Save',commands,()=>saveSettings());
 let current='',hasDefault=false,selected=null,removed=false,dirty=false,saving=false,closed=false,awaitingRestart=false,url='',previewSource;
 function render(){
  const hasLogo=Boolean(selected || current && !removed || hasDefault);
  image.hidden=!hasLogo;empty.hidden=hasLogo;
  const source=selected || (hasLogo?(current && !removed?'/api/site/logo':'/images/default-logo.webp'):'');
  if(source!==previewSource){if(url){URL.revokeObjectURL(url);url='';}previewSource=source;
   if(selected){if(selected.url)image.src=selected.url;else{url=URL.createObjectURL(selected);image.src=url;}}else if(hasLogo)image.src=source+'?v='+Date.now();else image.removeAttribute('src');
  }
  remove.textContent=hasDefault?'Use Default Logo':'Remove Logo';remove.disabled=!(selected || current && !removed) || saving||awaitingRestart;save.disabled=revert.disabled=!(dirty||closeServer.isDirty()) || saving||awaitingRestart;file.disabled=saving||awaitingRestart;
 }
 file.onchange=()=>{
  const next=file.files?.[0];if(!next)return;
  if(next.size>5*1024*1024){status.className='bad';status.textContent='Logo images must be 5 MiB or smaller.';file.value='';return;}
  selected=next;removed=false;dirty=true;status.textContent='';render();
 };
 async function saveSettings(){
  if(saving || !(dirty||closeServer.isDirty()))return false;
  let changes;try{changes=closeServer.data();}catch(error){status.className='bad';status.textContent=error.message;return false;}
  const consequences=[];
  if(changes.port!==undefined)consequences.push('The server will restart on port '+changes.port+'. Open the new address afterward.');
  if(changes.sign_in)consequences.push(changes.sign_in.required?'Sign-in will be required and all open sessions will be signed out.':'Sign-in will be disabled. Anyone who can reach the server will have full administrator access. All open sessions will be signed out.');
  if(consequences.length&&!await confirmMessage(consequences.join(' '),{title:'Save Site Configuration?',confirmText:'Continue'}))return false;
  if(closed)return false;saving=true;closeServer.setDisabled(true);render();status.textContent='Saving…';status.className='';
  try{
   let logo=null;
   if(selected && !selected.url){const chosen=selected;const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read logo image'));reader.readAsDataURL(chosen);});logo={name:chosen.name,data};}
   if(dirty)Object.assign(changes,selected?.url?{asset_id:selected.id}:{logo});
   const result=await api('admin/site-configuration',changes);if(closed)return true;
   if(result.logo_name!==undefined)current=result.logo_name;selected=null;removed=false;dirty=false;file.value='';closeServer.committed(changes);status.className='good';status.textContent='Site settings saved.';
   if(result.restarting){awaitingRestart=true;const destination=new URL(location.href);destination.port=String(result.port);destination.hash='';status.textContent='Server restarting. Open the new address when it is ready.';node('a','Open server on port '+result.port,panel,{href:destination.href,className:'server-restart-link'});}
   else if(result.sign_in_changed)location.reload();
   return true;
  }catch(e){status.className='bad';status.textContent=e.message;return false;}
  finally{saving=false;if(!closed){closeServer.setDisabled(awaitingRestart);render();}}
 }
 save.disabled=revert.disabled=remove.disabled=file.disabled=true;
 api('admin/site').then(data=>{if(closed)return;current=data.logo_name;hasDefault=Boolean(data.default_logo);status.textContent='';render();}).catch(e=>{if(!closed){status.className='bad';status.textContent=e.message;}});
 const close=()=>{closed=true;closeServer();if(url)URL.revokeObjectURL(url);};close.isDirty=()=>dirty||closeServer.isDirty();
 close.beforeLeave=async()=>{if(saving)return false;if(!close.isDirty())return true;const choice=await confirmPageLeave('Site settings');if(choice==='save')return saveSettings();if(choice==='discard'){dirty=false;closeServer.revert();return true;}return false;};
 return close;
}
