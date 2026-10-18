import {confirmMessage} from './message-dialog.js';
import {applyTheme} from './theme.js';
const state={user:'',role:'',tab:'Account'};
export function mountUserAccess(parent,{node,button,api,mode,onOpenRole}){
 const area=node('div',null,parent,{className:'user-access-workspace'}),error=node('p','',area,{className:'error',role:'alert'}),columns=node('div',null,area,{className:'access-columns'});
 let closed=false,users=[],roles=[],pages=[],dirty=false,saving=false;
 const isUsers=mode==='Users';
 async function allowed(){return !dirty || await confirmMessage('Discard unsaved changes?',{title:'Unsaved Changes',confirmText:'Discard'});}
 const field=(title,parent,value='',type='text')=>{const label=node('label',title,parent);return node('input',null,label,{type,value});};
 function choice(title,parent,options,value){const label=node('label',title,parent),select=node('select',null,label);for(const [id,text]of options)node('option',text,select,{value:id});select.value=value;return select;}
 function check(title,parent,value){const label=node('label',title,parent,{className:'checkbox-row'});return node('input',null,label,{type:'checkbox',checked:Boolean(value)});}
 async function refresh(){try{[users,roles,pages]=await Promise.all([api('admin/users'),api('access/roles'),api('pages')]);if(!closed)render();}catch(e){if(!closed)error.textContent=e.message;}}
 function render(){columns.replaceChildren();dirty=false;error.textContent='';const left=node('section',null,columns),right=node('section',null,columns);
  const items=isUsers?users:roles,key=isUsers?'user':'role';if(!items.some(i=>i.id===state[key]))state[key]=items[0]?.id || '';
  node('h3',isUsers?'Users':'Access Roles',left);const list=node('select',null,left,{size:8,className:'access-listbox'});list.setAttribute('aria-label',isUsers?'Users':'Access Roles');
  for(const item of items)node('option',isUsers?item.username:item.name,list,{value:item.id});list.value=state[key];
  const commands=node('div',null,left,{className:'access-list-actions'});
  button(isUsers?'+ Add User':'+ Add Role',commands,async()=>{if(!saving && await allowed()){state[key]='';list.value='';edit(null);}});
  const remove=button('Remove',commands,async()=>{const item=items.find(i=>i.id===state[key]);if(saving || !item || !await allowed() || !await confirmMessage('Remove '+(item.username || item.name)+'?',{title:isUsers?'Remove User?':'Remove Role?',confirmText:'Remove'}))return;try{await api(isUsers?'admin/users/remove':'admin/roles/remove',{id:item.id});await refresh();}catch(e){error.textContent=e.message;}});remove.className='access-edit-button';
  list.onchange=async()=>{if(saving || !await allowed()){list.value=state[key];return;}state[key]=list.value;edit(items.find(i=>i.id===state[key]));};
  function edit(item){right.replaceChildren();dirty=false;error.textContent='';remove.disabled=!item;
   if(!isUsers){const form=node('form',null,right),name=field('Role Name',form,item?.name || '');name.required=true;name.maxLength=100;
    node('h3','Assigned Users',form);
    const filter=node('input',null,form,{type:'search',placeholder:'Filter users…',className:'assigned-users-filter'});filter.setAttribute('aria-label','Filter assigned users');
    const memberList=node('div',null,form,{className:'assigned-users-list',role:'group'});memberList.setAttribute('aria-label','Assigned Users');
    const members=users.map(user=>[user.id,check(user.username,memberList,user.roles.includes(item?.id))]);
    const empty=node('p','No matching users.',memberList,{className:'hint',hidden:true});
    filter.onchange=event=>event.stopPropagation();
    filter.oninput=event=>{event.stopPropagation();const query=filter.value.trim().toLowerCase();let shown=0;for(const [id,field]of members){const user=users.find(user=>user.id===id);const match=user.username.toLowerCase().includes(query);field.parentElement.hidden=!match;if(match)shown++;}empty.hidden=shown>0;};

    const footer=node('div',null,form,{className:'row dialog-footer'});button('Revert',footer,()=>edit(item));node('button','Save Role',footer,{type:'submit'});form.onchange=()=>dirty=true;form.oninput=()=>dirty=true;form.onsubmit=async e=>{e.preventDefault();await save(form,()=>api('admin/roles/save',{id:item?.id,name:name.value,users:members.filter(([,f])=>f.checked).map(([id])=>id)}),result=>state.role=result.id);};return;
   }
   const form=node('form',null,right),tabs=node('div',null,form,{className:'tabs user-settings-tabs'}),panels={};
   const tabButtons=[];for(const title of ['Account','Access','System']){tabButtons.push(button(title,tabs,()=>showTab(title)));panels[title]=node('section',null,form);}
   function showTab(title){state.tab=title;for(const b of tabButtons){b.classList.toggle('active',b.textContent===title);b.setAttribute('aria-selected',String(b.textContent===title));}for(const [key,panel]of Object.entries(panels))panel.hidden=key!==title;}
   const name=field('Username',panels.Account,item?.username || '');name.required=true;name.maxLength=100;
   const level=choice('Account Level',panels.Account,[['standard','Standard User'],['admin','Administrator']],item?.administrator?'admin':'standard');
   const password=field(item?'New Password (leave blank to keep current)':'Password (8+ characters)',panels.Account,'','password');password.autocomplete='new-password';password.required=!item;password.minLength=8;
   const kiosk=check('Kiosk Mode',panels.Access,item?.kiosk),page=choice('Starting Page',panels.Access,[['','Default (first page)'],...pages.map(p=>[p.id,p.name])],item?.starting_page || '');
   node('h3','Access Roles',panels.Access);const links=node('div',null,panels.Access,{className:'access-detail-links'});
   for(const role of roles.filter(role=>item?.roles.includes(role.id))){const link=button(role.name,links,async()=>{if(saving || !await allowed())return;dirty=false;state.role=role.id;await onOpenRole?.();});link.className='access-detail-link';}
   if(!links.children.length)node('p','No roles assigned.',links,{className:'hint'});

   const theme=choice('Theme',panels.System,[['system','System'],['light','Light'],['dark','Dark']],item?.theme || 'system');
   const defaultBackground=check('Use Theme Background',panels.System,!item?.app_background);
   const appBackground=field('App Background',panels.System,item?.app_background || (theme.value==='dark'?'#111923':'#f4f6f8'),'color');
   defaultBackground.onchange=()=>{appBackground.disabled=defaultBackground.checked;};defaultBackground.onchange();
   node('h3','Login Sessions',panels.System);const settings=item?.session_settings || {mode:'fixed',hours:8};
   const expiry=choice('Expiry Mode',panels.System,[['never','No automatic expiry'],['inactivity','Expire after inactivity'],['fixed','Fixed duration after login']],settings.mode),hours=field('Duration (hours)',panels.System,settings.hours,'number');hours.min=.01;hours.max=8760;hours.step='any';hours.required=true;
   expiry.onchange=()=>{hours.parentElement.hidden=expiry.value==='never';hours.disabled=expiry.value==='never';};expiry.onchange();
   const footer=node('div',null,form,{className:'row dialog-footer'});button('Revert',footer,()=>edit(item));node('button','Save User',footer,{type:'submit'});
   form.oninput=()=>dirty=true;form.onchange=()=>dirty=true;
   form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity()){const invalid=form.querySelector(':invalid');for(const [key,panel]of Object.entries(panels))if(panel.contains(invalid))showTab(key);invalid?.focus();return;}await save(form,()=>api('admin/users/save',{id:item?.id,username:name.value,password:password.value,administrator:level.value==='admin',kiosk:kiosk.checked,starting_page:page.value,theme:theme.value,app_background:defaultBackground.checked?'':appBackground.value,session_settings:{mode:expiry.value,hours:Number(hours.value)}}),result=>state.user=result.id);};
   form.noValidate=true;showTab(state.tab);
  }
  async function save(form,run,selected){if(saving)return;saving=true;for(const b of form.querySelectorAll('button'))b.disabled=true;try{selected(await run());dirty=false;const status=await api('status');applyTheme(status.user?.theme || 'system',status.user?.app_background || '');await refresh();}catch(e){error.textContent=e.message;}finally{saving=false;for(const b of form.querySelectorAll('button'))b.disabled=false;}}
  edit(items.find(i=>i.id===state[key]));
 }
 refresh();const close=()=>{closed=true;};close.isDirty=()=>dirty;close.beforeLeave=async()=>{if(!await allowed())return false;dirty=false;return true;};return close;
}
